// Jednorazowe przeniesienie statystyk z data/statystyki.json do MongoDB (format plikowego magazynu, v: 1).
// Wywołuje to skrypt startowy przed `next start`:
//
//   import { seedStats } from "./seed-stats.mjs";
//   await seedStats(db, path.join(root, "data", "statystyki.json"), console.log);
//
// Idempotentne: gdy stats_days ma już jakikolwiek dokument – nic nie robi. Dokumenty mają stałe _id, więc dwie instancje
// startujące naraz też nie policzą niczego dwa razy (duplikaty są pomijane), a dni wstawiane są na końcu.
// Bez TypeScriptu i aliasów Next – reguły walidacji to kopie z src/lib/analytics/shared.ts i model.ts (zmieniaj razem).

import { readFile } from "node:fs/promises";

const KEEP_DAYS = 100;
const KEEP_HOUR_DAYS = 3;
const DAY_MS = 86_400_000;
const MAX_COUNT = 1e12;
const SEEN_CAP = 200_000;
const VIEWED_CAP = 300_000;
const VIEWS_CAP = 20_000;

const TOTAL_FIELDS = ["uv", "pv", "s", "ms", "dur", "out", "promo", "search"];
const BREAKDOWNS = ["pages", "sources", "countries", "devices", "agents", "products", "searches"];
const MAP_CAP = { pages: 1000, sources: 32, countries: 300, devices: 3, agents: 16, products: 5000, searches: 500 };

const PATHS = /^\/(?:products|qc-finder|link-converter|tracking|shipping|tools|photo-search|item\/details\/\d{1,7})?$/;
const SOURCES = new Set(["google", "bing", "duckduckgo", "facebook", "instagram", "tiktok", "discord", "youtube", "reddit", "x", "telegram", "direct", "other"]);
const AGENTS = new Set(["kakobuy", "usfans", "allchinabuy", "acbuy", "litbuy", "cnfans", "mulebuy", "oopbuy", "oryginal"]);
const DEVICES = new Set(["mobile", "tablet", "desktop"]);
const SEARCH_CHARS = /^[a-z0-9ąćęłńóśźż -]+$/;
const VISITOR_ID = /^[A-Za-z0-9_-]{12}$/;
const VIEWED_ID = /^([A-Za-z0-9_-]{12})([1-9]\d{0,6})$/;

const normalizeSearch = (q) => {
  if (typeof q !== "string" || q.length > 200) return null;
  const s = q.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
  return s && s.length <= 40 && SEARCH_CHARS.test(s) && /[a-z0-9ąćęłńóśźż]/.test(s) ? s : null;
};

const validKey = {
  pages: (k) => k === "/inne" || PATHS.test(k),
  sources: (k) => SOURCES.has(k),
  countries: (k) => /^[A-Z]{2}$/.test(k),
  devices: (k) => DEVICES.has(k),
  agents: (k) => AGENTS.has(k),
  products: (k) => /^[1-9]\d{0,6}$/.test(k),
  searches: (k) => normalizeSearch(k) === k,
};

// to samo co encodeField w src/lib/mongo.ts – "." i "$" na początku nie mogą być w nazwie pola
const encodeField = (field) => field.replace(/[%.]/g, (c) => (c === "%" ? "%25" : "%2E")).replace(/^\$/, "%24");

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const count = (v) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COUNT ? v : 0);
const dayStart = (day) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));

