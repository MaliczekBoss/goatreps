// Zdjęcia produktów prosto z Weidian -> cdn/q/ + cdn/p/ i dopisanie ich do galerii w strona/data/products.json.
//   q/<hash>.webp  zdjęcie (max 1400×1400, q78)        p/<hash>.webp  podgląd (max 360×360, q70, ten sam hash)
//   i/<hash>.webp + t/<hash>.webp – tylko dla produktów bez zdjęcia głównego (z pierwszego zdjęcia z Weidian, max 1400 / 480).
//   hash = pierwsze 24 znaki sha1(adresu zdjęcia). Adres si.geilicdn.com sprowadzamy do oryginału (bez ".webp?w=700&cp=1"
//   i parametrów); jeśli to samo zdjęcie jest już w galerii ze starej strony (zrodla/scalone.json), bierzemy jego dotychczasowy
//   hash – plik na CDN się nie dubluje.
// Źródło: GET https://thor.weidian.com/detail/getItemInfo/1.0?param={"vItemId":"<itemId>"} -> result.default_model.item_info.imgs
//   (zdjęcia główne oferty, max 15). Zdjęć wariantów (SKU) nie bierzemy – w jednej ofercie bywa wiele różnych produktów.
//   Ta odpowiedź nie ma zdjęć z opisu.
// Galeria: nowe zdjęcia dopisywane za istniejącymi, w kolejności z Weidian, bez powtórzeń. Pomijane: ten sam hash co zdjęcie
//   główne (i/), zdjęcia już obecne w galerii oraz zdjęcia wizualnie takie same jak główne lub jak któreś z galerii
//   (dHash 64 bity, odległość ≤ 5) – pierwsze zdjęcie z Weidian to zwykle to samo, co zdjęcie główne produktu.
//   Kilka produktów z tym samym itemId dostaje te same zdjęcia (każdy z osobna sprawdzany pod kątem powtórzeń).
// Tempo: zapytania do Weidian pojedynczo, co 1–1,5 s (losowo); pobieranie zdjęć max 4 naraz. Gdy w kolejce czeka
//   ponad 120 zdjęć, kolejne zapytania czekają (zdjęcia są wolniejsze niż API).
// Blokada (HTTP 403/429, 5xx po ponowieniach, przekierowanie, HTML/captcha zamiast JSON, komunikat o weryfikacji, seria błędów)
//   -> przerwa 10 min, potem 20, 40; przy 4. blokadzie zapis i koniec (kod wyjścia 2). Treści odpowiedzi nie są logowane.
// Bezpieczeństwo: zdjęcia tylko https z *.geilicdn.com (także każde przekierowanie), max 15 MB, max 3 przekierowania,
//   typ sprawdzany przez sharp (jpeg/png/webp/gif/avif), limit pikseli, min. 200 px, proporcje max 1:4, WebP bez metadanych.
// Wznawialne: stan w <zrodla>/weidian/_info.json (adresy zdjęć, checkedAt, dHash), oryginały (niezaufane) w <zrodla>/weidian/orig/.
//   Pomija przedmioty sprawdzone w ostatnich 7 dniach (chyba że --od-nowa) i istniejące pliki, ponawia brakujące zdjęcia.
//   products.json zapisywany co 25 przedmiotów (strona wczytuje go sama po zmianie pliku), zawsze na podstawie pełnego stanu –
//   po przebudowie katalogu (npm run katalog) wystarczy uruchomić z --limit 0 (bez zapytań do Weidian).
// Użycie: node weidian-zdjecia.mjs <folder-danych-strony> <folder-cdn> <folder-zrodla> [--limit N] [--od-nowa]
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { EXT, LIMIT_PIXELS, Permanent, inspect, toWebp } from "./lib/obrazy.mjs";
import { mb, writeManifest } from "./lib/manifest.mjs";
import { UA, arg, ensureDir, flag, geiliOriginal, hashOf, hostOf, isHttpsUrl, readJson, sleep, writeAtomic, writeJson, writeJsonLines } from "./lib/wspolne.mjs";

const usage = "Użycie: node weidian-zdjecia.mjs <folder-danych-strony> <folder-cdn> <folder-zrodla> [--limit N] [--od-nowa]";
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

