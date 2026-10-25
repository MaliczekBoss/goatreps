import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { accessSync, constants, copyFileSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { derivedKey } from "../admin/auth-token";
import { mongoConfigured } from "../mongo";
import {
  BREAKDOWNS,
  count,
  emptyDay,
  emptyTotals,
  errMsg,
  FIXED_PAGES,
  KEEP_DAYS,
  KEEP_HOUR_DAYS,
  KEEP_MINUTES,
  LIVE_CAP,
  LIVE_MS,
  MAP_CAP,
  MAX_COUNT,
  obj,
  SEEN_CAP,
  shiftDay,
  stamp,
  TOTAL_FIELDS,
  validKey,
  VIEWED_CAP,
  VIEWS_CAP,
  type Breakdown,
  type DayAgg,
  type Snapshot,
  type SnapshotQuery,
  type Stamp,
  type Totals,
  type TrackEvent,
  type Visitor,
} from "./model";
import { isSource, type SourceId } from "./shared";
import { productViewsMongo, readSnapshotMongo, recordMongo } from "./store-mongo";

/*
 * Magazyn statystyk. Gdy jest MONGODB_URI – wszystko w MongoDB (store-mongo.ts, wiele instancji naraz).
 * Bez bazy (jak lokalnie):
 *
 * - Wszystko w pamięci procesu (globalThis), wczytywane z data/statystyki.json przy pierwszym użyciu.
 * - Zapis atomowy (plik tymczasowy + rename) najwyżej co 15 s i przy zamykaniu procesu.
 * - Odwiedzający = skrót HMAC(klucz z ADMIN_SECRET, dzień|IP|User-Agent) – surowego IP nigdzie nie zapisujemy.
 *   Skróty trzymamy tylko dla bieżącej doby (do liczenia unikalnych); po północy zostają same liczby.
 * - Dni: 100, godziny: 3 doby, minuty: 2 h, "teraz na stronie": 30 min.
 * - Limity rozmiaru map i zbiorów – zalew zapytań nie zapcha pamięci ani dysku.
 */

export { hoursOf, LIVE_MS, shiftDay, stamp, TOTAL_FIELDS, type Breakdown, type DayAgg, type Stamp, type Totals, type TrackEvent, type Visitor } from "./model";

export const STATS_FILE = path.join(process.cwd(), "data", "statystyki.json");

const SAVE_EVERY_MS = 15_000;
const SAVE_RETRY_MS = 60_000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

// Zamknięty dzień (po północy) zostaje przycięty do czołówki – do statystyk liczy się top 12.
const CLOSED_CAP: Partial<Record<Breakdown, number>> = { pages: 300, products: 300, searches: 200 };

type Today = { day: string; hour: string; seen: Set<string>; hourSeen: Set<string>; viewed: Set<string>; warned: boolean };

type State = {
  days: Map<string, DayAgg>;
  hours: Map<string, Totals>;
  /** Odsłony w minucie, klucz = minuta od epoki (rosnąco). */
  minutes: Map<number, number>;
  /** "źródło|sesja" → ostatnia aktywność (najstarsze na początku). */
  live: Map<string, number>;
  /** Produkt → ile osób go obejrzało od początku (jedna osoba raz na dobę); nie przycinane jak zamknięte dni. */
  views: Map<string, number>;
  today: Today;
  storage: "file" | "memory";
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  writing: Promise<void> | null;
};

// ---------------------------------------------------------------------------------------------------------------
// Odwiedzający

const g = globalThis as typeof globalThis & { __grStats?: State; __grStatsSalt?: Buffer };

/** Bez ADMIN_SECRET sól jest losowa dla procesu – po restarcie ci sami ludzie liczą się drugi raz, ale nic nie da się odwrócić. */
const salt = () => derivedKey("statystyki") ?? (g.__grStatsSalt ??= randomBytes(32));

const VISITOR_ID = /^[A-Za-z0-9_-]{12}$/;
const VIEWED_ID = /^[A-Za-z0-9_-]{12}[1-9]\d{0,6}$/;
const LIVE_KEY = /^([a-z]{1,12})\|[a-z0-9]{8,24}$/;

export function visitorId(day: string, ip: string | null, ua: string) {
  return createHmac("sha256", salt())
    .update(`${day}|${ip ?? "-"}|${ua.slice(0, 512)}`)
    .digest("base64url")
    .slice(0, 12);
}

// ---------------------------------------------------------------------------------------------------------------
// Stan

const emptyToday = (t: Stamp): Today => ({ day: t.day, hour: t.hour, seen: new Set(), hourSeen: new Set(), viewed: new Set(), warned: false });

const errCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function compact(d: DayAgg) {
  d.closed = true;
  for (const kind of BREAKDOWNS) {
    const cap = CLOSED_CAP[kind];
    const m = d.maps[kind];
    if (cap && m.size > cap) d.maps[kind] = new Map([...m].sort((a, b) => b[1] - a[1]).slice(0, cap));
  }
}

function restore(s: State, raw: unknown, now: number) {
  const root = obj(raw);
  if (!root || root.v !== 1) throw new Error("nieznany format pliku");
  const t = stamp(now);
  const oldestDay = shiftDay(t.day, -(KEEP_DAYS - 1));
  const oldestHourDay = shiftDay(t.day, -(KEEP_HOUR_DAYS - 1));

  for (const [key, value] of Object.entries(obj(root.days) ?? {})) {
    const d = obj(value);
    if (!d || !/^\d{8}$/.test(key) || key < oldestDay || key > t.day) continue;
    const agg = emptyDay();
    for (const f of TOTAL_FIELDS) agg[f] = count(d[f]);
    if (Array.isArray(d.nv) && d.nv.length === 24) agg.nv = d.nv.map(count);
    for (const kind of BREAKDOWNS) {
      for (const [k, n] of Object.entries(obj(d[kind]) ?? {})) {
        if (agg.maps[kind].size >= MAP_CAP[kind]) break;
        if (count(n) > 0 && validKey[kind](k)) agg.maps[kind].set(k, count(n));
      }
    }
    if (key !== t.day) compact(agg);
    s.days.set(key, agg);
  }

  for (const [key, value] of Object.entries(obj(root.hours) ?? {})) {
    const h = obj(value);
    if (!h || !/^\d{10}$/.test(key) || key.slice(0, 8) < oldestHourDay || key.slice(0, 8) > t.day) continue;
    const agg = emptyTotals();
    for (const f of TOTAL_FIELDS) agg[f] = count(h[f]);
    s.hours.set(key, agg);
  }

  const minutes = Object.entries(obj(root.minutes) ?? {})
    .map(([k, n]) => [Number(k), count(n)] as const)
    .filter(([m, n]) => Number.isSafeInteger(m) && m > t.minute - KEEP_MINUTES && m <= t.minute && n > 0)
    .sort((a, b) => a[0] - b[0]);
  for (const [m, n] of minutes) s.minutes.set(m, n);

  if (Array.isArray(root.live)) {
    const live = root.live
      .filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "number")
      .filter(([k, at]) => isSource(LIVE_KEY.exec(k)?.[1]) && at > now - LIVE_MS && at <= now + 60_000)
      .sort((a, b) => a[1] - b[1])
      .slice(-LIVE_CAP);
    for (const [k, at] of live) s.live.set(k, at);
  }

  const views = obj(root.views);
  if (views) {
    for (const [k, n] of Object.entries(views)) {
      if (s.views.size >= VIEWS_CAP) break;
      if (count(n) > 0 && validKey.products(k)) s.views.set(k, count(n));
    }
  } else {
    // starszy plik bez licznika – start z sumy zapisanych dni
    for (const d of s.days.values()) for (const [k, n] of d.maps.products) if (s.views.size < VIEWS_CAP || s.views.has(k)) s.views.set(k, (s.views.get(k) ?? 0) + n);
  }

  const today = obj(root.today);
  if (today && today.day === t.day) {
    const fill = (target: Set<string>, list: unknown, re: RegExp, cap: number) => {
      if (!Array.isArray(list)) return;
      for (const id of list) {
        if (target.size >= cap) break;
        if (typeof id === "string" && re.test(id)) target.add(id);
      }
    };
    fill(s.today.seen, today.seen, VISITOR_ID, SEEN_CAP);
    fill(s.today.viewed, today.viewed, VIEWED_ID, VIEWED_CAP);
    if (today.hour === t.hour) fill(s.today.hourSeen, today.hourSeen, VISITOR_ID, SEEN_CAP);
  }
}

