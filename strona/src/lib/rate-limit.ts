import "server-only";
import { isIP } from "node:net";

// Prosty limit zapytań w pamięci procesu (okno stałe). Wystarcza dla jednego serwera za Cloudflare.
type Bucket = { count: number; reset: number };
type Counter = { n: number; until: number };
type State = {
  buckets: Map<string, Bucket>;
  /** Liczniki hit() (logowanie, 2FA, limity globalne) – osobno, żeby zalew innych zapytań ich nie wypchnął. */
  counters?: Map<string, Counter>;
  sweeper?: ReturnType<typeof setInterval>;
  warned?: boolean;
};

const MAX_KEYS = 20_000;
const MAX_COUNTERS = 50_000;
const g = globalThis as typeof globalThis & { __grLimits?: State };
const state: State = (g.__grLimits ??= { buckets: new Map<string, Bucket>() });
const counters = (state.counters ??= new Map<string, Counter>());

// Wygasłe liczniki sprząta timer w tle, a nie każde żądanie.
state.sweeper ??= (() => {
  const t = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of state.buckets) if (b.reset <= now) state.buckets.delete(k);
    const cs = state.counters;
    if (cs) for (const [k, c] of cs) if (c.until <= now) cs.delete(k);
  }, 30_000);
  t.unref?.();
  return t;
})();

// Ufamy tylko nagłówkom, których klient nie może dopisać sam za Cloudflare / reverse proxy.
const TRUSTED_HEADERS = new Set(["cf-connecting-ip", "x-real-ip"]);

/** Adres IPv6 skracamy do /64 – jeden użytkownik ma zwykle całą taką pulę. */
function normalizeIp(ip: string) {
  if (isIP(ip) === 6) return ip.toLowerCase().split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

type HeaderSource = { get(name: string): string | null };

/**
 * Adres odwiedzającego z nagłówka wskazanego w TRUST_PROXY – wersja dla akcji serwera (`await headers()`).
 * Zwraca null, gdy TRUST_PROXY nie jest ustawione albo wartość nie jest poprawnym adresem IP.
 */
export function clientIpFrom(headers: HeaderSource): string | null {
  const header = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  if (!TRUSTED_HEADERS.has(header)) return null;
  const value = headers.get(header)?.trim() ?? "";
  return isIP(value) ? normalizeIp(value) : null;
}

/**
 * Adres odwiedzającego z nagłówka wskazanego w TRUST_PROXY (np. cf-connecting-ip).
 * Zwraca null, gdy TRUST_PROXY nie jest ustawione albo wartość nie jest poprawnym adresem IP.
 */
export function clientIp(request: Request): string | null {
  return clientIpFrom(request.headers);
}

export type Hit = { ok: boolean; count: number; retryAfter: number };

/**
 * Licznik w stałym oknie, jak hit() w xayez: `by = 1` zajmuje próbę, `by = -1` ją oddaje (np. po udanym logowaniu).
 * Gdy liczników jest za dużo, nowy nie powstaje i wynik to `ok: false` – przy zalewie odmawiamy, a nie przepuszczamy.
 */
export function hit(name: string, id: string, limit: number, windowMs: number, by = 1): Hit {
  const now = Date.now();
  const slot = Math.floor(now / windowMs);
  const until = (slot + 1) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((until - now) / 1000));
  const key = `${name}:${id}:${slot}`;
  let c = counters.get(key);
  if (!c) {
    if (by <= 0) return { ok: true, count: 0, retryAfter };
    if (counters.size >= MAX_COUNTERS) {
      for (const [k, v] of counters) if (v.until <= now) counters.delete(k);
      if (counters.size >= MAX_COUNTERS) return { ok: false, count: limit + 1, retryAfter };
    }
    counters.set(key, (c = { n: 0, until }));
  }
  c.n = Math.max(0, c.n + by);
  return { ok: c.n <= limit, count: c.n, retryAfter };
}

export function rateLimit(request: Request, name: string, limit: number, windowMs: number) {
  const ip = clientIp(request);
  if (!ip) {
    // Bez zaufanego adresu wszyscy wyglądaliby jak jeden użytkownik – wtedy limit zostawiamy Cloudflare.
    if (process.env.NODE_ENV === "production" && !state.warned) {
      state.warned = true;
      console.error("[limit] TRUST_PROXY nie jest ustawione (cf-connecting-ip) – limity zapytań są wyłączone.");
    }
    return { ok: true, retryAfter: 0 };
  }
  const key = `${name}:${ip}`;
  const now = Date.now();
  const bucket = state.buckets.get(key);
  if (!bucket || bucket.reset <= now) {
    if (state.buckets.size >= MAX_KEYS) {
      // Map trzyma kolejność dodania – usuwamy najstarsze wpisy
      const drop = state.buckets.size - MAX_KEYS + 1;
      let i = 0;
      for (const k of state.buckets.keys()) {
        state.buckets.delete(k);
        if (++i >= drop) break;
      }
    }
    state.buckets.delete(key);
    state.buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count++;
  return bucket.count > limit
    ? { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) }
    : { ok: true, retryAfter: 0 };
}

export function tooMany(retryAfter: number) {
  return Response.json(
    { error: "Za dużo zapytań. Spróbuj za chwilę." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