const API = "https://thor.weidian.com/detail/getItemInfo/1.0?param=";
const API_HEADERS = { "User-Agent": UA, Accept: "application/json", Referer: "https://weidian.com/" };
const IMG_HEADERS = { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" };
const API_GAP = 1000; // ms między startami zapytań ...
const API_JITTER = 500; // ... plus losowo 0–500 ms
const API_TIMEOUT = 20_000;
const API_RETRIES = 2; // dla 5xx / błędów sieci (potem 5xx = blokada, sieć = błąd)
const API_MAX_BYTES = 2 * 1024 * 1024;
const BLOCK_FIRST_WAIT = 10 * 60_000;
const MAX_BLOCKS = 4; // przy tej blokadzie kończymy (wcześniej przerwy 10 + 20 + 40 min)
const ERROR_STREAK_AS_BLOCK = 10; // tyle nieudanych zapytań z rzędu traktujemy jak blokadę
const IMG_FAIL_STREAK_AS_BLOCK = 20; // tyle nieudanych pobrań zdjęć z rzędu (HTTP 403/429/5xx, sieć) = blokada
const IMG_PARALLEL = 4;
const MAX_BACKLOG = 120; // przy większej kolejce zdjęć wstrzymujemy kolejne zapytania
const IMG_TIMEOUT = 60_000;
const IMG_RETRIES = 3;
const IMG_MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const IMG_HOST = /(^|\.)geilicdn\.com$/; // serwery zdjęć Weidian
const MAX_PHOTOS = 15; // na jeden przedmiot
const MIN_SIDE = 200; // px – mniejsze to ikony/paski, nie zdjęcia produktu
const MAX_RATIO = 4; // dłuższy bok / krótszy – dłuższe paski to grafiki z opisu
const DUP_DISTANCE = 5; // dHash: odległość ≤ 5 z 64 bitów = to samo zdjęcie (różne zdjęcia mają zwykle > 10)
const FRESH_MS = 7 * 24 * 3600_000;
const SAVE_EVERY = 25;
const HIT_RATE_AT = 150;
const MAIN = { max: 1400, quality: 78 };
const THUMB = { max: 480, quality: 72 };
const GALLERY = { max: 1400, quality: 78 };
const PREVIEW = { max: 360, quality: 70 };
const FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);
const BLOCK_TEXT = /captcha|verify|challenge|just a moment|cf-chl|滑块|验证|频繁|punish|too many|rate.?limit|登录/i;
const CODE_GONE = 831013; // 商品不存在

const productsFile = path.join(dataDir, "products.json");
const scaloneFile = path.join(zrodla, "scalone.json");
const baseDir = ensureDir(path.join(zrodla, "weidian"));
const origDir = ensureDir(path.join(baseDir, "orig"));
const stateFile = path.join(baseDir, "_info.json");
for (const dir of ["i", "t", "q", "p"]) ensureDir(path.join(cdn, dir));
const file = (folder, hash) => path.join(cdn, folder, `${hash}.webp`);
const ready = (hash) => existsSync(file("q", hash)) && existsSync(file("p", hash));
const mainReady = (hash) => existsSync(file("i", hash)) && existsSync(file("t", hash));
const hashOfRel = (rel) => (typeof rel === "string" ? (rel.match(/^[iq]\/([a-f0-9]{24})\.webp$/)?.[1] ?? null) : null);
const reasonOf = (error) => String(error?.message ?? error).slice(0, 200);
const clock = (ms) => new Date(ms).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");
const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const listMap = (map) => [...map].map(([k, v]) => `${k} (${v})`).join(", ") || "brak";

