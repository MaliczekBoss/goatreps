import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Logowanie do panelu admina – port z xayez reps (src/lib/auth-token.ts).
// Token w cookie: v1.<losowy sid>.<ważny do>.<HMAC-SHA256 z ADMIN_SECRET>; sesja musi też istnieć na serwerze.

export const SESSION_MAX_AGE_S = 60 * 60 * 12;

const production = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = production ? "__Host-gr_admin" : "gr_admin";

export const sessionCookie = {
  httpOnly: true,
  secure: production,
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_S,
};

const MIN_PASSWORD = 8;
const MIN_SECRET = 12;
const MAX_INPUT = 200;
const SID = /^[A-Za-z0-9_-]{43}$/;
const EXPIRES = /^\d{13}$/;

function password() {
  const p = process.env.ADMIN_PASSWORD ?? "";
  return p.length >= MIN_PASSWORD && p.length <= MAX_INPUT ? p : null;
}

function secret() {
  const s = process.env.ADMIN_SECRET ?? "";
  // Klucz HMAC nie może być hasłem – wyciek jednego nie może dawać drugiego.
  return s.length >= MIN_SECRET && s !== process.env.ADMIN_PASSWORD ? s : null;
}

/** Hasło i klucz ustawione poprawnie, a jeśli jest ADMIN_TOTP_SECRET – też poprawny. */
export const adminConfigured = () => password() !== null && secret() !== null && totpState() !== "invalid";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Porównanie w stałym czasie (skróty mają zawsze tę samą długość). */
export const safeEqual = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/** Klucz pochodny z ADMIN_SECRET do innego celu (np. skróty adresów IP) – sam ADMIN_SECRET nie wychodzi poza podpis tokenu. */
export function derivedKey(purpose: string): Buffer | null {
  const key = secret();
  return key ? createHmac("sha256", key).update(`goatreps|${purpose}`).digest() : null;
}

const sign = (payload: string, key: string) => createHmac("sha256", key).update(`gr-admin|${payload}`).digest("base64url");

export function createToken(now: number) {
  const key = secret();
  if (!key) throw new Error("Brak ADMIN_SECRET");
  const sid = randomBytes(32).toString("base64url");
  const expires = now + SESSION_MAX_AGE_S * 1000;
  const payload = `v1.${sid}.${expires}`;
  return { token: `${payload}.${sign(payload, key)}`, sid, expires };
}

/** Sprawdza podpis i ważność tokenu. Zwraca sid albo null. */
export function readToken(token: string | undefined, now: number): string | null {
  const key = secret();
  if (!key || !token || token.length > 300) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !SID.test(parts[1]) || !EXPIRES.test(parts[2])) return null;
  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  if (!safeEqual(sign(payload, key), parts[3])) return null;
  const expires = Number(parts[2]);
  return expires > now && expires <= now + SESSION_MAX_AGE_S * 1000 ? parts[1] : null;
}

export function checkPassword(input: string) {
  const expected = password();
  if (!expected || !secret() || input.length > MAX_INPUT) return false;
  return safeEqual(input, expected);
}

// ---------------------------------------------------------------------------------------------------------------
// 2FA (TOTP, RFC 6238: SHA-1, 6 cyfr, 30 s)

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  if (!/^[A-Z2-7]+$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = ((value << 5) | BASE32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

type TotpState = "off" | "on" | "invalid";

function totpKey(): { state: TotpState; key: Buffer | null } {
  const raw = (process.env.ADMIN_TOTP_SECRET ?? "").trim();
  if (!raw) return { state: "off", key: null };
  const key = base32Decode(raw);
  // RFC 4226: klucz min. 128 bitów. Zły klucz NIE wyłącza 2FA po cichu – blokuje logowanie.
  return key && key.length >= 16 && key.length <= 64 ? { state: "on", key } : { state: "invalid", key: null };
}

export const totpState = (): TotpState => totpKey().state;
export const totpEnabled = () => totpKey().state === "on";

function totpAt(key: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** Krok czasu (30 s), do którego pasuje kod – bieżący albo sąsiedni. null = zły kod. */
export function totpStep(code: string, now: number): number | null {
  const { key } = totpKey();
  if (!key || !/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  let match: number | null = null;
  // bez wcześniejszego wyjścia z pętli – czas nie zdradza, który krok pasował
  for (const s of [step - 1, step, step + 1]) if (safeEqual(totpAt(key, s), code) && match === null) match = s;
  return match;
}
