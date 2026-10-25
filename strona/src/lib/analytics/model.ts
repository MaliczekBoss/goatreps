import "server-only";
import { AGENT_HOSTS, isSource, normalizePath, normalizeSearch, type SourceId } from "./shared";

// Wspólny model statystyk dla obu magazynów: plik/pamięć (store.ts) i MongoDB (store-mongo.ts).

export const TZ = "Europe/Warsaw";
export const KEEP_DAYS = 100;
export const KEEP_HOUR_DAYS = 3;
export const KEEP_MINUTES = 120;
export const LIVE_MS = 30 * 60_000;
export const MAX_COUNT = 1e12;

export const SEEN_CAP = 200_000; // unikalni odwiedzający na dobę (i na godzinę)
export const VIEWED_CAP = 300_000; // pary odwiedzający × produkt na dobę
export const LIVE_CAP = 20_000;
export const VIEWS_CAP = 20_000; // więcej niż produktów w katalogu – licznik nie urośnie bez końca

export type Totals = { uv: number; pv: number; s: number; ms: number; dur: number; out: number; promo: number; search: number };
export const TOTAL_FIELDS = ["uv", "pv", "s", "ms", "dur", "out", "promo", "search"] as const satisfies readonly (keyof Totals)[];

export const BREAKDOWNS = ["pages", "sources", "countries", "devices", "agents", "products", "searches"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];

// Kluczy w mapie dnia najwyżej tyle (strony produktów i katalog są i tak sprawdzane z katalogiem).
export const MAP_CAP: Record<Breakdown, number> = { pages: 1000, sources: 32, countries: 300, devices: 3, agents: 16, products: 5000, searches: 500 };
// Te strony mieszczą się zawsze, nawet gdy mapa stron jest pełna.
export const FIXED_PAGES = new Set(["/", "/products", "/qc-finder", "/link-converter", "/tracking", "/shipping", "/tools", "/photo-search", "/inne"]);

export type DayAgg = Totals & {
  /** Nowi (pierwszy raz tego dnia) odwiedzający w każdej godzinie – suma nv[0..h] = unikalni od północy do godziny h. */
  nv: number[];
  maps: Record<Breakdown, Map<string, number>>;
  closed: boolean;
};

export type Visitor = { id: string; country: string; device: "mobile" | "tablet" | "desktop" };

export type TrackEvent =
  | { t: "pv"; sid: string; src: SourceId; dur: number; path: string; isNew: boolean; n: number; product?: number; q?: string }
  | { t: "ping"; sid: string; src: SourceId; dur: number }
  | { t: "out"; sid: string; src: SourceId; agent: string }
  | { t: "promo"; sid: string; src: SourceId }
  | { t: "search"; sid: string; src: SourceId; q: string };

export type Storage = "file" | "memory" | "mongo";

/** Czego potrzebuje raport: dni (z mapami tylko dla mapDays), godziny, zakres minut [od, do]. */
export type SnapshotQuery = { days: string[]; mapDays: string[]; hours: string[]; minutes: [number, number] };

/** Dane do raportu – tak samo z pamięci i z MongoDB. */
export type Snapshot = {
  days: ReadonlyMap<string, DayAgg>;
  hours: ReadonlyMap<string, Totals>;
  minutes: ReadonlyMap<number, number>;
  live: { count: number; sources: [SourceId, number][] };
  storage: Storage;
};

// ---------------------------------------------------------------------------------------------------------------
// Czas (Europe/Warsaw)

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export type Stamp = { day: string; hour: string; hourOfDay: number; minute: number };

let lastStamp: Stamp | null = null;

/** day = "YYYYMMDD", hour = "YYYYMMDDHH" (czas polski), minute = minuta od epoki. */
export function stamp(ms: number): Stamp {
  const minute = Math.floor(ms / 60_000);
  // przesunięcie strefy to pełne godziny, więc w obrębie minuty wynik jest ten sam (formatToParts jest wolne)
  if (lastStamp?.minute === minute) return lastStamp;
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const day = `${p.year}${p.month}${p.day}`;
  lastStamp = { day, hour: `${day}${p.hour}`, hourOfDay: Number(p.hour), minute };
  return lastStamp;
}

export function shiftDay(day: string, n: number) {
  const d = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export const hoursOf = (day: string) => Array.from({ length: 24 }, (_, h) => `${day}${String(h).padStart(2, "0")}`);

// ---------------------------------------------------------------------------------------------------------------
// Puste wartości i walidacja

export const emptyTotals = (): Totals => ({ uv: 0, pv: 0, s: 0, ms: 0, dur: 0, out: 0, promo: 0, search: 0 });

export const emptyDay = (): DayAgg => ({
  ...emptyTotals(),
  nv: Array.from({ length: 24 }, () => 0),
  maps: { pages: new Map(), sources: new Map(), countries: new Map(), devices: new Map(), agents: new Map(), products: new Map(), searches: new Map() },
  closed: false,
});

export const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
export const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COUNT ? v : 0);

const DEVICES = new Set(["mobile", "tablet", "desktop"]);
const AGENTS = new Set(AGENT_HOSTS.map(([id]) => id));

/** Klucze z pliku / bazy sprawdzamy tak samo jak dane z /api/track – ręcznie zmienione dane nie wprowadzą śmieci. */
export const validKey: Record<Breakdown, (k: string) => boolean> = {
  pages: (k) => normalizePath(k) === k,
  sources: isSource,
  countries: (k) => /^[A-Z]{2}$/.test(k),
  devices: (k) => DEVICES.has(k),
  agents: (k) => AGENTS.has(k),
  products: (k) => /^[1-9]\d{0,6}$/.test(k),
  searches: (k) => normalizeSearch(k) === k,
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

type LogGate = { at: number; skipped: number };
const gates = new Map<string, LogGate>();

/** Błąd do logu najwyżej raz na minutę na rodzaj – awaria bazy nie zaleje logów. */
export function logRare(scope: string, e: unknown) {
  const now = Date.now();
  const gate = gates.get(scope);
  if (gate && now - gate.at < 60_000) {
    gate.skipped++;
    return;
  }
  const skipped = gate?.skipped ? ` (+${gate.skipped} podobnych w ostatniej minucie)` : "";
  gates.set(scope, { at: now, skipped: 0 });
  console.error(`[statystyki] ${scope}: ${errMsg(e)}${skipped}`);
}
