import "server-only";
import { MongoBulkWriteError, type Db, type Document } from "mongodb";
import { decodeField, encodeField, mongo } from "../mongo";
import {
  BREAKDOWNS,
  count,
  emptyDay,
  emptyTotals,
  FIXED_PAGES,
  KEEP_DAYS,
  KEEP_HOUR_DAYS,
  KEEP_MINUTES,
  LIVE_MS,
  logRare,
  MAP_CAP,
  obj,
  SEEN_CAP,
  stamp,
  TOTAL_FIELDS,
  validKey,
  VIEWED_CAP,
  type Breakdown,
  type DayAgg,
  type Snapshot,
  type SnapshotQuery,
  type Totals,
  type TrackEvent,
  type Visitor,
} from "./model";
import { isSource, type SourceId } from "./shared";

/*
 * Statystyki w MongoDB – kilka instancji strony może zapisywać naraz (tylko atomowe $inc / unikalne _id).
 *
 * stats_days     _id "YYYYMMDD": liczniki ($inc), nv.<godzina>, mapy jako pola (pages.<ścieżka>, products.<id>, …),
 *                keys.<mapa> = ile kluczy ma mapa (limit sprawdzany atomowo w filtrze), vv = wyświetlenia produktów; TTL 100 dni
 * stats_hours    _id "YYYYMMDDHH": liczniki; TTL ~3 doby
 * stats_minutes  _id = minuta od epoki: odsłony; TTL 2 h
 * stats_live     _id "źródło|sesja": ostatnia aktywność; TTL 30 min
 * stats_seen     unikalne _id (d|dzień|gość, h|godzina|gość, v|dzień|gość|produkt) – duplikat = „już był”; TTL
 * product_views  _id = id produktu, n = ile osób obejrzało (jedna osoba raz na dobę)
 *
 * Zapis nigdy nie psuje strony: błąd jest logowany (najwyżej raz na minutę), a zapisy na chwilę wstrzymane.
 */

/** Dokument z _id tekstowym / liczbowym (domyślnie sterownik zakłada ObjectId). */
type Str = Document & { _id: string };
type Num = Document & { _id: number };

const C = {
  days: "stats_days",
  hours: "stats_hours",
  minutes: "stats_minutes",
  live: "stats_live",
  seen: "stats_seen",
  views: "product_views",
} as const;

const DAY_MS = 86_400_000;
const PAUSE_MS = 10_000; // po błędzie bazy tyle przerwy w zapisach (bez burzy połączeń)
const MAX_INFLIGHT = 200; // więcej równoległych zapisów = baza nie nadąża, zdarzenie przepada
const VIEWS_CACHE_MS = 60_000;
const VIEWS_TIMEOUT_MS = 500;
const VIEWS_CACHE_CAP = 5000;

type DayCache = { day: string; keys: Record<Breakdown, Set<string>>; full: Record<Breakdown, boolean>; uv: number; vv: number };
type Mem = {
  indexes?: Promise<void>;
  inflight: number;
  pausedUntil: number;
  day?: DayCache;
  views: Map<string, { n: number; at: number }>;
  viewsPausedUntil: number;
};

const g = globalThis as typeof globalThis & { __grStatsMongo?: Mem };
const mem: Mem = (g.__grStatsMongo ??= { inflight: 0, pausedUntil: 0, views: new Map(), viewsPausedUntil: 0 });

const dayStart = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));

/** Indeksy TTL – raz na proces (createIndex jest idempotentne, więc kilka instancji naraz nie szkodzi). */
export function ensureStatsIndexes(db: Db) {
  mem.indexes ??= (async () => {
    await Promise.all(
      [C.days, C.hours, C.minutes, C.live, C.seen].map((name) => db.collection(name).createIndex({ exp: 1 }, { expireAfterSeconds: 0, name: "wygasa" })),
    );
  })().catch((e) => {
    mem.indexes = undefined;
    throw e;
  });
  return mem.indexes;
}

async function db() {
  const d = await mongo();
  await ensureStatsIndexes(d);
  return d;
}