function canWrite() {
  try {
    accessSync(path.dirname(STATS_FILE), constants.W_OK);
    try {
      accessSync(STATS_FILE, constants.W_OK);
    } catch (e) {
      if (errCode(e) !== "ENOENT") return false;
    }
    return true;
  } catch {
    return false;
  }
}

function load(): State {
  const now = Date.now();
  const s: State = {
    days: new Map(),
    hours: new Map(),
    minutes: new Map(),
    live: new Map(),
    views: new Map(),
    today: emptyToday(stamp(now)),
    storage: "memory",
    dirty: false,
    timer: null,
    writing: null,
  };
  try {
    const size = statSync(STATS_FILE).size;
    if (size > MAX_FILE_BYTES) throw new Error(`plik ma ${size} B – za duży`);
    restore(s, JSON.parse(readFileSync(STATS_FILE, "utf8")), now);
  } catch (e) {
    if (errCode(e) !== "ENOENT") {
      // Nie nadpisujemy po cichu historii – zła kopia zostaje obok.
      console.warn(`[statystyki] nie można wczytać ${path.basename(STATS_FILE)}: ${errMsg(e)} – start od zera, stary plik w .uszkodzony`);
      try {
        copyFileSync(STATS_FILE, `${STATS_FILE}.uszkodzony`);
      } catch {}
    }
  }
  s.storage = canWrite() ? "file" : "memory";
  return s;
}

