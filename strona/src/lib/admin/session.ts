import "server-only";
import { createHmac } from "node:crypto";
import { mongoConfigured } from "../mongo";
import { hit, type Hit } from "../rate-limit";
import { createToken, derivedKey, readToken, sha256, totpEnabled, totpStep } from "./auth-token";
import {
  claimTotpStepMongo,
  createSessionMongo,
  deleteAllSessionsMongo,
  deleteSessionMongo,
  hitMongo,
  sessionExistsMongo,
} from "./session-mongo";

/*
 * Sesje admina i limity logowania – port z xayez reps (src/lib/admin-session.ts).
 *
 * Gdzie są sesje (w tej kolejności):
 * - MONGODB_URI → w MongoDB (session-mongo.ts): działa na wielu instancjach, "Wyloguj wszędzie" unieważnia wszystko.
 *   Gdy baza nie odpowiada – logowanie jest odrzucane, a sesje uznawane za nieważne (nigdy "bez limitu").
 * - Vercel (albo ADMIN_SESSIONS=stateless) → bez listy sesji, ważność z podpisu tokenu.
 * - Inaczej w pamięci procesu (globalThis). Restart serwera wylogowuje – to celowe.
 *
 * Na serwerze trzymamy tylko skrót sid (sha256), nie sam token.
 * Limity: 5 nieudanych prób na IP / 15 min; globalnie 40 / 15 min, gdy 2FA jest wyłączone
 * albo gdy adres IP jest nieznany (brak TRUST_PROXY) – wtedy zawsze.
 * 2FA: każdy kod działa raz (krok czasu musi być nowszy od ostatnio użytego), max 10 złych kodów na dobę.
 */

const MAX_SESSIONS = 20;
const WINDOW_MS = 15 * 60_000;
const PER_IP = 5;
const GLOBAL = 40;
const TOTP_FAILS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60_000;

type Mem = { sessions: Map<string, number>; revoked: Set<string>; lastStep: number; loggedAt?: number };
const g = globalThis as typeof globalThis & { __grAdmin?: Mem };
const mem: Mem = (g.__grAdmin ??= { sessions: new Map(), revoked: new Set(), lastStep: 0 });
mem.revoked ??= new Set();

const sessionKey = (sid: string) => sha256(`gr-admin-sid|${sid}`);
const inMongo = () => mongoConfigured();

/** Błąd bazy do logu najwyżej raz na minutę (panel odpytuje API co kilka sekund). */
function logDbError(what: string, e: unknown) {
  const now = Date.now();
  if (mem.loggedAt && now - mem.loggedAt < 60_000) return;
  mem.loggedAt = now;
  console.error(`[admin] MongoDB: ${what}: ${e instanceof Error ? e.message : e}`);
}

/**
 * Na Vercelu bez bazy każde żądanie może trafić do innej, świeżej instancji, więc lista sesji w pamięci by nie działała
 * (logowanie wylatywałoby co chwilę). Tam sesja jest ważna po podpisie HMAC i dacie ważności (12 h) z tokenu,
 * wylogowanie kasuje cookie, a "wyloguj wszędzie" = zmiana ADMIN_SECRET. Z MongoDB to tryb niepotrzebny.
 */
export const STATELESS_SESSIONS = !mongoConfigured() && (Boolean(process.env.VERCEL) || process.env.ADMIN_SESSIONS === "stateless");

function prune(now: number) {
  for (const [k, until] of mem.sessions) if (until <= now) mem.sessions.delete(k);
}

/** Nowa sesja – zwraca token do cookie. Najstarsze sesje ponad limit są usuwane. Z MongoDB rzuca, gdy baza nie odpowiada. */
export async function createSession(): Promise<string> {
  const now = Date.now();
  const { token, sid, expires } = createToken(now);
  if (inMongo()) {
    await createSessionMongo(sessionKey(sid), expires, MAX_SESSIONS);
    return token;
  }
  prune(now);
  while (mem.sessions.size >= MAX_SESSIONS) {
    const oldest = mem.sessions.keys().next().value;
    if (oldest === undefined) break;
    mem.sessions.delete(oldest);
  }
  mem.sessions.set(sessionKey(sid), expires);
  return token;
}

