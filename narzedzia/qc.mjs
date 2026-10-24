// Zdjęcia QC z magazynu (USFans) dla przedmiotów z katalogu -> cdn/q/ + cdn/p/ oraz strona/data/qc.json.
//   q/<hash>.webp  zdjęcie QC (max 1400×1400, q78)     p/<hash>.webp  podgląd (max 360×360, q70, ten sam hash)
//   hash = pierwsze 24 znaki sha1(adresu zdjęcia z USFans) – ta sama zasada co w galerii (npm run zdjecia).
// Źródło: GET https://www.usfans.com/api/goods/estimate-info?goodsId=<itemId> (weidian i 1688 – sam numer przedmiotu).
//   Jednostki wg interfejsu USFans: weight w gramach, length/width/height w cm, avgArrivalDays w dniach (średnia).
// Tempo: max 2 zapytania do API naraz, co najmniej 700 ms między startami; pobieranie zdjęć max 6 naraz.
// Blokada (kod 90000, HTTP 403/429, HTML/captcha zamiast JSON) -> przerwa 10 min, potem 20, 40, 80; przy 5. blokadzie
//   zapis i koniec (kod wyjścia 2). Błędy 5xx/sieci -> ponowienie z rosnącą przerwą.
// Wznawialne: pomija przedmioty sprawdzone w ostatnich 7 dniach (chyba że --od-nowa), pomija istniejące pliki,
//   ponawia brakujące zdjęcia z poprzednich uruchomień. Postęp zapisywany co 100 przedmiotów.
// Oryginały (niezaufane) w <zrodla>/qc-orig/<hash>.<ext>, odpowiedzi API (adresy zdjęć) w <zrodla>/qc-orig/_usfans.json.
// Użycie: node qc.mjs <folder-danych-strony> <folder-cdn> <folder-zrodla> [--limit N] [--od-nowa]
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { isIP } from "node:net";
import path from "node:path";
import { EXT, MAX_BYTES, Permanent, inspect, toWebp } from "./lib/obrazy.mjs";
import { mb, writeManifest } from "./lib/manifest.mjs";
import { arg, ensureDir, flag, hashOf, hostOf, isHttpsUrl, readJson, redact, sleep, writeAtomic, writeJson } from "./lib/wspolne.mjs";

const usage = "Użycie: node qc.mjs <folder-danych-strony> <folder-cdn> <folder-zrodla> [--limit N] [--od-nowa]";
const dataDir = arg(0, undefined, usage);
const cdn = arg(1, undefined, usage);
const zrodla = arg(2, undefined, usage);
const fromScratch = flag("od-nowa");
const limit = (() => {
  const i = process.argv.findIndex((a) => a === "--limit" || a.startsWith("--limit="));
  if (i < 0) return Infinity;
  const raw = process.argv[i].includes("=") ? process.argv[i].split("=")[1] : process.argv[i + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`Zła wartość --limit: ${raw}\n${usage}`);
    process.exit(1);
  }
  return n;
})();

const API = "https://www.usfans.com/api/goods/estimate-info?goodsId=";
const API_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; goatreps.com)", Accept: "application/json" };
const IMG_HEADERS = { "User-Agent": API_HEADERS["User-Agent"], Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" };
const API_PARALLEL = 2;
const API_GAP = 700; // ms między startami zapytań
const API_TIMEOUT = 20_000;
const API_RETRIES = 3; // dla 5xx / błędów sieci
const BLOCK_FIRST_WAIT = 10 * 60_000;
const MAX_BLOCKS = 5; // przy tej blokadzie kończymy (wcześniej przerwy 10 + 20 + 40 + 80 min)
const ERROR_STREAK_AS_BLOCK = 10; // tyle nieudanych odpowiedzi z rzędu traktujemy jak blokadę
const IMG_PARALLEL = 6;
const IMG_TIMEOUT = 60_000;
const IMG_RETRIES = 3;
const MAX_REDIRECTS = 3;
const MAX_PHOTOS = 100; // na jeden przedmiot
const FRESH_MS = 7 * 24 * 3600_000;
const SAVE_EVERY = 100;
const HIT_RATE_AT = 150;
const GALLERY = { max: 1400, quality: 78 };
const PREVIEW = { max: 360, quality: 70 };
const FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);