function dayCache(day: string): DayCache {
  if (mem.day?.day !== day) {
    const sets = () => Object.fromEntries(BREAKDOWNS.map((k) => [k, new Set<string>()])) as Record<Breakdown, Set<string>>;
    const flags = () => Object.fromEntries(BREAKDOWNS.map((k) => [k, false])) as Record<Breakdown, boolean>;
    mem.day = { day, keys: sets(), full: flags(), uv: 0, vv: 0 };
  }
  return mem.day;
}

/** Wstawia unikalne _id; zwraca, które były nowe (duplikat = już był). */
async function insertOnce(d: Db, docs: { _id: string; exp: Date }[]): Promise<boolean[]> {
  if (!docs.length) return [];
  try {
    await d.collection<Str>(C.seen).insertMany(docs, { ordered: false });
    return docs.map(() => true);
  } catch (e) {
    if (!(e instanceof MongoBulkWriteError)) throw e;
    const errors = Array.isArray(e.writeErrors) ? e.writeErrors : [e.writeErrors];
    const dup = new Set<number>();
    for (const we of errors) {
      if (we.code !== 11000) throw e;
      dup.add(we.index);
    }
    return docs.map((_, i) => !dup.has(i));
  }
}

/** Nowy klucz mapy dnia: dodany tylko, gdy mapa ma mniej kluczy niż limit (sprawdzane atomowo w filtrze). */
async function addKey(d: Db, cache: DayCache, kind: Breakdown, key: string) {
  const days = d.collection<Str>(C.days);
  const field = `${kind}.${encodeField(key)}`;
  const counter = `keys.${kind}`;
  const always = kind === "pages" && FIXED_PAGES.has(key);
  if (!cache.full[kind] || always) {
    const added = await days.updateOne(
      { _id: cache.day, [field]: { $exists: false }, ...(always ? {} : { [counter]: { $not: { $gte: MAP_CAP[kind] } } }) },
      { $inc: { [field]: 1, [counter]: 1 } },
    );
    if (added.matchedCount) {
      cache.keys[kind].add(key);
      return;
    }
  }
  // klucz już jest (dodała go inna instancja) albo mapa pełna
  const existing = await days.updateOne({ _id: cache.day, [field]: { $exists: true } }, { $inc: { [field]: 1 } });
  if (existing.matchedCount) cache.keys[kind].add(key);
  else cache.full[kind] = true;
}