function state(): State {
  if (!g.__grStats) {
    const s = load();
    g.__grStats = s;
    process.once("exit", () => flushSync(s));
  }
  // stan z wcześniejszej wersji kodu (przeładowanie w dev) – brakujący licznik wyświetleń z sumy dni
  if (!g.__grStats.views) {
    const views = new Map<string, number>();
    for (const d of g.__grStats.days.values()) for (const [k, n] of d.maps.products) views.set(k, (views.get(k) ?? 0) + n);
    g.__grStats.views = views;
  }
  return g.__grStats;
}

// ---------------------------------------------------------------------------------------------------------------
// Zapis

function serialize(s: State) {
  const days: Record<string, unknown> = {};
  for (const [key, d] of [...s.days].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const out: Record<string, unknown> = {};
    for (const f of TOTAL_FIELDS) out[f] = d[f];
    out.nv = d.nv;
    for (const kind of BREAKDOWNS) out[kind] = Object.fromEntries(d.maps[kind]);
    days[key] = out;
  }
  const hours: Record<string, Totals> = {};
  for (const [key, h] of [...s.hours].sort(([a], [b]) => (a < b ? -1 : 1))) hours[key] = h;
  return JSON.stringify({
    v: 1,
    savedAt: new Date().toISOString(),
    days,
    hours,
    minutes: Object.fromEntries(s.minutes),
    live: [...s.live],
    views: Object.fromEntries(s.views),
    today: { day: s.today.day, hour: s.today.hour, seen: [...s.today.seen], hourSeen: [...s.today.hourSeen], viewed: [...s.today.viewed] },
  });
}

async function writeAtomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, content, { encoding: "utf8", mode: 0o600 });
  // Windows: rename potrafi chwilowo dostać EPERM/EBUSY, gdy ktoś (antywirus, edytor) trzyma plik.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      if (attempt >= 4 || !["EPERM", "EBUSY", "EACCES"].includes(errCode(e))) {
        await unlink(tmp).catch(() => {});
        throw e;
      }
      await sleep(100 * (attempt + 1));
    }
  }
}