const productsFile = path.join(dataDir, "products.json");
const qcFile = path.join(dataDir, "qc.json");
const origDir = ensureDir(path.join(zrodla, "qc-orig"));
const stateFile = path.join(origDir, "_usfans.json");
for (const dir of ["q", "p"]) ensureDir(path.join(cdn, dir));
const qPath = (hash) => path.join(cdn, "q", `${hash}.webp`);
const pPath = (hash) => path.join(cdn, "p", `${hash}.webp`);
const ready = (hash) => existsSync(qPath(hash)) && existsSync(pPath(hash));
const reasonOf = (error) => String(error?.message ?? error).slice(0, 200);
const clock = (ms) => new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");

// ---------- katalog: unikalne itemId (kolejność jak w products.json) ----------
if (!existsSync(productsFile)) {
  console.error(`Brak ${productsFile} – najpierw uruchom npm run katalog`);
  process.exit(1);
}
const catalogIds = [];
const skippedPlatforms = new Map();
for (const p of readJson(productsFile)) {
  if (typeof p.itemId !== "string" || !/^\d{5,20}$/.test(p.itemId)) continue;
  if (p.platform !== "weidian" && p.platform !== "1688") {
    skippedPlatforms.set(p.platform, (skippedPlatforms.get(p.platform) ?? 0) + 1);
    continue;
  }
  if (!catalogIds.includes(p.itemId)) catalogIds.push(p.itemId);
}

// ---------- stan: odpowiedzi z poprzednich uruchomień ----------
// state.items[itemId] = { urls: string[] | null, photos?: string[], weight, dims, arrivalDays, checkedAt }
const state = existsSync(stateFile) ? readJson(stateFile) : { items: {} };
state.items ??= {};
if (existsSync(qcFile)) {
  // qc.json bez stanu (np. usunięty folder zrodla/) – zachowujemy wpisy, adresy zdjęć nieznane
  for (const [id, e] of Object.entries(readJson(qcFile).items ?? {}))
    if (!state.items[id]) state.items[id] = { urls: null, photos: e.photos ?? [], weight: e.weight ?? null, dims: e.dims ?? null, arrivalDays: e.arrivalDays ?? null, checkedAt: e.checkedAt };
}
const isFresh = (id) => {
  const t = Date.parse(state.items[id]?.checkedAt ?? "");
  return !fromScratch && Number.isFinite(t) && Date.now() - t < FRESH_MS;
};

function buildQc() {
  const ids = Object.keys(state.items).sort((a, b) => a.length - b.length || a.localeCompare(b));
  const lines = ids.map((id) => {
    const s = state.items[id];
    const hashes = s.urls ? s.urls.map(hashOf) : (s.photos ?? []);
    const photos = [...new Set(hashes)].filter(ready);
    return `${JSON.stringify(id)}:${JSON.stringify({ photos, weight: s.weight, dims: s.dims, arrivalDays: s.arrivalDays, checkedAt: s.checkedAt })}`;
  });
  const head = `{"updatedAt":${JSON.stringify(new Date().toISOString())},"source":"usfans","items":{`;
  return { text: lines.length ? `${head}\n${lines.join(",\n")}\n}}\n` : `${head}}}\n`, ids };
}
function saveAll() {
  state.updatedAt = new Date().toISOString();
  writeJson(stateFile, state);
  writeAtomic(qcFile, buildQc().text);
}

// ---------- normalizacja odpowiedzi (dane niezaufane) ----------
const positive = (v, max) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < max ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;
let rejectedUrls = 0;
function normalize(data) {
  const list = Array.isArray(data.qcImages) ? data.qcImages : [];
  const good = list.filter(isHttpsUrl);
  rejectedUrls += list.length - good.length;
  const urls = [];
  const seen = new Set();
  for (const u of good) {
    const h = hashOf(u);
    if (!seen.has(h) && urls.length < MAX_PHOTOS) seen.add(h) && urls.push(u);
  }
  const weight = positive(data.weight, 100_000);
  const [l, w, h] = [data.length, data.width, data.height].map((v) => positive(v, 1000));
  let arrivalDays = null;
  const a = data.avgArrivalDays;
  if (typeof a === "string" && /^\s*\d{1,3}\s*-\s*\d{1,3}\s*$/.test(a)) arrivalDays = a.replace(/\s+/g, "");
  else if (positive(a, 366)) arrivalDays = String(Math.max(1, Math.round(Number(a))));
  return {
    urls,
    weight: weight === null ? null : Math.max(1, Math.round(weight)),
    dims: l && w && h ? { l: round1(l), w: round1(w), h: round1(h) } : null,
    arrivalDays,
    checkedAt: new Date().toISOString(),
  };
}

