import "server-only";
import { getProduct } from "../catalog";
import { isSource, sources, type Range, type SourceId } from "./shared";
import { hoursOf, readState, shiftDay, stamp, TOTAL_FIELDS, type Breakdown, type DayAgg, type Totals } from "./store";

export { ranges, type Range } from "./shared";
export type { Totals } from "./store";
export { record, visitorId, stamp, type TrackEvent, type Visitor } from "./store";

export type Bucket = Totals & { key: string; future: boolean };

export type StatsReport = {
  range: Range;
  storage: "file" | "memory";
  granularity: "hour" | "day";
  current: Bucket[];
  previous: Bucket[];
  totals: Totals;
  previousTotals: Totals;
  live: { count: number; sources: [SourceId, number][]; perMinute: number[] };
  breakdown: {
    pages: [string, number][];
    sources: [string, number][];
    countries: [string, number][];
    devices: [string, number][];
    agents: [string, number][];
    products: [string, number][];
    searches: [string, number][];
  };
  productNames: Record<string, string>;
  updatedAt: number;
};

const TOP = 12;
const PRODUCT_PAGE = /^\/item\/details\/(\d{1,7})$/;

const empty = (): Totals => ({ uv: 0, pv: 0, s: 0, ms: 0, dur: 0, out: 0, promo: 0, search: 0 });

const pick = (src: Totals | undefined): Totals => {
  const out = empty();
  if (src) for (const f of TOTAL_FIELDS) out[f] = src[f];
  return out;
};

/**
 * Raport dla panelu. Semantyka jak w xayez: s = nowe sesje, ms = sesje z 2. odsłoną (odbicia = 1 − ms/s),
 * dur = sekundy aktywności, uv = unikalni, poprzedni okres = tyle samo czasu tuż przed.
 * Odwiedzający ma inny skrót każdego dnia, więc unikalni z kilku dni = suma dni.
 */
export async function readStats(range: Range, now = Date.now()): Promise<StatsReport> {
  const st = readState(now);
  const today = stamp(now);
  const byHour = range === "today" || range === "yesterday";
  const length = range === "7d" ? 7 : range === "30d" ? 30 : 1;
  const endDay = range === "yesterday" ? shiftDay(today.day, -1) : today.day;
  const prevEndDay = shiftDay(endDay, -length);

  const curDays = Array.from({ length }, (_, i) => shiftDay(endDay, i - length + 1));
  const prevDays = curDays.map((d) => shiftDay(d, -length));
  const curKeys = byHour ? hoursOf(endDay) : curDays;
  const prevKeys = byHour ? hoursOf(prevEndDay) : prevDays;
  // dziś liczymy tylko do bieżącej godziny – tak samo w poprzednim okresie (uczciwe porównanie)
  const cutoff = range === "today" ? today.hourOfDay : curKeys.length - 1;

  const bucket = (key: string, future: boolean): Bucket => ({
    ...(future ? empty() : pick(byHour ? st.hours.get(key) : st.days.get(key))),
    key,
    future,
  });
  const current = curKeys.map((k, i) => bucket(k, i > cutoff));
  const previous = prevKeys.map((k) => bucket(k, false));

  // unikalni w godzinach 0..cutoff = nowi tego dnia w tych godzinach (zbiór dnia nie jest potrzebny)
  const uvUntil = (day: string, hour: number) => (st.days.get(day)?.nv ?? []).slice(0, hour + 1).reduce((a, b) => a + b, 0);
  const uvOfDays = (days: string[]) => days.reduce((sum, d) => sum + (st.days.get(d)?.uv ?? 0), 0);

  const sum = (list: Bucket[], uv: number): Totals => {
    const t = empty();
    for (const b of list.slice(0, cutoff + 1)) for (const f of TOTAL_FIELDS) if (f !== "uv") t[f] += b[f];
    t.uv = uv;
    return t;
  };

  const merged = (kind: Breakdown, limit?: number): [string, number][] => {
    const all = new Map<string, number>();
    for (const d of curDays) {
      const day: DayAgg | undefined = st.days.get(d);
      if (day) for (const [k, n] of day.maps[kind]) all.set(k, (all.get(k) ?? 0) + n);
    }
    const sorted = [...all].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return limit ? sorted.slice(0, limit) : sorted;
  };

  const breakdown = {
    pages: merged("pages", TOP),
    sources: merged("sources"),
    countries: merged("countries"),
    devices: merged("devices"),
    agents: merged("agents"),
    products: merged("products", TOP),
    searches: merged("searches", TOP),
  };

  const productNames: Record<string, string> = {};
  const ids = [...breakdown.products.map(([id]) => id), ...breakdown.pages.map(([p]) => PRODUCT_PAGE.exec(p)?.[1]).filter((x): x is string => !!x)];
  for (const id of ids) {
    const title = getProduct(Number(id))?.title;
    if (title) productNames[id] = title.slice(0, 160);
  }

  const liveBySource = new Map<SourceId, number>();
  for (const key of st.live.keys()) {
    const src = key.split("|")[0];
    const id: SourceId = isSource(src) ? src : "other";
    liveBySource.set(id, (liveBySource.get(id) ?? 0) + 1);
  }

  return {
    range,
    storage: st.storage,
    granularity: byHour ? "hour" : "day",
    current,
    previous,
    totals: sum(current, byHour ? uvUntil(endDay, cutoff) : uvOfDays(curDays)),
    previousTotals: sum(previous, byHour ? uvUntil(prevEndDay, cutoff) : uvOfDays(prevDays)),
    live: {
      count: st.live.size,
      sources: [...liveBySource].sort((a, b) => b[1] - a[1]),
      perMinute: Array.from({ length: 30 }, (_, i) => st.minutes.get(today.minute - 29 + i) ?? 0),
    },
    breakdown,
    productNames,
    updatedAt: now,
  };
}

export const sourceLabel = (id: string) => (isSource(id) ? sources[id].label : id);