async function write(d: Db, e: TrackEvent, v: Visitor, now: number) {
  const t = stamp(now);
  const product = e.t === "pv" ? e.product : undefined;
  const cache = dayCache(t.day);
  const start = dayStart(t.day);

  let newDay = false;
  let newHour = false;
  let newView = false;
  if (e.t === "pv" && cache.uv < SEEN_CAP) {
    const docs = [
      { _id: `d|${t.day}|${v.id}`, exp: new Date(start + 2 * DAY_MS) },
      { _id: `h|${t.hour}|${v.id}`, exp: new Date(now + 2 * 3_600_000) },
    ];
    if (product && cache.vv < VIEWED_CAP) docs.push({ _id: `v|${t.day}|${v.id}|${product}`, exp: new Date(start + 2 * DAY_MS) });
    [newDay, newHour, newView = false] = await insertOnce(d, docs);
  }

  const totals: Partial<Record<keyof Totals, number>> = {};
  const add = (f: keyof Totals, by = 1) => (totals[f] = (totals[f] ?? 0) + by);
  const bumps: [Breakdown, string][] = [];
  if (e.t === "pv") {
    add("pv");
    if (e.isNew) add("s");
    if (e.n === 2) add("ms");
    bumps.push(["pages", e.path]);
    if (newDay) bumps.push(["sources", e.src], ["countries", v.country], ["devices", v.device]);
    if (newView && product) bumps.push(["products", String(product)]);
    if (e.q) {
      add("search");
      bumps.push(["searches", e.q]);
    }
  } else if (e.t === "out") {
    add("out");
    bumps.push(["agents", e.agent]);
  } else if (e.t === "promo") {
    add("promo");
  } else if (e.t === "search") {
    add("search");
    bumps.push(["searches", e.q]);
  }
  if ((e.t === "pv" || e.t === "ping") && e.dur > 0) add("dur", e.dur);

  const dayInc: Record<string, number> = { ...totals };
  if (newDay) {
    dayInc.uv = 1;
    dayInc[`nv.${t.hourOfDay}`] = 1;
  }
  if (newView) dayInc.vv = 1;
  // klucze, o których wiemy, że już są w dokumencie dnia, idą jednym $inc; nowe – osobno, z limitem
  const fresh: [Breakdown, string][] = [];
  for (const [kind, key] of bumps) {
    if (cache.keys[kind].has(key)) dayInc[`${kind}.${encodeField(key)}`] = (dayInc[`${kind}.${encodeField(key)}`] ?? 0) + 1;
    else fresh.push([kind, key]);
  }
  const hourInc: Record<string, number> = { ...totals };
  if (newHour) hourInc.uv = 1;

  const ops: Promise<unknown>[] = [
    d
      .collection<Str>(C.days)
      .findOneAndUpdate(
        { _id: t.day },
        { $inc: dayInc, $setOnInsert: { exp: new Date(start + (KEEP_DAYS + 1) * DAY_MS) } },
        { upsert: true, returnDocument: "after", projection: { uv: 1, vv: 1 } },
      )
      .then((doc) => {
        cache.uv = count(doc?.uv);
        cache.vv = count(doc?.vv);
      }),
    d
      .collection<Str>(C.hours)
      .updateOne({ _id: t.hour }, { $inc: hourInc, $setOnInsert: { exp: new Date(start + (KEEP_HOUR_DAYS + 1) * DAY_MS) } }, { upsert: true }),
    d
      .collection<Str>(C.live)
      .updateOne({ _id: `${e.src}|${e.sid}` }, { $set: { src: e.src, at: now, exp: new Date(now + LIVE_MS) } }, { upsert: true }),
  ];
  if (e.t === "pv") {
    ops.push(
      d
        .collection<Num>(C.minutes)
        .updateOne({ _id: t.minute }, { $inc: { pv: 1 }, $setOnInsert: { exp: new Date((t.minute + KEEP_MINUTES + 1) * 60_000) } }, { upsert: true }),
    );
  }
  if (newView && product) ops.push(d.collection<Str>(C.views).updateOne({ _id: String(product) }, { $inc: { n: 1 } }, { upsert: true }));
  await Promise.all(ops);
  // dokument dnia już istnieje (upsert wyżej), więc można dodawać nowe klucze
  for (const [kind, key] of fresh) await addKey(d, cache, kind, key);
}

/** Zapis zdarzenia w MongoDB. Nie rzuca – błędy są logowane, a przy awarii bazy zdarzenia przepadają. */
export async function recordMongo(e: TrackEvent, v: Visitor, now: number): Promise<void> {
  if (Date.now() < mem.pausedUntil || mem.inflight >= MAX_INFLIGHT) return;
  mem.inflight++;
  try {
    await write(await db(), e, v, now);
  } catch (err) {
    mem.pausedUntil = Date.now() + PAUSE_MS;
    logRare("zapis w MongoDB nieudany – zapisy wstrzymane na 10 s", err);
  } finally {
    mem.inflight--;
  }
}

function toDay(doc: Document): DayAgg {
  const d = emptyDay();
  d.closed = true;
  for (const f of TOTAL_FIELDS) d[f] = count(doc[f]);
  const nv = doc.nv;
  for (let h = 0; h < 24; h++) d.nv[h] = count(Array.isArray(nv) ? nv[h] : obj(nv)?.[String(h)]);
  for (const kind of BREAKDOWNS) {
    const limit = MAP_CAP[kind] + FIXED_PAGES.size;
    for (const [field, n] of Object.entries(obj(doc[kind]) ?? {})) {
      if (d.maps[kind].size >= limit) break;
      const key = decodeField(field);
      if (count(n) > 0 && validKey[kind](key)) d.maps[kind].set(key, count(n));
    }
  }
  return d;
}