// ---------- API USFans: tempo, blokady, ponowienia ----------
let lastStart = 0;
let pause = null;
let blocks = 0;
let gaveUp = false;
let blockedMs = 0;
const blockLog = [];

async function paceStart() {
  for (;;) {
    if (gaveUp) return false;
    if (pause) {
      await pause;
      continue;
    }
    const wait = lastStart + API_GAP - Date.now();
    if (wait <= 0) {
      lastStart = Date.now();
      return true;
    }
    await sleep(wait);
  }
}

function onBlocked(reason) {
  if (pause) return pause; // druga równoległa odpowiedź z tej samej blokady
  blocks++;
  blockLog.push(`${new Date().toISOString()} ${reason}`);
  if (blocks >= MAX_BLOCKS) {
    gaveUp = true;
    console.log(`Blokada USFans nr ${blocks} (${reason}) – kończę. Uruchom ponownie później, sprawdzone przedmioty zostaną pominięte.`);
    return Promise.resolve();
  }
  const ms = BLOCK_FIRST_WAIT * 2 ** (blocks - 1);
  saveAll();
  console.log(`Blokada USFans (${reason}) – przerwa ${ms / 60_000} min (blokada nr ${blocks}), wznowienie ok. ${clock(Date.now() + ms)}`);
  blockedMs += ms;
  pause = sleep(ms).then(() => {
    pause = null;
    console.log("Wznawiam zapytania do USFans.");
  });
  return pause;
}

async function readText(res, cap = 1_048_576) {
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > cap) throw new Permanent("za duża odpowiedź");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// { kind: "ok", data } | { kind: "blocked", reason } | { kind: "error", reason } | { kind: "stop" }
async function callApi(itemId) {
  for (let attempt = 0; ; attempt++) {
    if (!(await paceStart())) return { kind: "stop" };
    let res;
    let text;
    try {
      res = await fetch(API + encodeURIComponent(itemId), { headers: API_HEADERS, redirect: "manual", signal: AbortSignal.timeout(API_TIMEOUT) });
      text = await readText(res);
    } catch (error) {
      if (attempt < API_RETRIES) {
        await sleep(5000 * 3 ** attempt);
        continue;
      }
      const reason = error.name === "TimeoutError" ? "przekroczony czas" : `sieć: ${error.cause?.code ?? reasonOf(error)}`;
      return { kind: "error", reason };
    }
    if (res.status === 403 || res.status === 429) return { kind: "blocked", reason: `HTTP ${res.status}` };
    if (res.status >= 500) {
      if (attempt < API_RETRIES) {
        await sleep(5000 * 3 ** attempt);
        continue;
      }
      return { kind: "error", reason: `HTTP ${res.status}` };
    }
    if (res.status >= 300 && res.status < 400) return { kind: "blocked", reason: `przekierowanie HTTP ${res.status}` };
    if (!res.ok) return { kind: "error", reason: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (/html/i.test(type) || /^\s*</.test(text)) return { kind: "blocked", reason: "HTML/captcha zamiast JSON" };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "blocked", reason: "odpowiedź nie jest JSON-em" };
    }
    if (body?.code === 90000) return { kind: "blocked", reason: "kod 90000" };
    if (body?.code !== 200) {
      if (/captcha|verify|robot/i.test(text.slice(0, 2000))) return { kind: "blocked", reason: `kod ${body?.code} (captcha)` };
      return { kind: "error", reason: `kod ${body?.code}` };
    }
    if (!body.data || typeof body.data !== "object") return { kind: "error", reason: "brak pola data" };
    return { kind: "ok", data: body.data };
  }
}

