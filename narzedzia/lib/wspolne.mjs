// Wspólne stałe i pomocnicze funkcje dla skryptów goatreps.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export const STARA_STRONA = "https://goatreps.com";

export const AGENCI = ["default", "kakobuy", "cnfans", "allchinabuy", "litbuy", "usfans", "acbuy", "oopbuy", "mulebuy"];
export const TAGI = ["bestbatch", "budgetbatch", "random"];

// Polskie nazwy kategorii – zgodne z i18n starej strony (_app-*.js), "nakrycie_glowy" = "Nakrycie głowy".
export const KATEGORIE = {
  buty: "Buty",
  koszulki: "Koszulki",
  bluzy: "Bluzy",
  akcesoria: "Akcesoria",
  spodnie: "Spodnie",
  spodenki: "Spodenki",
  kurtki: "Kurtki",
  nakrycie_glowy: "Nakrycie głowy",
  torby_i_plecaki: "Torby i plecaki",
  elektronika: "Elektronika",
  longsleeve: "Longsleeve",
  paski: "Paski",
  sety: "Sety",
  okulary: "Okulary",
  swetry: "Swetry",
  inne: "Inne",
};

// Grafiki kategorii ze starej strony: slug kategorii -> plik /clothes/<plik>.png (index-*.js).
export const GRAFIKI_KATEGORII = {
  akcesoria: "akcesoria",
  bluzy: "bluzy",
  buty: "buty",
  elektronika: "elektronika",
  koszulki: "koszulki",
  kurtki: "kurtki",
  longsleeve: "longsleeve",
  nakrycie_glowy: "nakrycie_glowy",
  okulary: "okulary",
  paski: "paski",
  torby_i_plecaki: "plecaki",
  sety: "sety",
  spodenki: "spodenki",
  spodnie: "spodnie",
  swetry: "swetry",
};

// Logotypy agentów, które istnieją na starej stronie (320-*.js). cnfans/oopbuy/mulebuy nie mają logo (404).
export const LOGA_AGENTOW = ["kakobuy", "usfans", "allchinabuy", "acbuy", "litbuy"];

export const hashOf = (data) => createHash("sha1").update(data).digest("hex").slice(0, 24);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ukrywa klucze API w adresach (np. photos.dekriss.pl ...?apiKey=...).
export const redact = (s) => String(s).replace(/(api[_-]?key|token|key|sig|signature)=[^&\s"']+/gi, "$1=***");

export function arg(i, fallback, usage) {
  const v = process.argv[2 + i];
  if (v && !v.startsWith("--")) return path.resolve(v);
  if (fallback !== undefined) return path.resolve(fallback);
  console.error(usage);
  process.exit(1);
}

export const flag = (name) => process.argv.includes(`--${name}`);

export const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function writeAtomic(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

export const writeJson = (file, value, pretty = false) => writeAtomic(file, JSON.stringify(value, null, pretty ? 2 : 0) + "\n");

// Tablica obiektów – jeden element na linię (czytelne diffy w gicie).
export const writeJsonLines = (file, list) => writeAtomic(file, list.length ? `[\n${list.map((x) => JSON.stringify(x)).join(",\n")}\n]\n` : "[]\n");

export const ensureDir = (dir) => (existsSync(dir) || mkdirSync(dir, { recursive: true }), dir);

export function isHttpsUrl(u) {
  if (typeof u !== "string" || u.length > 2000 || /[\s"'<>\\]/.test(u)) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Platforma i id przedmiotu z linku do sklepu (te same reguły co konwerter linków starej strony).
export function marketplace(link) {
  const host = hostOf(link);
  if (!host) return { platform: null, itemId: null };
  const pick = (re) => link.match(re)?.[1] ?? null;
  if (host === "weidian.com" || host.endsWith(".weidian.com"))
    return { platform: "weidian", itemId: pick(/[?&](?:itemID|itemId|itemid)=(\d+)/) ?? pick(/itemID(?:=|%3D)(\d+)/i) };
  if (/(^|\.)(taobao|tmall)\.com$/.test(host)) return { platform: "taobao", itemId: pick(/[?&]id=(\d+)/) };
  if (/(^|\.)1688\.com$/.test(host)) return { platform: "1688", itemId: pick(/offer\/(\d+)/) };
  return { platform: null, itemId: null };
}

export function cleanLinks(raw) {
  const out = {};
  const bad = [];
  for (const key of AGENCI) {
    const v = typeof raw?.[key] === "string" ? raw[key].trim() : raw?.[key];
    if (v === undefined || v === null || v === "") continue;
    if (isHttpsUrl(v)) out[key] = v;
    else bad.push(key);
  }
  return { links: out, bad };
}

export const cleanTitle = (t) =>
  String(t ?? "")
    .replace(/[\u0000-\u001f\u007f​-‍﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function toPrice(p) {
  const raw = p && typeof p === "object" ? (p.$numberDecimal ?? p.$numberDouble ?? p.$numberInt) : p;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function toIso(v) {
  const raw = v && typeof v === "object" ? (v.$date?.$numberLong ? Number(v.$date.$numberLong) : v.$date) : v;
  if (raw === undefined || raw === null || raw === "") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Zdjęcia QC z si.geilicdn.com: "..._1122_1122.jpg.webp?w=700&cp=1" -> oryginał "..._1122_1122.jpg" (też .jpeg/.png/.gif).
export function geiliOriginal(url) {
  if (hostOf(url) !== "si.geilicdn.com") return null;
  const m = url.match(/^(https:\/\/si\.geilicdn\.com\/[^?#]+?\.(?:jpe?g|png|gif))\.webp(?:[?#].*)?$/i);
  return m && m[1] !== url ? m[1] : null;
}

// Źródła zdjęć, które nie są zwykłym adresem https: "/api/image/<id>" (kolekcja images w bazie) i "data:image/...".
export const apiImageId = (src) => (typeof src === "string" ? src.match(/^\/api\/image\/([a-f0-9]{24})$/i)?.[1] ?? null : null);
export function decodeDataUri(src) {
  const m = typeof src === "string" ? src.match(/^data:image\/(jpeg|jpg|png|webp|gif|avif);base64,([A-Za-z0-9+/=\s]+)$/i) : null;
  return m ? Buffer.from(m[2], "base64") : null;
}

export const isImageSource = (src) => isHttpsUrl(src) || !!apiImageId(src) || !!decodeDataUri(src);

// Pliki /api/image/<id>: najpierw wyciągnięte z kopii bazy, potem pobrane ze starej strony.
export function apiImagePaths(zrodla, id) {
  return [path.join(zrodla, "backup", "api-image", `${id}.bin`), path.join(zrodla, "orig", "api-image", `${id}.bin`)];
}

// Hash pliku na CDN dla danego źródła: sha1(adres) albo sha1(bajtów) dla /api/image i data:. null = jeszcze nieznany.
export function cdnHash(src, zrodla) {
  if (isHttpsUrl(src)) return hashOf(src);
  const bytes = decodeDataUri(src);
  if (bytes) return hashOf(bytes);
  const id = apiImageId(src);
  if (id) {
    const file = apiImagePaths(zrodla, id).find((f) => existsSync(f));
    return file ? hashOf(readFileSync(file)) : null;
  }
  return null;
}