function toTotals(doc: Document): Totals {
  const t = emptyTotals();
  for (const f of TOTAL_FIELDS) t[f] = count(doc[f]);
  return t;
}

/** Dane do raportu z MongoDB (rzuca, gdy baza nie odpowiada – panel pokaże błąd). */
export async function readSnapshotMongo(q: SnapshotQuery, now: number): Promise<Snapshot> {
  const d = await db();
  const mapDays = new Set(q.mapDays);
  const otherDays = [...new Set(q.days)].filter((day) => !mapDays.has(day));
  const totalsOnly = { nv: 1, ...Object.fromEntries(TOTAL_FIELDS.map((f) => [f, 1])) };
  const [withMaps, withoutMaps, hours, minutes, live] = await Promise.all([
    mapDays.size ? d.collection<Str>(C.days).find({ _id: { $in: [...mapDays] } }).toArray() : [],
    otherDays.length ? d.collection<Str>(C.days).find({ _id: { $in: otherDays } }, { projection: totalsOnly }).toArray() : [],
    q.hours.length ? d.collection<Str>(C.hours).find({ _id: { $in: q.hours } }).toArray() : [],
    d
      .collection<Num>(C.minutes)
      .find({ _id: { $gte: q.minutes[0], $lte: q.minutes[1] } })
      .toArray(),
    d
      .collection<Str>(C.live)
      .aggregate<{ _id: unknown; n: number }>([{ $match: { exp: { $gt: new Date(now) } } }, { $group: { _id: "$src", n: { $sum: 1 } } }])
      .toArray(),
  ]);

  const days = new Map<string, DayAgg>();
  for (const doc of [...withMaps, ...withoutMaps]) if (typeof doc._id === "string") days.set(doc._id, toDay(doc));
  const hourMap = new Map<string, Totals>();
  for (const doc of hours) if (typeof doc._id === "string") hourMap.set(doc._id, toTotals(doc));
  const minuteMap = new Map<number, number>();
  for (const doc of minutes) if (typeof doc._id === "number") minuteMap.set(doc._id, count(doc.pv));

  const bySource = new Map<SourceId, number>();
  let liveCount = 0;
  for (const row of live) {
    const n = count(row.n);
    const id: SourceId = isSource(row._id) ? row._id : "other";
    bySource.set(id, (bySource.get(id) ?? 0) + n);
    liveCount += n;
  }

  return {
    days,
    hours: hourMap,
    minutes: minuteMap,
    live: { count: liveCount, sources: [...bySource].sort((a, b) => b[1] - a[1]) },
    storage: "mongo",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  promise.catch(() => {}); // spóźniony błąd nie może zostać nieobsłużony
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`brak odpowiedzi w ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Wyświetlenia produktu – z pamięci podręcznej (1 min), najwyżej 0,5 s czekania na bazę; przy błędzie ostatnia znana wartość. */
export async function productViewsMongo(id: number): Promise<number> {
  const key = String(id);
  const now = Date.now();
  const cached = mem.views.get(key);
  if (cached && now - cached.at < VIEWS_CACHE_MS) return cached.n;
  if (now < mem.viewsPausedUntil) return cached?.n ?? 0;
  try {
    const doc = await withTimeout(
      db().then((d) => d.collection<Str>(C.views).findOne({ _id: key }, { projection: { n: 1 } })),
      VIEWS_TIMEOUT_MS,
    );
    const n = count(doc?.n);
    if (mem.views.size >= VIEWS_CACHE_CAP) mem.views.clear();
    mem.views.set(key, { n, at: now });
    return n;
  } catch (e) {
    mem.viewsPausedUntil = now + PAUSE_MS;
    logRare("odczyt wyświetleń z MongoDB nieudany", e);
    return cached?.n ?? 0;
  }
}