// ---------- zdjęcia ----------
const imgHosts = new Map();
const redirectHosts = new Map();
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const stats = { photosNew: 0, photosFailed: 0, qBytes: 0, pBytes: 0, qFiles: 0, pFiles: 0 };

function assertPublicHost(url) {
  const host = hostOf(url).replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new Permanent(`niedozwolony host ${host}`);
  if (isIP(host) && /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:|f[cd]|fe80:)/i.test(host)) throw new Permanent(`niedozwolony adres ${host}`);
}

async function readCapped(res) {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await res.body?.cancel().catch(() => {});
    throw new Permanent("za duży plik (> 25 MB)");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Permanent("za duży plik (> 25 MB)");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Jedna próba: przekierowania obsługiwane ręcznie – tylko na https i publiczne hosty, max 3.
async function fetchImageOnce(url) {
  const signal = AbortSignal.timeout(IMG_TIMEOUT); // cały łańcuch razem z treścią
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isHttpsUrl(current)) throw new Permanent("adres nie jest https");
    assertPublicHost(current);
    const res = await fetch(current, { headers: IMG_HEADERS, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new Permanent(`HTTP ${res.status} bez adresu przekierowania`);
      const next = new URL(location, current);
      if (next.protocol !== "https:") throw new Permanent(`przekierowanie poza https (${next.protocol}//${next.hostname})`);
      bump(redirectHosts, next.hostname.toLowerCase());
      current = next.href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw new Permanent(`HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}`);
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (/text\/html|svg|xml|json|javascript/.test(type)) {
      await res.body?.cancel().catch(() => {});
      throw new Permanent(`to nie jest obraz (${type.split(";")[0]})`);
    }
    return await readCapped(res);
  }
  throw new Permanent("za dużo przekierowań");
}

async function downloadImage(url) {
  let last;
  for (let attempt = 0; attempt <= IMG_RETRIES; attempt++) {
    try {
      return await fetchImageOnce(url);
    } catch (error) {
      if (error instanceof Permanent) throw error;
      const code = error?.cause?.code ?? "";
      if (/ENOTFOUND|EAI_AGAIN|CERT|UNABLE_TO_VERIFY/.test(code)) throw new Permanent(`błąd sieci ${code}`);
      last = error.name === "TimeoutError" ? new Error("przekroczony czas 60 s") : error;
      if (attempt < IMG_RETRIES) await sleep(1500 * 3 ** attempt + Math.random() * 500);
    }
  }
  throw new Error(`${reasonOf(last)} – po ${IMG_RETRIES + 1} próbach`);
}

async function checkImage(buf) {
  const { format } = await inspect(buf); // sharp, limitInputPixels, odrzuca HTML/SVG
  if (!FORMATS.has(format)) throw new Permanent(`niedozwolony format ${format}`);
  return format;
}

const origIndex = new Map();
for (const f of readdirSync(origDir)) {
  const m = f.match(/^([a-f0-9]{24})\.(jpg|png|webp|gif|avif)$/);
  if (m) origIndex.set(m[1], path.join(origDir, f));
}

async function processPhoto(url, hash) {
  const needQ = !existsSync(qPath(hash));
  const needP = !existsSync(pPath(hash));
  if (!needQ && !needP) return true;
  try {
    let buf = null;
    let format = null;
    let fromNet = false;
    // kolejność: zapisany oryginał -> (gdy brakuje tylko p/) gotowe q/ -> pobranie
    for (const file of [origIndex.get(hash), needQ ? null : qPath(hash)]) {
      if (!file || !existsSync(file)) continue;
      try {
        const b = readFileSync(file);
        format = await checkImage(b);
        buf = b;
        break;
      } catch {
        if (file === origIndex.get(hash)) rmSync(file, { force: true }), origIndex.delete(hash);
      }
    }
    if (!buf) {
      bump(imgHosts, hostOf(url));
      buf = await downloadImage(url);
      format = await checkImage(buf);
      fromNet = true;
    }
    const small = needP ? await toWebp(buf, PREVIEW) : null;
    const big = needQ ? await toWebp(buf, GALLERY) : null;
    if (fromNet) {
      const file = path.join(origDir, `${hash}.${EXT[format]}`);
      writeAtomic(file, buf);
      origIndex.set(hash, file);
    }
    if (small) writeAtomic(pPath(hash), small), (stats.pBytes += small.length), stats.pFiles++;
    if (big) writeAtomic(qPath(hash), big), (stats.qBytes += big.length), stats.qFiles++;
    stats.photosNew++;
    return true;
  } catch (error) {
    stats.photosFailed++;
    console.log(`  Zdjęcie nieudane: ${redact(url)} – ${reasonOf(error)}`);
    return false;
  }
}

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    while (active < n && queue.length) {
      const { fn, resolve } = queue.shift();
      active++;
      fn()
        .then(resolve, () => resolve(false))
        .finally(() => {
          active--;
          next();
        });
    }
  };
  return (fn) => new Promise((resolve) => queue.push({ fn, resolve }) && next());
}
const imgLimit = limiter(IMG_PARALLEL);
const photoJobs = new Map(); // hash -> Promise<boolean>
function ensurePhoto(url) {
  const hash = hashOf(url);
  if (!photoJobs.has(hash) && !ready(hash)) photoJobs.set(hash, imgLimit(() => processPhoto(url, hash)));
}