/** Ważna sesja? Przy błędzie bazy – nie (zamknięte, nie otwarte). */
export async function verifySession(token: string | undefined): Promise<boolean> {
  const now = Date.now();
  const sid = readToken(token, now);
  if (!sid) return false;
  if (inMongo()) {
    try {
      return await sessionExistsMongo(sessionKey(sid), now);
    } catch (e) {
      logDbError("sprawdzenie sesji nieudane – dostęp odrzucony", e);
      return false;
    }
  }
  if (STATELESS_SESSIONS) return !mem.revoked.has(sessionKey(sid));
  return (mem.sessions.get(sessionKey(sid)) ?? 0) > now;
}

/** Usuwa sesję z tokenu. Z MongoDB rzuca przy błędzie bazy. */
export async function destroySession(token: string | undefined) {
  const sid = readToken(token, Date.now());
  if (!sid) return;
  if (inMongo()) return deleteSessionMongo(sessionKey(sid));
  mem.sessions.delete(sessionKey(sid));
  // bez listy sesji: przynajmniej ta instancja nie wpuści już tego tokenu
  if (STATELESS_SESSIONS && mem.revoked.size < 1000) mem.revoked.add(sessionKey(sid));
}

/** Unieważnia wszystkie sesje. Z MongoDB rzuca przy błędzie bazy – wtedy NIC nie zostało unieważnione. */
export async function destroyAllSessions() {
  if (inMongo()) return deleteAllSessionsMongo();
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

/** Licznik wspólny dla instancji (MongoDB) albo w pamięci tego procesu. */
const counter = (name: string, id: string, limit: number, windowMs: number, by = 1): Promise<Hit> =>
  inMongo() ? hitMongo(name, id, limit, windowMs, by) : Promise.resolve(hit(name, id, limit, windowMs, by));

// Globalny limit obowiązuje zawsze bez znanego IP; ze znanym IP – tylko bez 2FA (z 2FA chroni dobowy limit kodów,
// a globalny pozwalałby obcym blokować logowanie admina).
const globalApplies = (key: string | null) => !key || !totpEnabled();

/** Zajmuje próbę logowania przed sprawdzeniem hasła (równoległe próby też się liczą). Rzuca, gdy baza nie odpowiada. */
export async function reserveLoginAttempt(key: string | null): Promise<{ ok: boolean; retryAfter: number }> {
  if (key) {
    const own = await counter("adm-login", key, PER_IP, WINDOW_MS);
    if (!own.ok) return { ok: false, retryAfter: own.retryAfter };
  }
  if (globalApplies(key)) {
    const all = await counter("adm-login", "*", GLOBAL, WINDOW_MS);
    if (!all.ok) {
      if (key) await counter("adm-login", key, PER_IP, WINDOW_MS, -1).catch(() => {});
      return { ok: false, retryAfter: all.retryAfter };
    }
  }
  return { ok: true, retryAfter: 0 };
}

/** Udane logowanie oddaje zajętą próbę – liczą się tylko nieudane. */
export async function releaseLoginAttempt(key: string | null) {
  try {
    if (key) await counter("adm-login", key, PER_IP, WINDOW_MS, -1);
    if (globalApplies(key)) await counter("adm-login", "*", GLOBAL, WINDOW_MS, -1);
  } catch (e) {
    logDbError("oddanie próby logowania nieudane", e);
  }
}

/** Zajmuje krok 2FA (kod jednorazowy, RFC 6238 5.2): musi być nowszy niż ostatnio użyty. */
async function claimStep(step: number) {
  if (inMongo()) return claimTotpStepMongo(step);
  if (step <= mem.lastStep) return false;
  mem.lastStep = step;
  return true;
}

/** Sprawdza kod 2FA (tylko po poprawnym haśle). Zły kod zużywa jedną z 10 prób na dobę. Błąd bazy = odmowa. */
export async function consumeTotp(code: string): Promise<boolean> {
  try {
    const reserved = await counter("adm-totp", "*", TOTP_FAILS_PER_DAY, DAY_MS);
    if (!reserved.ok) {
      console.warn("[admin] dobowy limit złych kodów 2FA wyczerpany – ktoś zna hasło, zmień ADMIN_PASSWORD");
      return false;
    }
    const step = totpStep(code, Date.now());
    if (step === null || !(await claimStep(step))) {
      console.warn("[admin] poprawne hasło, ale zły albo użyty już kod 2FA");
      return false;
    }
    // dobry kod nie zużywa próby; gdyby oddanie się nie udało – trudno, kod i tak jest już zajęty
    await counter("adm-totp", "*", TOTP_FAILS_PER_DAY, DAY_MS, -1).catch(() => {});
    return true;
  } catch (e) {
    logDbError("sprawdzenie kodu 2FA nieudane – logowanie odrzucone", e);
    return false;
  }
}