// Ten sam obraz bywa podawany jako oryginał ("..._800_800.jpg") albo miniatura ("..._800_800.jpg.webp?w=700&cp=1",
// "..._800_800.jpg?w=110&h=110&cp=1"). Klucz = adres oryginału bez parametrów.
function canonical(url) {
  if (hostOf(url) !== "si.geilicdn.com") return url;
  return (geiliOriginal(url) ?? url).replace(/[?#].*$/, "");
}

// ---------- katalog: unikalne itemId weidian (kolejność jak w products.json) ----------
if (!existsSync(productsFile)) {
  console.error(`Brak ${productsFile} – najpierw uruchom npm run katalog`);
  process.exit(1);
}
const byItem = new Map(); // itemId -> produkty (stan z chwili startu – do decyzji, które zdjęcia przetwarzać)
for (const p of readJson(productsFile)) {
  if (p.platform !== "weidian" || typeof p.itemId !== "string" || !/^\d{5,20}$/.test(p.itemId)) continue;
  (byItem.get(p.itemId) ?? byItem.set(p.itemId, []).get(p.itemId)).push({ image: p.image, gallery: [...p.gallery] });
}
const catalogIds = [...byItem.keys()];
const mainless = new Set(catalogIds.filter((id) => byItem.get(id).some((p) => !p.image)));

// ---------- zdjęcia galerii ze starej strony: klucz (oryginał) -> dotychczasowy hash ----------
const legacy = new Map();
if (existsSync(scaloneFile)) {
  for (const p of readJson(scaloneFile).products ?? [])
    for (const src of p.gallerySrc ?? []) {
      if (!isHttpsUrl(src)) continue;
      const key = canonical(src);
      const h = hashOf(src);
      const current = legacy.get(key);
      if (!current || (!ready(current) && ready(h))) legacy.set(key, h);
    }
} else console.log(`Uwaga: brak ${scaloneFile} – nie rozpoznam zdjęć ze starej strony po adresie (zostają tylko porównania wizualne).`);
const photoHash = (url) => legacy.get(url) ?? hashOf(url);

// ---------- stan z poprzednich uruchomień ----------
// state.items[itemId] = { status: "ok" | "wycofany" | "usuniety" | "nie-istnieje", urls: string[], checkedAt }
// state.dhash[hash] = "<16 znaków hex>" – odcisk obrazu do wykrywania powtórzeń (zdjęcia z Weidian i istniejące i/, q/)
const state = existsSync(stateFile) ? readJson(stateFile) : {};
state.items ??= {};
state.dhash ??= {};
const isFresh = (id) => {
  const t = Date.parse(state.items[id]?.checkedAt ?? "");
  return !fromScratch && Number.isFinite(t) && Date.now() - t < FRESH_MS;
};
function saveState() {
  state.updatedAt = new Date().toISOString();
  writeJson(stateFile, state);
}

// ---------- odcisk obrazu (dHash) ----------
async function dhashOf(buf) {
  const { data, info } = await sharp(buf, { limitInputPixels: LIMIT_PIXELS, failOn: "error", animated: false })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (data[(y * 9 + x) * c] > data[(y * 9 + x + 1) * c] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}
function distance(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  for (; x; x >>= 1n) n += Number(x & 1n);
  return n;
}
const similar = (a, b) => !!a && !!b && distance(a, b) <= DUP_DISTANCE;
// Odcisk pliku z naszego CDN (t/ dla zdjęcia głównego, p/ dla galerii) – liczony raz, potem z pamięci/stanu.
async function dhashCdn(hash, folder) {
  if (state.dhash[hash]) return state.dhash[hash];
  const f = file(folder, hash);
  if (!existsSync(f)) return null;
  try {
    return (state.dhash[hash] = await dhashOf(readFileSync(f)));
  } catch {
    return null;
  }
}
// Czy to zdjęcie trafi do galerii któregoś produktu z tym itemId (inne niż główne, nie ma go jeszcze w galerii)?
async function wantedFor(itemId, hashes, idx, d) {
  const hash = hashes[idx];
  for (const p of byItem.get(itemId) ?? []) {
    const mainHash = hashOfRel(p.image) ?? hashes[0]; // bez zdjęcia głównego: pierwsze z Weidian stanie się główne
    if (hash === mainHash || p.gallery.includes(`q/${hash}.webp`)) continue;
    if (similar(p.image ? await dhashCdn(mainHash, "t") : state.dhash[mainHash], d)) continue;
    let dup = false;
    for (const g of p.gallery) {
      const gh = hashOfRel(g);
      if (gh && similar(await dhashCdn(gh, "p"), d)) {
        dup = true;
        break;
      }
    }
    if (!dup) return true;
  }
  return false;
}

// ---------- API Weidian: tempo, blokady, ponowienia ----------
let nextStart = 0;
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
    const wait = nextStart - Date.now();
    if (wait <= 0) {
      nextStart = Date.now() + API_GAP + Math.random() * API_JITTER;
      return true;
    }
    await sleep(wait);
  }
}

function onBlocked(reason) {
  if (pause) return pause; // ta sama blokada zgłoszona drugi raz (np. przez pobieranie zdjęć)
  if (gaveUp) return Promise.resolve();
  blocks++;
  blockLog.push(`${new Date().toISOString()} ${reason}`);
  if (blocks >= MAX_BLOCKS) {
    gaveUp = true;
    console.log(`Blokada nr ${blocks} (${reason}) – kończę. Uruchom ponownie później, sprawdzone przedmioty zostaną pominięte.`);
    return Promise.resolve();
  }
  const ms = BLOCK_FIRST_WAIT * 2 ** (blocks - 1);
  saveState();
  console.log(`Blokada (${reason}) – przerwa ${ms / 60_000} min (blokada nr ${blocks}), wznowienie ok. ${clock(Date.now() + ms)}`);
  blockedMs += ms;
  pause = sleep(ms).then(() => {
    pause = null;
    console.log("Wznawiam.");
  });
  return pause;
}

async function readCapped(res, cap, label) {
  if (Number(res.headers.get("content-length") ?? 0) > cap) {
    await res.body?.cancel().catch(() => {});
    throw new Permanent(`za duży ${label} (> ${cap / 1048576} MB)`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.length;
    if (size > cap) throw new Permanent(`za duży ${label} (> ${cap / 1048576} MB)`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

// { kind: "ok", item } | { kind: "gone" } | { kind: "blocked", reason } | { kind: "error", reason } | { kind: "stop" }
async function callApi(itemId) {
  for (let attempt = 0; ; attempt++) {
    if (!(await paceStart())) return { kind: "stop" };
    let res;
    let text;
    try {
      const url = API + encodeURIComponent(JSON.stringify({ vItemId: itemId }));
      res = await fetch(url, { headers: API_HEADERS, redirect: "manual", signal: AbortSignal.timeout(API_TIMEOUT) });
      text = (await readCapped(res, API_MAX_BYTES, "odpowiedź")).toString("utf8");
    } catch (error) {
      if (error instanceof Permanent) return { kind: "error", reason: reasonOf(error) };
      if (attempt < API_RETRIES) {
        await sleep(5000 * 3 ** attempt);
        continue;
      }
      return { kind: "error", reason: error.name === "TimeoutError" ? "przekroczony czas" : `sieć: ${error.cause?.code ?? reasonOf(error)}` };
    }
    if (res.status === 403 || res.status === 429) return { kind: "blocked", reason: `HTTP ${res.status}` };
    if (res.status >= 500) {
      if (attempt < API_RETRIES) {
        await sleep(5000 * 3 ** attempt);
        continue;
      }
      return { kind: "blocked", reason: `HTTP ${res.status} (${API_RETRIES + 1} razy)` };
    }
    if (res.status >= 300 && res.status < 400) return { kind: "blocked", reason: `przekierowanie HTTP ${res.status}` };
    if (!res.ok) return { kind: "error", reason: `HTTP ${res.status}` };
    if (/html/i.test(res.headers.get("content-type") ?? "") || /^\s*</.test(text)) return { kind: "blocked", reason: "HTML/captcha zamiast JSON" };
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { kind: "blocked", reason: "odpowiedź nie jest JSON-em" };
    }
    const status = obj(obj(body)?.status);
    const code = status?.code;
    if (typeof code !== "number") return { kind: "error", reason: "brak pola status" };
    if (code === CODE_GONE) return { kind: "gone" };
    if (code !== 0) {
      // tylko komunikat statusu (nie cała odpowiedź – w danych przedmiotu są np. pola "risk_info")
      const message = `${status.message ?? ""} ${status.description ?? ""}`.slice(0, 300);
      return BLOCK_TEXT.test(message) ? { kind: "blocked", reason: `kod ${code} (weryfikacja)` } : { kind: "error", reason: `kod ${code}` };
    }
    const item = obj(obj(obj(obj(body)?.result)?.default_model)?.item_info);
    if (!item) return { kind: "error", reason: "brak item_info" };
    return { kind: "ok", item };
  }
}

// ---------- normalizacja odpowiedzi (dane niezaufane) ----------
const rejectedHosts = new Map();
const imgHosts = new Map();
function normalize(item) {
  const flags = obj(item.flag) ?? {};
  const list = (Array.isArray(item.imgs) ? item.imgs : []).filter((u) => typeof u === "string");
  if (!list.length && typeof item.item_head === "string") list.push(item.item_head); // zapas, gdy brak listy
  const urls = [];
  for (const raw of list) {
    const u = raw.trim();
    if (!isHttpsUrl(u) || !IMG_HOST.test(hostOf(u))) {
      bump(rejectedHosts, hostOf(u) || "(niepoprawny adres)");
      continue;
    }
    const c = canonical(u);
    if (!urls.includes(c) && urls.length < MAX_PHOTOS) urls.push(c), bump(imgHosts, hostOf(c));
  }
  const status = flags.is_status_deleted === true ? "usuniety" : flags.is_status_off_shelve === true ? "wycofany" : "ok";
  return { status, urls, checkedAt: new Date().toISOString() };
}

// ---------- pobieranie zdjęć ----------
const redirectHosts = new Map();
let imgFailStreak = 0;

function assertImageUrl(url) {
  if (!isHttpsUrl(url)) throw new Permanent("adres nie jest https");
  if (!IMG_HOST.test(hostOf(url))) throw new Permanent(`niedozwolony host ${hostOf(url)}`);
}

// Jedna próba: przekierowania ręcznie – tylko na https i *.geilicdn.com, max 3.
async function fetchImageOnce(url) {
  const signal = AbortSignal.timeout(IMG_TIMEOUT); // cały łańcuch razem z treścią
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertImageUrl(current);
    const res = await fetch(current, { headers: IMG_HEADERS, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new Permanent(`HTTP ${res.status} bez adresu przekierowania`);
      const next = new URL(location, current);
      if (next.protocol !== "https:" || !IMG_HOST.test(next.hostname.toLowerCase())) throw new Permanent(`przekierowanie poza *.geilicdn.com (${next.protocol}//${next.hostname})`);
      bump(redirectHosts, next.hostname.toLowerCase());
      current = next.href;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      const err = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? new Permanent(`HTTP ${res.status}`) : new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (/text\/html|svg|xml|json|javascript/.test(type)) {
      await res.body?.cancel().catch(() => {});
      throw new Permanent(`to nie jest obraz (${type.split(";")[0]})`);
    }
    return await readCapped(res, IMG_MAX_BYTES, "plik");
  }
  throw new Permanent("za dużo przekierowań");
}

async function downloadImage(url) {
  let last;
  for (let attempt = 0; attempt <= IMG_RETRIES; attempt++) {
    while (pause) await pause;
    if (gaveUp) throw new Error("przerwane (blokada)");
    try {
      const buf = await fetchImageOnce(url);
      imgFailStreak = 0;
      return buf;
    } catch (error) {
      if (error instanceof Permanent) {
        // 403 z serwera zdjęć może oznaczać blokadę – liczymy serię
        if (error.status === 403 && ++imgFailStreak >= IMG_FAIL_STREAK_AS_BLOCK) imgFailStreak = 0, await onBlocked(`zdjęcia: ${IMG_FAIL_STREAK_AS_BLOCK}× HTTP 403 z rzędu`);
        throw error;
      }
      const code = error?.cause?.code ?? "";
      if (/ENOTFOUND|EAI_AGAIN|CERT|UNABLE_TO_VERIFY/.test(code)) throw new Permanent(`błąd sieci ${code}`);
      last = error.name === "TimeoutError" ? new Error("przekroczony czas 60 s") : error;
      if (attempt < IMG_RETRIES) await sleep(1500 * 3 ** attempt + Math.random() * 500);
    }
  }
  if (++imgFailStreak >= IMG_FAIL_STREAK_AS_BLOCK) imgFailStreak = 0, await onBlocked(`zdjęcia: ${IMG_FAIL_STREAK_AS_BLOCK} nieudanych pobrań z rzędu`);
  throw new Error(`${reasonOf(last)} – po ${IMG_RETRIES + 1} próbach`);
}

async function checkImage(buf) {
  const meta = await inspect(buf); // sharp z limitInputPixels; odrzuca HTML/SVG i nieznane formaty
  if (!FORMATS.has(meta.format)) throw new Permanent(`niedozwolony format ${meta.format}`);
  const [short, long] = [Math.min(meta.width, meta.height), Math.max(meta.width, meta.height)];
  if (short < MIN_SIDE) throw new Permanent(`za małe (${meta.width}×${meta.height})`);
  if (long / short > MAX_RATIO) throw new Permanent(`nietypowe proporcje (${meta.width}×${meta.height}) – grafika z opisu`);
  return meta;
}

const origIndex = new Map();
for (const f of readdirSync(origDir)) {
  const m = f.match(/^([a-f0-9]{24})\.(jpg|png|webp|gif|avif)$/);
  if (m) origIndex.set(m[1], path.join(origDir, f));
}

const stats = { photosNew: 0, dup: 0, failed: 0, mainFiles: 0, bytes: { i: 0, t: 0, q: 0, p: 0 }, files: { i: 0, t: 0, q: 0, p: 0 } };
const failures = new Map();
function put(folder, hash, buf) {
  writeAtomic(file(folder, hash), buf);
  stats.bytes[folder] += buf.length;
  stats.files[folder]++;
}

// Bajty obrazu: zapisany oryginał -> (opcjonalnie) gotowe q/ -> pobranie. Zwraca { buf, fromNet, format }.
async function sourceOf(hash, url, { allowQ = true, allowNet = true } = {}) {
  for (const f of [origIndex.get(hash), allowQ ? file("q", hash) : null]) {
    if (!f || !existsSync(f)) continue;
    try {
      const buf = readFileSync(f);
      return { buf, fromNet: false, format: (await checkImage(buf)).format };
    } catch {
      if (f === origIndex.get(hash)) rmSync(f, { force: true }), origIndex.delete(hash);
    }
  }
  if (!allowNet) return null;
  const buf = await downloadImage(url);
  return { buf, fromNet: true, format: (await checkImage(buf)).format };
}

async function processPhoto(itemId, urls, hashes, idx, needMain) {
  const [url, hash] = [urls[idx], hashes[idx]];
  const needI = needMain && !mainReady(hash);
  if (ready(hash) && !needI) return;
  // znany odcisk i żaden produkt nie potrzebuje tego zdjęcia (np. to samo co zdjęcie główne) – nic do zrobienia
  if (!needI && state.dhash[hash] && !(await wantedFor(itemId, hashes, idx, state.dhash[hash]))) return void stats.dup++;
  try {
    const { buf, fromNet, format } = await sourceOf(hash, url);
    if (fromNet) {
      const f = path.join(origDir, `${hash}.${EXT[format]}`);
      writeAtomic(f, buf);
      origIndex.set(hash, f);
    }
    const small = await toWebp(buf, PREVIEW);
    const d = (state.dhash[hash] = await dhashOf(small));
    if (needI) {
      if (!existsSync(file("t", hash))) put("t", hash, await toWebp(buf, THUMB));
      if (!existsSync(file("i", hash))) put("i", hash, await toWebp(buf, MAIN));
      stats.mainFiles++;
    }
    if (ready(hash)) return;
    if (!(await wantedFor(itemId, hashes, idx, d))) return void stats.dup++;
    if (!existsSync(file("p", hash))) put("p", hash, small);
    if (!existsSync(file("q", hash))) put("q", hash, await toWebp(buf, GALLERY));
    stats.photosNew++;
  } catch (error) {
    stats.failed++;
    const reason = reasonOf(error);
    bump(failures, reason.replace(/\d+×\d+/g, "W×H").slice(0, 80));
    console.log(`  Zdjęcie nieudane (${itemId}): ${url} – ${reason}`);
  }
}

// Zdjęcie główne (i/ + t/) z zapisanego oryginału albo z gotowego q/ – dla produktów bez zdjęcia, gdy pierwsze zdjęcie się nie udało.
async function ensureMain(hash) {
  if (mainReady(hash)) return true;
  try {
    const src = await sourceOf(hash, null, { allowNet: false });
    if (!src) return false;
    if (!existsSync(file("t", hash))) put("t", hash, await toWebp(src.buf, THUMB));
    if (!existsSync(file("i", hash))) put("i", hash, await toWebp(src.buf, MAIN));
    stats.mainFiles++;
    return true;
  } catch {
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
        .then(resolve, (error) => (console.error(`Błąd zadania: ${reasonOf(error)}`), resolve()))
        .finally(() => {
          active--;
          next();
        });
    }
  };
  return (fn) => new Promise((resolve) => queue.push({ fn, resolve }) && next());
}
const imgLimit = limiter(IMG_PARALLEL);
const photoJobs = new Map(); // hash -> Promise (kolejne zadania dla tego samego pliku idą po sobie)
let jobsQueued = 0;
let jobsDone = 0;
function schedule(itemId) {
  const urls = state.items[itemId]?.urls ?? [];
  const hashes = urls.map(photoHash);
  hashes.forEach((hash, idx) => {
    const needMain = idx === 0 && mainless.has(itemId);
    if (ready(hash) && (!needMain || mainReady(hash))) return;
    const prev = photoJobs.get(hash);
    const run = () => imgLimit(() => processPhoto(itemId, urls, hashes, idx, needMain)).finally(() => jobsDone++);
    jobsQueued++;
    photoJobs.set(hash, prev ? prev.then(run) : run());
  });
}
// Czeka na wszystkie zdjęcia; co minutę zapisuje stan i products.json, żeby gotowe zdjęcia były od razu na stronie.
async function drainPhotos() {
  while (jobsQueued > jobsDone) {
    await Promise.race([Promise.all(photoJobs.values()), sleep(60_000)]);
    if (jobsQueued > jobsDone) saveState(), await applyCatalog();
  }
}

// ---------- products.json: dopisanie gotowych zdjęć (z pełnego stanu, idempotentne) ----------
const applied = { products: new Set(), items: new Set(), refs: 0, mains: 0, writes: 0 };
async function applyCatalog() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const mtime = statSync(productsFile).mtimeMs;
    const products = readJson(productsFile);
    const changes = [];
    let refs = 0;
    let mains = 0;
    for (const p of products) {
      if (p.platform !== "weidian" || typeof p.itemId !== "string") continue;
      const hashes = [...new Set((state.items[p.itemId]?.urls ?? []).slice(0, MAX_PHOTOS).map(photoHash))];
      if (!hashes.length) continue;
      let mainHash = hashOfRel(p.image);
      let image = p.image;
      if (!mainHash) {
        for (const h of hashes)
          if (await ensureMain(h)) {
            mainHash = h;
            image = `i/${h}.webp`;
            break;
          }
      }
      const gallery = [...p.gallery];
      const have = new Set(gallery);
      let seen = null; // odciski: zdjęcie główne + galeria (liczone dopiero, gdy jest co dopisać)
      for (const h of hashes) {
        const rel = `q/${h}.webp`;
        if (h === mainHash || have.has(rel) || !ready(h)) continue;
        const d = state.dhash[h] ?? (await dhashCdn(h, "p"));
        seen ??= [mainHash ? await dhashCdn(mainHash, "t") : null, ...(await Promise.all(gallery.map((g) => dhashCdn(hashOfRel(g), "p"))))];
        if (seen.some((x) => similar(x, d))) continue;
        gallery.push(rel);
        have.add(rel);
        seen.push(d);
        refs++;
      }
      if (image !== p.image || gallery.length !== p.gallery.length) {
        if (image !== p.image) mains++;
        changes.push({ p, image, gallery });
      }
    }
    if (!changes.length) return;
    if (statSync(productsFile).mtimeMs !== mtime) continue; // ktoś zmienił plik w międzyczasie – od nowa
    for (const { p, image, gallery } of changes) {
      if (image !== p.image) Object.assign(p, { image, thumb: `t/${hashOfRel(image)}.webp` });
      p.gallery = gallery;
      applied.products.add(p.id);
      applied.items.add(p.itemId);
    }
    writeJsonLines(productsFile, products); // ten sam format co npm run katalog (jeden produkt na linię), zapis atomowy
    applied.refs += refs;
    applied.mains += mains;
    applied.writes++;
    return;
  }
  console.log("Uwaga: products.json zmieniał się w trakcie zapisu – pominięto, spróbuję przy następnym zapisie.");
}

// ---------- start ----------
const started = Date.now();
const fresh = catalogIds.filter(isFresh);
const toQuery = catalogIds.filter((id) => !isFresh(id)).slice(0, limit);
const queried = new Set(toQuery);
console.log(
  `Katalog: ${catalogIds.length} unikalnych itemId weidian, bez zdjęcia głównego: ${mainless.size}, znanych zdjęć ze starej strony: ${legacy.size}. ` +
    `Sprawdzone w ostatnich 7 dniach (pomijam): ${fresh.length}${fromScratch ? " (--od-nowa)" : ""}. Do sprawdzenia teraz: ${toQuery.length}` +
    (Number.isFinite(limit) ? ` (--limit ${limit})` : ""),
);

// brakujące zdjęcia przedmiotów sprawdzonych wcześniej (np. przerwane uruchomienie), poza tymi, które zaraz sprawdzimy od nowa
for (const id of catalogIds) if (state.items[id] && !queried.has(id)) schedule(id);
if (jobsQueued) console.log(`Do uzupełnienia z poprzednich uruchomień: ${jobsQueued} zdjęć (część zostanie pominięta jako powtórki).`);

const run = { checked: 0, hits: 0, photos: 0, gone: 0, off: 0, errors: new Map(), errorStreak: 0 };
const queue = [...toQuery];
let sinceSave = 0;
const summaryLine = () =>
  `zdjęcia ma ${run.hits}/${run.checked} (${pct(run.hits, run.checked)}), adresów ${run.photos} (śr. ${(run.photos / Math.max(1, run.hits)).toFixed(1)} na przedmiot ze zdjęciami), ` +
  `nie istnieje ${run.gone}, wycofane/usunięte ${run.off}`;
const photoLine = () => `zdjęcia: nowe ${stats.photosNew}, powtórki pominięte ${stats.dup}, nieudane ${stats.failed}, w kolejce ${jobsQueued - jobsDone}`;

process.on("SIGINT", () => {
  saveState();
  console.log(`\nPrzerwano – zapisano stan (${Object.keys(state.items).length} przedmiotów). products.json uzupełni się przy następnym uruchomieniu.`);
  process.exit(130);
});

while (queue.length && !gaveUp) {
  if (pause) {
    await pause;
    continue;
  }
  // pobieranie zdjęć jest wolniejsze niż zapytania – nie odjeżdżamy z zapytaniami za daleko do przodu
  if (jobsQueued - jobsDone > MAX_BACKLOG) {
    await sleep(1000);
    continue;
  }
  const itemId = queue.shift();
  const r = await callApi(itemId);
  if (r.kind === "stop") {
    queue.unshift(itemId);
    break;
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
  const entry = r.kind === "gone" ? { status: "nie-istnieje", urls: [], checkedAt: new Date().toISOString() } : normalize(r.item);
  state.items[itemId] = entry;
  run.checked++;
  if (entry.status === "nie-istnieje") run.gone++;
  else if (entry.status !== "ok") run.off++;
  if (entry.urls.length) run.hits++, (run.photos += entry.urls.length);
  schedule(itemId);
  if (run.checked === HIT_RATE_AT) console.log(`== Po pierwszych ${HIT_RATE_AT} sprawdzonych: ${summaryLine()}. Hosty zdjęć: ${listMap(imgHosts)}`);
  if (++sinceSave >= SAVE_EVERY) {
    sinceSave = 0;
    saveState();
    await applyCatalog();
    const done = run.checked + [...run.errors.values()].reduce((a, b) => a + b, 0);
    const perItem = (Date.now() - started - blockedMs) / Math.max(1, done);
    console.log(
      `API: ${done}/${toQuery.length} – ${summaryLine()}; ${photoLine()}; w products.json dopisano ${applied.refs} zdjęć do ${applied.products.size} produktów` +
        ` – zostało ok. ${Math.round((queue.length * perItem) / 60_000)} min`,
    );
  }
}

if (jobsQueued - jobsDone > 0) console.log(`Zapytania zakończone, czekam na zdjęcia (${jobsQueued - jobsDone} w kolejce)...`);
await drainPhotos();
saveState();
await applyCatalog();
saveState(); // odciski policzone przy zapisie katalogu

// ---------- podsumowanie ----------
const errorCount = [...run.errors.values()].reduce((a, b) => a + b, 0);
const known = Object.values(state.items);
console.log(`\nTo uruchomienie: sprawdzono ${run.checked}, ${summaryLine()}.`);
if (errorCount) console.log(`Nieudane zapytania (zostaną ponowione przy następnym uruchomieniu): ${errorCount} – ${listMap(run.errors)}`);
if (rejectedHosts.size) console.log(`Odrzucone adresy zdjęć (nie https / spoza *.geilicdn.com): ${listMap(rejectedHosts)}`);
console.log(
  `Zdjęcia: nowe ${stats.photosNew}, powtórki pominięte ${stats.dup}, nieudane ${stats.failed}${failures.size ? ` (${listMap(failures)})` : ""}; ` +
    `zdjęcia główne utworzone: ${stats.mainFiles}.`,
);
console.log(`Nowe pliki: ${["q", "p", "i", "t"].map((f) => `${f}/ ${stats.files[f]} (${mb(stats.bytes[f])})`).join(", ")} – razem ${mb(Object.values(stats.bytes).reduce((a, b) => a + b, 0))}`);
console.log(`Hosty zdjęć (adresy z Weidian): ${listMap(imgHosts)}${redirectHosts.size ? `; przekierowania na: ${listMap(redirectHosts)}` : ""}`);
console.log(
  `products.json: dopisano ${applied.refs} zdjęć do galerii ${applied.products.size} produktów (${applied.items.size} itemId), ` +
    `nowe zdjęcia główne: ${applied.mains}, zapisów pliku: ${applied.writes}.`,
);
console.log(`Stan: ${known.length} przedmiotów, ze zdjęciami ${known.filter((s) => s.urls.length).length}, adresów zdjęć ${known.reduce((a, s) => a + s.urls.length, 0)}.`);
if (blockLog.length) console.log(`Blokady: ${blockLog.length} (łączna przerwa ${Math.round(blockedMs / 60_000)} min): ${blockLog.join("; ")}`);
if (Object.values(stats.files).some(Boolean)) {
  const m = writeManifest(cdn);
  console.log(`manifest.json: ${m.count} plików, ${mb(m.bytes)}`);
}
const secs = Math.round((Date.now() - started) / 1000);
console.log(`Czas: ${Math.floor(secs / 60)} min ${secs % 60} s. Stan: ${stateFile}`);
if (gaveUp) {
  console.log(`Nie sprawdzono ${queue.length} przedmiotów z powodu blokady – uruchom ponownie później: npm run weidian`);
  process.exit(2);
}