function schedule(s: State, ms: number) {
  if (s.timer) return;
  s.timer = setTimeout(() => {
    s.timer = null;
    void flush(s);
  }, ms);
  s.timer.unref?.();
}

const markDirty = (s: State) => {
  s.dirty = true;
  schedule(s, SAVE_EVERY_MS);
};

async function flush(s: State) {
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
  while (s.writing) await s.writing;
  if (!s.dirty) return;
  s.dirty = false;
  s.writing = writeAtomic(STATS_FILE, serialize(s))
    .then(() => {
      if (s.storage !== "file") console.info("[statystyki] zapis do pliku działa");
      s.storage = "file";
    })
    .catch((e) => {
      if (s.storage === "file") console.error(`[statystyki] zapis ${path.basename(STATS_FILE)} nieudany: ${errMsg(e)} – dane tylko w pamięci`);
      s.storage = "memory";
      s.dirty = true;
      schedule(s, SAVE_RETRY_MS);
    })
    .finally(() => {
      s.writing = null;
    });
  await s.writing;
}

function flushSync(s: State) {
  if (!s.dirty) return;
  try {
    const tmp = `${STATS_FILE}.${process.pid}.exit.tmp`;
    writeFileSync(tmp, serialize(s), { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, STATS_FILE);
    s.dirty = false;
  } catch (e) {
    console.error(`[statystyki] zapis przy zamykaniu nieudany: ${errMsg(e)}`);
  }
}

/** Do testów / zamykania: zapisuje od razu oczekujące zmiany (tylko magazyn w pliku). */
export const flushStats = () => (mongoConfigured() ? Promise.resolve() : flush(state()));

// ---------------------------------------------------------------------------------------------------------------
// Liczenie

/** Nowa doba / godzina: czyści zbiory odwiedzających, przycina zamknięte dni, usuwa stare dane. */
function rollover(s: State, t: Stamp, now: number) {
  if (s.today.day !== t.day) {
    s.today = emptyToday(t);
    const oldestDay = shiftDay(t.day, -(KEEP_DAYS - 1));
    const oldestHourDay = shiftDay(t.day, -(KEEP_HOUR_DAYS - 1));
    for (const [key, d] of s.days) {
      if (key < oldestDay) s.days.delete(key);
      else if (key !== t.day && !d.closed) compact(d);
    }
    for (const key of s.hours.keys()) if (key.slice(0, 8) < oldestHourDay) s.hours.delete(key);
    markDirty(s);
  } else if (s.today.hour !== t.hour) {
    s.today.hour = t.hour;
    s.today.hourSeen = new Set();
  }
  for (const m of s.minutes.keys()) {
    if (m > t.minute - KEEP_MINUTES) break;
    s.minutes.delete(m);
  }
  for (const [key, at] of s.live) {
    if (at > now - LIVE_MS && s.live.size <= LIVE_CAP) break;
    s.live.delete(key);
  }
}

function dayOf(s: State, day: string) {
  let d = s.days.get(day);
  if (!d) s.days.set(day, (d = emptyDay()));
  return d;
}

function hourOf(s: State, hour: string) {
  let h = s.hours.get(hour);
  if (!h) s.hours.set(hour, (h = emptyTotals()));
  return h;
}

function bump(d: DayAgg, kind: Breakdown, key: string) {
  const m = d.maps[kind];
  const cur = m.get(key);
  if (cur !== undefined) m.set(key, Math.min(MAX_COUNT, cur + 1));
  else if (m.size < MAP_CAP[kind] || (kind === "pages" && FIXED_PAGES.has(key))) m.set(key, 1);
}

/** true = nowy wpis. Pełny zbiór nic nie dodaje (unikalni przestają rosnąć – raz na dobę ostrzeżenie w logu). */
function addOnce(s: State, set: Set<string>, id: string, cap: number) {
  if (set.has(id)) return false;
  if (set.size >= cap) {
    if (!s.today.warned) {
      s.today.warned = true;
      console.warn(`[statystyki] limit ${cap} wpisów na dobę osiągnięty – unikalni nie są już dziś liczeni (zalew?)`);
    }
    return false;
  }
  set.add(id);
  return true;
}

function recordMemory(e: TrackEvent, v: Visitor, now: number) {
  const s = state();
  const t = stamp(now);
  rollover(s, t, now);
  const D = dayOf(s, t.day);
  const H = hourOf(s, t.hour);
  const add = (f: keyof Totals, by = 1) => {
    D[f] = Math.min(MAX_COUNT, D[f] + by);
    H[f] = Math.min(MAX_COUNT, H[f] + by);
  };

  if (e.t === "pv") {
    add("pv");
    if (e.isNew) add("s");
    if (e.n === 2) add("ms");
    bump(D, "pages", e.path);
    if (addOnce(s, s.today.seen, v.id, SEEN_CAP)) {
      D.uv++;
      D.nv[t.hourOfDay]++;
      bump(D, "sources", e.src);
      bump(D, "countries", v.country);
      bump(D, "devices", v.device);
    }
    if (addOnce(s, s.today.hourSeen, v.id, SEEN_CAP)) H.uv++;
    if (e.product && addOnce(s, s.today.viewed, `${v.id}${e.product}`, VIEWED_CAP)) {
      const id = String(e.product);
      bump(D, "products", id);
      if (s.views.size < VIEWS_CAP || s.views.has(id)) s.views.set(id, Math.min(MAX_COUNT, (s.views.get(id) ?? 0) + 1));
    }
    if (e.q) {
      add("search");
      bump(D, "searches", e.q);
    }
    s.minutes.set(t.minute, (s.minutes.get(t.minute) ?? 0) + 1);
  } else if (e.t === "out") {
    add("out");
    bump(D, "agents", e.agent);
  } else if (e.t === "promo") {
    add("promo");
  } else if (e.t === "search") {
    add("search");
    bump(D, "searches", e.q);
  }
  if ((e.t === "pv" || e.t === "ping") && e.dur > 0) add("dur", e.dur);

  const key = `${e.src}|${e.sid}`;
  s.live.delete(key);
  s.live.set(key, now);
  markDirty(s);
}

/**
 * Zapisuje zdarzenie. Nigdy nie odrzuca (błędy bazy są logowane), więc wywołujący nie musi czekać ani łapać błędów.
 * Z MongoDB obietnica kończy się po zapisie w bazie; bez bazy – od razu.
 */
export function record(e: TrackEvent, v: Visitor, now = Date.now()): Promise<void> {
  if (mongoConfigured()) return recordMongo(e, v, now);
  try {
    recordMemory(e, v, now);
  } catch (err) {
    console.error(`[statystyki] zapis zdarzenia nieudany: ${errMsg(err)}`);
  }
  return Promise.resolve();
}

/** Ile osób obejrzało produkt (od kiedy liczymy; jedna osoba raz na dobę). Przy problemie z bazą – ostatnia znana wartość albo 0. */
export async function productViews(id: number): Promise<number> {
  if (mongoConfigured()) return productViewsMongo(id);
  return state().views.get(String(id)) ?? 0;
}

/** Dane do raportu (po przesunięciu doby/godziny). Z MongoDB rzuca, gdy baza nie odpowiada. */
export async function readSnapshot(q: SnapshotQuery, now = Date.now()): Promise<Snapshot> {
  if (mongoConfigured()) return readSnapshotMongo(q, now);
  const s = state();
  rollover(s, stamp(now), now);
  const sources = new Map<SourceId, number>();
  for (const key of s.live.keys()) {
    const src = key.split("|")[0];
    const id: SourceId = isSource(src) ? src : "other";
    sources.set(id, (sources.get(id) ?? 0) + 1);
  }
  return {
    days: s.days,
    hours: s.hours,
    minutes: s.minutes,
    live: { count: s.live.size, sources: [...sources].sort((a, b) => b[1] - a[1]) },
    storage: s.storage,
  };
}