// ---------- start ----------
const started = Date.now();
const fresh = catalogIds.filter(isFresh);
const toQuery = catalogIds.filter((id) => !isFresh(id)).slice(0, limit);
console.log(
  `Katalog: ${catalogIds.length} unikalnych itemId (weidian/1688)` +
    (skippedPlatforms.size ? `, pominięte inne platformy: ${[...skippedPlatforms].map(([k, v]) => `${k} ${v}`).join(", ")}` : "") +
    `. Sprawdzone w ostatnich 7 dniach (pomijam): ${fresh.length}${fromScratch ? " (--od-nowa)" : ""}. Do sprawdzenia teraz: ${toQuery.length}` +
    (Number.isFinite(limit) ? ` (--limit ${limit})` : ""),
);

// brakujące zdjęcia przedmiotów sprawdzonych wcześniej (np. przerwane uruchomienie)
let retried = 0;
for (const id of fresh)
  for (const url of state.items[id].urls ?? [])
    if (!ready(hashOf(url))) retried++, ensurePhoto(url);
if (retried) console.log(`Ponawiam ${retried} brakujących zdjęć z poprzednich uruchomień.`);

const run = { checked: 0, hits: 0, photos: 0, errors: new Map(), errorStreak: 0, weight: 0, dims: 0, arrival: 0 };
const queue = [...toQuery];
let sinceSave = 0;

function summaryLine() {
  return `zdjęcia QC ma ${run.hits}/${run.checked} (${pct(run.hits, run.checked)}), adresów zdjęć ${run.photos}, z wagą ${run.weight}, z wymiarami ${run.dims}, z czasem dostawy ${run.arrival}`;
}
const hostsLine = () => [...imgHosts].map(([h, n]) => `${h} (${n})`).join(", ") || "brak";

process.on("SIGINT", () => {
  saveAll();
  console.log(`\nPrzerwano – zapisano postęp (${Object.keys(state.items).length} przedmiotów w qc.json).`);
  process.exit(130);
});