const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function stamp(ms) {
  const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const day = `${p.year}${p.month}${p.day}`;
  return { day, hour: `${day}${p.hour}` };
}
function shiftDay(day, n) {
  const d = new Date(dayStart(day) + n * DAY_MS);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** insertMany bez przerywania na duplikatach (_id już jest = dokument już przeniesiony). Zwraca liczbę nowych. */
async function insertNew(collection, docs) {
  let added = 0;
  for (let i = 0; i < docs.length; i += 1000) {
    const chunk = docs.slice(i, i + 1000);
    try {
      added += (await collection.insertMany(chunk, { ordered: false })).insertedCount;
    } catch (e) {
      const errors = e?.writeErrors ? (Array.isArray(e.writeErrors) ? e.writeErrors : [e.writeErrors]) : null;
      if (!errors || errors.some((we) => we.code !== 11000)) throw e;
      added += chunk.length - errors.length;
    }
  }
  return added;
}

/**
 * @param {import("mongodb").Db} db
 * @param {string} file ścieżka do data/statystyki.json
 * @param {(message: string) => void} [log]
 * @returns {Promise<{ skipped: true, reason: "not-empty" | "no-file" } | { skipped: false, days: number, hours: number, seen: number, views: number }>}
 */
export async function seedStats(db, file, log = console.log) {
  if (await db.collection("stats_days").findOne({}, { projection: { _id: 1 } })) {
    log("[statystyki] MongoDB ma już statystyki – import z pliku pominięty");
    return { skipped: true, reason: "not-empty" };
  }
  let raw;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e?.code === "ENOENT") {
      log("[statystyki] brak pliku ze statystykami – nie ma czego przenosić");
      return { skipped: true, reason: "no-file" };
    }
    throw new Error(`nie można odczytać ${file}: ${e instanceof Error ? e.message : e}`);
  }
  const root = obj(raw);
  if (!root || root.v !== 1) throw new Error(`${file}: nieznany format (oczekiwano v: 1)`);

  const now = Date.now();
  const t = stamp(now);
  const oldestDay = shiftDay(t.day, -(KEEP_DAYS - 1));
  const oldestHourDay = shiftDay(t.day, -(KEEP_HOUR_DAYS - 1));
  const today = obj(root.today);
  const todayValid = today && today.day === t.day;

  // odwiedzający z bieżącej doby – żeby po przeniesieniu ci sami ludzie nie liczyli się drugi raz
  const seen = [];
  let viewedToday = 0;
  if (todayValid) {
    const dayExp = new Date(dayStart(t.day) + 2 * DAY_MS);
    for (const id of (Array.isArray(today.seen) ? today.seen : []).slice(0, SEEN_CAP)) {
      if (typeof id === "string" && VISITOR_ID.test(id)) seen.push({ _id: `d|${t.day}|${id}`, exp: dayExp });
    }
    for (const id of (Array.isArray(today.viewed) ? today.viewed : []).slice(0, VIEWED_CAP)) {
      const m = typeof id === "string" ? VIEWED_ID.exec(id) : null;
      if (m) {
        seen.push({ _id: `v|${t.day}|${m[1]}|${m[2]}`, exp: dayExp });
        viewedToday++;
      }
    }
    if (today.hour === t.hour) {
      const hourExp = new Date(now + 2 * 3_600_000);
      for (const id of (Array.isArray(today.hourSeen) ? today.hourSeen : []).slice(0, SEEN_CAP)) {
        if (typeof id === "string" && VISITOR_ID.test(id)) seen.push({ _id: `h|${t.hour}|${id}`, exp: hourExp });
      }
    }
  }

  const days = [];
  const productSums = new Map();
  for (const [key, value] of Object.entries(obj(root.days) ?? {})) {
    const d = obj(value);
    if (!d || !/^\d{8}$/.test(key) || key < oldestDay || key > t.day) continue;
    const doc = { _id: key, exp: new Date(dayStart(key) + (KEEP_DAYS + 1) * DAY_MS), keys: {} };
    for (const f of TOTAL_FIELDS) doc[f] = count(d[f]);
    doc.nv = {};
    if (Array.isArray(d.nv)) d.nv.slice(0, 24).forEach((n, h) => {
      if (count(n)) doc.nv[String(h)] = count(n);
    });
    let vv = 0;
    for (const kind of BREAKDOWNS) {
      const map = {};
      let size = 0;
      for (const [k, n] of Object.entries(obj(d[kind]) ?? {})) {
        if (size >= MAP_CAP[kind]) break;
        if (count(n) > 0 && validKey[kind](k)) {
          map[encodeField(k)] = count(n);
          size++;
          if (kind === "products") {
            vv += count(n);
            productSums.set(k, (productSums.get(k) ?? 0) + count(n));
          }
        }
      }
      doc[kind] = map;
      doc.keys[kind] = size;
    }
    doc.vv = key === t.day && todayValid ? viewedToday : vv;
    days.push(doc);
  }

  const hours = [];
  for (const [key, value] of Object.entries(obj(root.hours) ?? {})) {
    const h = obj(value);
    if (!h || !/^\d{10}$/.test(key) || key.slice(0, 8) < oldestHourDay || key.slice(0, 8) > t.day) continue;
    const doc = { _id: key, exp: new Date(dayStart(key.slice(0, 8)) + (KEEP_HOUR_DAYS + 1) * DAY_MS) };
    for (const f of TOTAL_FIELDS) doc[f] = count(h[f]);
    hours.push(doc);
  }

  // licznik wyświetleń produktów (od początku); starszy plik bez niego – suma zapisanych dni
  const views = [];
  const savedViews = obj(root.views);
  for (const [k, n] of savedViews ? Object.entries(savedViews) : productSums) {
    if (views.length >= VIEWS_CAP) break;
    if (count(n) > 0 && validKey.products(k)) views.push({ _id: k, n: count(n) });
  }

  // dni na końcu: gdyby import przerwał się w połowie, następny start spróbuje jeszcze raz (stats_days puste)
  const result = {
    skipped: false,
    seen: await insertNew(db.collection("stats_seen"), seen),
    views: await insertNew(db.collection("product_views"), views),
    hours: await insertNew(db.collection("stats_hours"), hours),
    days: await insertNew(db.collection("stats_days"), days),
  };
  log(`[statystyki] przeniesiono do MongoDB: ${result.days} dni, ${result.hours} godzin, ${result.views} liczników produktów, ${result.seen} dzisiejszych odwiedzin`);
  return result;
}
