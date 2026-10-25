import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { unstable_rethrow } from "next/navigation";
import type { Rates } from "./money";

// Kursy, po których przeliczamy juany: takie jak w kasie KakoBuy (najczęściej wybierany agent),
// a nie średnie NBP – KakoBuy liczy z narzutem ok. 8%, więc ceny w zł z NBP wychodziły za niskie.
//  1. data/kursy.json – prawdziwe kursy KakoBuy zapisane skryptem narzedzia/kurs-kakobuy.mjs; GitHub Actions odświeża je
//     raz w tygodniu (Vercel przebudowuje stronę, Pterodactyl pobiera plik sam – server/kursy.mjs). Ważne 10 dni (zapas na nieudany tydzień),
//  2. gdy pliku brak albo jest stary: średni kurs NBP × narzut KakoBuy (z pliku albo domyślny).
// Wszystko po stronie serwera – przeglądarka nie łączy się z nikim poza naszą domeną.

const NBP_URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const FILE = path.join(process.cwd(), "data", "kursy.json");
const TTL_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const FILE_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;
const CHECK_FILE_MS = 60_000;

type Code = "PLN" | "EUR" | "USD";
const CODES: Code[] = ["PLN", "EUR", "USD"];
const RANGE: Record<Code, [number, number]> = { PLN: [0.3, 1.2], EUR: [0.06, 0.3], USD: [0.06, 0.3] };

// Narzut KakoBuy względem NBP zmierzony 24.10.2026 (kurs KakoBuy / średni NBP) – gdy nie ma świeższego w pliku.
const DEFAULT_MARKUP: Record<Code, number> = { PLN: 1.0835, EUR: 1.0817, USD: 1.0834 };
// Zapas na wypadek braku NBP i pliku: kursy KakoBuy z 24.10.2026.
const FALLBACK: Rates = { PLN: 0.6374, EUR: 0.1449, USD: 0.1624, CNY: 1, date: "2026-10-24", source: "KakoBuy (zapas)" };

type Saved = { rates: Record<Code, number>; markup: Record<Code, number> | null; fetchedAt: number };
type Cache = { nbp: Record<Code, number> & { date: string }; next: number; pending?: Promise<void>; file?: { mtime: number; checkedAt: number; saved: Saved | null } };
const g = globalThis as typeof globalThis & { __grRates?: Cache };

const valid = (r: unknown): r is Record<Code, number> =>
  !!r && typeof r === "object" && CODES.every((c) => {
    const v = (r as Record<string, unknown>)[c];
    return typeof v === "number" && v >= RANGE[c][0] && v <= RANGE[c][1];
  });

/** Kursy KakoBuy z pliku (wczytywane ponownie, gdy plik się zmieni). Złe dane są pomijane. */
function savedRates(cache: Cache): Saved | null {
  const now = Date.now();
  if (cache.file && now - cache.file.checkedAt < CHECK_FILE_MS) return cache.file.saved;
  let mtime = 0;
  try {
    mtime = statSync(FILE).mtimeMs;
  } catch {
    cache.file = { mtime: 0, checkedAt: now, saved: null };
    return null;
  }
  if (cache.file && cache.file.mtime === mtime) {
    cache.file.checkedAt = now;
    return cache.file.saved;
  }
  let saved: Saved | null = null;
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8")) as { rates?: unknown; markup?: unknown; fetchedAt?: unknown };
    const fetchedAt = Date.parse(String(raw.fetchedAt));
    const m = raw.markup as Record<string, unknown> | null | undefined;
    const markupOk = !!m && typeof m === "object" && CODES.every((c) => typeof m[c] === "number" && (m[c] as number) >= 0.9 && (m[c] as number) <= 1.4);
    if (valid(raw.rates) && Number.isFinite(fetchedAt)) saved = { rates: raw.rates, markup: markupOk ? (raw.markup as Record<Code, number>) : null, fetchedAt };
  } catch (error) {
    console.warn("[kursy] nie można wczytać kursy.json:", error instanceof Error ? error.message : error);
  }
  cache.file = { mtime, checkedAt: now, saved };
  return saved;
}

async function refreshNbp(cache: Cache) {
  try {
    const res = await fetch(NBP_URL, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`NBP HTTP ${res.status}`);
    const [table] = (await res.json()) as [{ effectiveDate: string; rates: { code: string; mid: number }[] }];
    const mid = (code: string) => table.rates.find((r) => r.code === code)?.mid ?? 0;
    const cny = mid("CNY");
    const eur = mid("EUR");
    const usd = mid("USD");
    if (!(cny > 0 && eur > 0 && usd > 0)) throw new Error("NBP: brak kursu");
    cache.nbp = { PLN: cny, EUR: cny / eur, USD: cny / usd, date: table.effectiveDate };
    cache.next = Date.now() + TTL_MS;
  } catch (error) {
    unstable_rethrow(error);
    console.warn("[kursy]", error instanceof Error ? error.message : error);
    cache.next = Date.now() + RETRY_MS;
  }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export async function getRates(): Promise<Rates> {
  // (stan z poprzedniej wersji kodu po przeładowaniu w dev ma inny kształt – zaczynamy od nowa)
  if (!g.__grRates?.nbp) g.__grRates = { nbp: { PLN: 0, EUR: 0, USD: 0, date: "" }, next: 0 };
  const cache = g.__grRates;

  // 1. świeże kursy KakoBuy z pliku
  const saved = savedRates(cache);
  if (saved && Date.now() - saved.fetchedAt < FILE_MAX_AGE_MS) {
    return { ...saved.rates, CNY: 1, date: new Date(saved.fetchedAt).toISOString().slice(0, 10), source: "KakoBuy" };
  }

  // 2. NBP × narzut KakoBuy
  if (Date.now() >= cache.next) {
    cache.pending ??= refreshNbp(cache).finally(() => (cache.pending = undefined));
    // pierwsze żądanie czeka na kurs (max 5 s), kolejne dostają poprzedni od razu
    if (!cache.nbp.PLN) await cache.pending;
  }
  if (!cache.nbp.PLN) return FALLBACK;
  const markup = saved?.markup ?? DEFAULT_MARKUP;
  return {
    PLN: round4(cache.nbp.PLN * markup.PLN),
    EUR: round4(cache.nbp.EUR * markup.EUR),
    USD: round4(cache.nbp.USD * markup.USD),
    CNY: 1,
    date: cache.nbp.date,
    source: "NBP + narzut KakoBuy",
  };
}

