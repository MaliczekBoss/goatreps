import "server-only";
import { createHmac } from "node:crypto";
import { hit } from "../rate-limit";
import { createToken, derivedKey, readToken, sha256, totpEnabled, totpStep } from "./auth-token";

/*
 * Sesje admina i limity logowania – port z xayez reps (src/lib/admin-session.ts), bez bazy danych.
 *
 * - Sesje są w pamięci procesu (globalThis). Restart serwera wylogowuje – to celowe.
 * - Na serwerze trzymamy tylko skrót sid (sha256), nie sam token.
 * - Limity: 5 nieudanych prób na IP / 15 min; globalnie 40 / 15 min, gdy 2FA jest wyłączone
 *   albo gdy adres IP jest nieznany (brak TRUST_PROXY) – wtedy zawsze, nigdy bez limitu.
 * - 2FA: każdy kod działa raz (krok czasu musi być nowszy od ostatnio użytego), max 10 złych kodów na dobę.
 */

const MAX_SESSIONS = 20;
const WINDOW_MS = 15 * 60_000;
const PER_IP = 5;
const GLOBAL = 40;
const TOTP_FAILS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60_000;

type Mem = { sessions: Map<string, number>; revoked: Set<string>; lastStep: number };
const g = globalThis as typeof globalThis & { __grAdmin?: Mem };
const mem: Mem = (g.__grAdmin ??= { sessions: new Map(), revoked: new Set(), lastStep: 0 });
mem.revoked ??= new Set();

const sessionKey = (sid: string) => sha256(`gr-admin-sid|${sid}`);

/**
 * Na Vercelu każde żądanie może trafić do innej, świeżej instancji, więc lista sesji w pamięci by nie działała
 * (logowanie wylatywałoby co chwilę). Tam sesja jest ważna po podpisie HMAC i dacie ważności (12 h) z tokenu,
 * wylogowanie kasuje cookie, a "wyloguj wszędzie" = zmiana ADMIN_SECRET.
 */
export const STATELESS_SESSIONS = Boolean(process.env.VERCEL) || process.env.ADMIN_SESSIONS === "stateless";

function prune(now: number) {
  for (const [k, until] of mem.sessions) if (until <= now) mem.sessions.delete(k);
}

/** Nowa sesja – zwraca token do cookie. Najstarsze sesje ponad limit są usuwane. */
export function createSession(): string {
  const now = Date.now();
  prune(now);
  const { token, sid, expires } = createToken(now);
  while (mem.sessions.size >= MAX_SESSIONS) {
    const oldest = mem.sessions.keys().next().value;
    if (oldest === undefined) break;
    mem.sessions.delete(oldest);
  }
  mem.sessions.set(sessionKey(sid), expires);
  return token;
}

export function verifySession(token: string | undefined): boolean {
  const now = Date.now();
  const sid = readToken(token, now);
  if (!sid) return false;
  if (STATELESS_SESSIONS) return !mem.revoked.has(sessionKey(sid));
  return (mem.sessions.get(sessionKey(sid)) ?? 0) > now;
}

export function destroySession(token: string | undefined) {
  const sid = readToken(token, Date.now());
  if (!sid) return;
  mem.sessions.delete(sessionKey(sid));
  // bez listy sesji: przynajmniej ta instancja nie wpuści już tego tokenu
  if (STATELESS_SESSIONS && mem.revoked.size < 1000) mem.revoked.add(sessionKey(sid));
}

export function destroyAllSessions() {
  mem.sessions.clear();
}

/** Skrót adresu IP do liczników i logów – surowy adres nie trafia do pamięci liczników ani do logów. */
export function ipKey(ip: string | null): string | null {
  const key = derivedKey("ip");
  if (!ip || !key) return null;
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 24);
}

/** Krótki znacznik do logów (8 znaków skrótu IP). */
export const ipTag = (key: string | null) => (key ? key.slice(0, 8) : "ip-nieznane");

// Globalny limit obowiązuje zawsze bez znanego IP; ze znanym IP – tylko bez 2FA (z 2FA chroni dobowy limit kodów,
// a globalny pozwalałby obcym blokować logowanie admina).
const globalApplies = (key: string | null) => !key || !totpEnabled();

/** Zajmuje próbę logowania przed sprawdzeniem hasła (równoległe próby też się liczą). */
export function reserveLoginAttempt(key: string | null): { ok: boolean; retryAfter: number } {
  if (key) {
    const own = hit("adm-login", key, PER_IP, WINDOW_MS);
    if (!own.ok) return { ok: false, retryAfter: own.retryAfter };
  }
  if (globalApplies(key)) {
    const all = hit("adm-login", "*", GLOBAL, WINDOW_MS);
    if (!all.ok) {
      if (key) hit("adm-login", key, PER_IP, WINDOW_MS, -1);
      return { ok: false, retryAfter: all.retryAfter };
    }
  }
  return { ok: true, retryAfter: 0 };
}

/** Udane logowanie oddaje zajętą próbę – liczą się tylko nieudane. */
export function releaseLoginAttempt(key: string | null) {
  if (key) hit("adm-login", key, PER_IP, WINDOW_MS, -1);
  if (globalApplies(key)) hit("adm-login", "*", GLOBAL, WINDOW_MS, -1);
}

/** Sprawdza kod 2FA (tylko po poprawnym haśle). Zły kod zużywa jedną z 10 prób na dobę. */
export function consumeTotp(code: string): boolean {
  const reserved = hit("adm-totp", "*", TOTP_FAILS_PER_DAY, DAY_MS);
  if (!reserved.ok) {
    console.warn("[admin] dobowy limit złych kodów 2FA wyczerpany – ktoś zna hasło, zmień ADMIN_PASSWORD");
    return false;
  }
  const step = totpStep(code, Date.now());
  // kod jednorazowy: krok musi być nowszy niż ostatnio użyty (RFC 6238, 5.2)
  if (step === null || step <= mem.lastStep) {
    console.warn("[admin] poprawne hasło, ale zły albo użyty już kod 2FA");
    return false;
  }
  mem.lastStep = step;
  hit("adm-totp", "*", TOTP_FAILS_PER_DAY, DAY_MS, -1);
  return true;
}