async function apiWorker() {
  while (queue.length && !gaveUp) {
    if (pause) {
      await pause;
      continue;
    }
    const itemId = queue.shift();
    const r = await callApi(itemId);
    if (r.kind === "stop") {
      queue.unshift(itemId);
      return;
    }
    if (r.kind === "blocked") {
      queue.unshift(itemId);
      run.errorStreak = 0;
      await onBlocked(r.reason);
      continue;
    }
    if (r.kind === "error") {
      bump(run.errors, r.reason);
      if (++run.errorStreak >= ERROR_STREAK_AS_BLOCK) {
        run.errorStreak = 0;
        await onBlocked(`${ERROR_STREAK_AS_BLOCK} błędów z rzędu, ostatni: ${r.reason}`);
      }
      continue;
    }
    run.errorStreak = 0;
    const entry = normalize(r.data);
    state.items[itemId] = entry;
    run.checked++;
    if (entry.urls.length) run.hits++, (run.photos += entry.urls.length);
    if (entry.weight) run.weight++;
    if (entry.dims) run.dims++;
    if (entry.arrivalDays) run.arrival++;
    for (const url of entry.urls) ensurePhoto(url);
    if (run.checked === HIT_RATE_AT) console.log(`== Trafienia po pierwszych ${HIT_RATE_AT} sprawdzonych: ${summaryLine()}. Hosty zdjęć: ${hostsLine()}`);
    if (++sinceSave >= SAVE_EVERY) {
      sinceSave = 0;
      saveAll();
      const done = run.checked + [...run.errors.values()].reduce((a, b) => a + b, 0);
      const perItem = (Date.now() - started - blockedMs) / Math.max(1, done);
      const left = Math.round((queue.length * perItem) / 60_000);
      console.log(`API: ${done}/${toQuery.length} – ${summaryLine()}; zdjęcia: gotowe ${stats.photosNew}, nieudane ${stats.photosFailed}, w kolejce ${photoJobs.size - stats.photosNew - stats.photosFailed} – zostało ok. ${left} min`);
    }
  }
}

await Promise.all(Array.from({ length: API_PARALLEL }, apiWorker));
const pendingPhotos = photoJobs.size - stats.photosNew - stats.photosFailed;
if (pendingPhotos > 0) console.log(`Zapytania zakończone, czekam na zdjęcia (${pendingPhotos} w kolejce)...`);
await Promise.all(photoJobs.values());
saveAll();

// ---------- podsumowanie ----------
const { ids } = buildQc();
const all = ids.map((id) => state.items[id]);
const withPhotos = ids.filter((id) => {
  const s = state.items[id];
  return [...new Set(s.urls ? s.urls.map(hashOf) : (s.photos ?? []))].some(ready);
}).length;
const totalPhotos = new Set(all.flatMap((s) => (s.urls ? s.urls.map(hashOf) : (s.photos ?? []))).filter(ready)).size;
const errorCount = [...run.errors.values()].reduce((a, b) => a + b, 0);
console.log(`\nTo uruchomienie: sprawdzono ${run.checked}, ${summaryLine()}.`);
if (errorCount) console.log(`Nieudane zapytania (zostaną ponowione przy następnym uruchomieniu): ${errorCount} – ${[...run.errors].map(([k, v]) => `${k}: ${v}`).join(", ")}`);
if (rejectedUrls) console.log(`Odrzucone adresy zdjęć (nie https / niepoprawne): ${rejectedUrls}`);
console.log(`Zdjęcia: nowe ${stats.photosNew} (q/ ${stats.qFiles} plików, ${mb(stats.qBytes)}; p/ ${stats.pFiles} plików, ${mb(stats.pBytes)}), nieudane ${stats.photosFailed}.`);
console.log(`Hosty zdjęć (pobrania): ${hostsLine()}${redirectHosts.size ? `; przekierowania na: ${[...redirectHosts].map(([h, n]) => `${h} (${n})`).join(", ")}` : ""}`);
console.log(
  `qc.json: ${ids.length} przedmiotów, ze zdjęciami ${withPhotos} (${pct(withPhotos, ids.length)}), zdjęć ${totalPhotos}, ` +
    `z wagą ${all.filter((s) => s.weight).length}, z wymiarami ${all.filter((s) => s.dims).length}, z czasem dostawy ${all.filter((s) => s.arrivalDays).length}.`,
);
if (blockLog.length) console.log(`Blokady USFans: ${blockLog.length} (łączna przerwa ${Math.round(blockedMs / 60_000)} min): ${blockLog.join("; ")}`);
if (stats.qFiles || stats.pFiles) {
  const m = writeManifest(cdn);
  console.log(`manifest.json: ${m.count} plików, ${mb(m.bytes)}`);
}
const secs = Math.round((Date.now() - started) / 1000);
console.log(`Czas: ${Math.floor(secs / 60)} min ${secs % 60} s. Zapisano ${qcFile}`);
if (gaveUp) {
  console.log(`Nie sprawdzono ${queue.length} przedmiotów z powodu blokady – uruchom ponownie później: npm run qc`);
  process.exit(2);
}
