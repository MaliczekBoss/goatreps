// Kontrola wyników: zgodność products.json/categories.json z kontraktem, istnienie plików na CDN,
// zgodność manifest.json oraz brak wycieków (klucze API, adresy IP, user agenty, hasła, wektory, zewnętrzne adresy zdjęć).
// Użycie: node sprawdz.mjs <folder-zrodla> <folder-cdn> <folder-danych-strony>
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { AGENCI, TAGI, arg, isHttpsUrl, readJson } from "./lib/wspolne.mjs";

const usage = "Użycie: node sprawdz.mjs <folder-zrodla> <folder-cdn> <folder-danych-strony>";
const zrodla = arg(0, undefined, usage);
const cdn = arg(1, undefined, usage);
const dataDir = arg(2, undefined, usage);

const errors = [];
const notes = [];
const err = (m) => errors.length < 200 && errors.push(m);
const cdnFile = (rel) => path.join(cdn, ...rel.split("/"));

// ---------- products.json ----------
const products = readJson(path.join(dataDir, "products.json"));
const KEYS = ["id", "title", "price", "category", "quality", "tags", "image", "thumb", "gallery", "platform", "itemId", "links", "createdAt", "updatedAt"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ids = new Set();
let prev = null;
let galleryRefs = 0;
for (const p of products) {
  const at = `#${p.id}`;
  if (JSON.stringify(Object.keys(p)) !== JSON.stringify(KEYS)) err(`${at}: pola ${Object.keys(p).join(",")}`);
  if (!Number.isInteger(p.id) || p.id <= 0 || ids.has(p.id)) err(`${at}: złe lub powtórzone id`);
  ids.add(p.id);
  if (typeof p.title !== "string" || !p.title || p.title !== p.title.trim().replace(/\s+/g, " ")) err(`${at}: tytuł`);
  if (typeof p.price !== "number" || !Number.isFinite(p.price) || p.price < 0 || Math.round(p.price * 100) / 100 !== p.price) err(`${at}: cena ${p.price}`);
  if (typeof p.category !== "string" || !/^[a-z0-9_]+$/.test(p.category)) err(`${at}: kategoria ${p.category}`);
  if (!Number.isInteger(p.quality) || p.quality < 7 || p.quality > 10) err(`${at}: jakość ${p.quality}`);
  if (!Array.isArray(p.tags) || p.tags.some((t) => !TAGI.includes(t)) || new Set(p.tags).size !== p.tags.length) err(`${at}: tagi`);
  if ((p.image === null) !== (p.thumb === null)) err(`${at}: image/thumb niespójne`);
  if (p.image !== null) {
    const h = p.image.match(/^i\/([a-f0-9]{24})\.webp$/)?.[1];
    if (!h || p.thumb !== `t/${h}.webp`) err(`${at}: ścieżka image/thumb ${p.image} ${p.thumb}`);
    else if (!existsSync(cdnFile(p.image)) || !existsSync(cdnFile(p.thumb))) err(`${at}: brak pliku ${p.image} / ${p.thumb} na CDN`);
  }
  if (!Array.isArray(p.gallery) || new Set(p.gallery).size !== p.gallery.length) err(`${at}: galeria`);
  for (const g of p.gallery ?? []) {
    galleryRefs++;
    const h = g.match(/^q\/([a-f0-9]{24})\.webp$/)?.[1];
    if (!h) err(`${at}: ścieżka galerii ${g}`);
    else if (!existsSync(cdnFile(g)) || !existsSync(cdnFile(`p/${h}.webp`))) err(`${at}: brak ${g} lub p/${h}.webp na CDN`);
  }
  if (![null, "weidian", "taobao", "1688"].includes(p.platform)) err(`${at}: platforma ${p.platform}`);
  if (p.itemId !== null && !(typeof p.itemId === "string" && /^\d+$/.test(p.itemId))) err(`${at}: itemId ${p.itemId}`);
  if (!p.links || typeof p.links !== "object" || Object.entries(p.links).some(([k, v]) => !AGENCI.includes(k) || !isHttpsUrl(v))) err(`${at}: linki`);
  if (!ISO.test(p.createdAt ?? "") || !ISO.test(p.updatedAt ?? "")) err(`${at}: daty`);
  if (prev && prev.createdAt < p.createdAt) err(`${at}: zła kolejność (createdAt malejąco)`);
  prev = p;
}

// ---------- categories.json ----------
const categories = readJson(path.join(dataDir, "categories.json"));
const counts = products.reduce((m, p) => m.set(p.category, (m.get(p.category) ?? 0) + 1), new Map());
if (categories.length !== counts.size) err(`categories.json: ${categories.length} kategorii, w produktach ${counts.size}`);
categories.forEach((c, i) => {
  if (JSON.stringify(Object.keys(c)) !== JSON.stringify(["slug", "name", "count", "image"])) err(`kategoria ${c.slug}: pola`);
  if (counts.get(c.slug) !== c.count || c.count <= 0) err(`kategoria ${c.slug}: liczba ${c.count} != ${counts.get(c.slug)}`);
  if (c.image !== null && (c.image !== `c/${c.slug}.webp` || !existsSync(cdnFile(c.image)))) err(`kategoria ${c.slug}: grafika ${c.image}`);
  const next = categories[i + 1];
  if (next && c.slug !== "inne" && next.slug !== "inne" && next.count > c.count) err(`kategoria ${c.slug}: kolejność`);
  if (c.slug === "inne" && i !== categories.length - 1) err("kategoria inne nie jest ostatnia");
});

// ---------- manifest.json ----------
const listCdn = (dir, rel = "") =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listCdn(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
const cdnFiles = listCdn(cdn);
const manifest = readJson(path.join(cdn, "manifest.json"));
const listed = new Set(Object.keys(manifest.files));
for (const f of cdnFiles) {
  if (f.endsWith(".tmp")) err(`CDN: niedokończony plik ${f}`);
  else if (f !== "manifest.json" && f !== "README-S3.md" && (!listed.has(f) || manifest.files[f] !== statSync(cdnFile(f)).size)) err(`manifest: brak lub zły rozmiar ${f}`);
}
for (const f of listed) if (!existsSync(cdnFile(f))) err(`manifest: plik nie istnieje ${f}`);
const allowedTop = /^(?:[itqp]\/[a-f0-9]{24}\.webp|c\/[a-z0-9_]+\.webp|a\/[a-z0-9_]+(?:-(?:mark|logo|napis))?\.webp|b\/(?:goat|banner)\.webp|b\/goat\.png|manifest\.json|README-S3\.md)$/;
for (const f of cdnFiles) if (!allowedTop.test(f)) err(`CDN: nieoczekiwany plik ${f}`);

// ---------- wycieki ----------
// Faktyczne wartości kluczy z surowych danych (tylko w pamięci, do porównania).
const secrets = new Set();
for (const file of [path.join(zrodla, "live", "products.json"), path.join(zrodla, "backup", "products.json")]) {
  if (!existsSync(file)) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/apiKey=([A-Za-z0-9_-]{8,})/g)) secrets.add(m[1]);
}
const PATTERNS = [
  ["apiKey", /api[_-]?key/i],
  ["hash hasła bcrypt", /\$2[aby]\$\d{2}\$/],
  ["pola prywatne", /passwordHash|ipAddress|userAgent|pageViews|adminCredentials|imageVector|"vectors"|"flags"/],
  ["user agent", /Mozilla\/5\.0|AppleWebKit|Windows NT/],
  ["IPv4", /(?<![\d.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\d.])/],
  ["IPv6", /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}(?![0-9a-f:])|::ffff:/i],
  ["zewnętrzny host zdjęć", /dekriss|postimg|catbox|geilicdn|\/api\/image\/|data:image/i],
];
const textFiles = [
  ...readdirSync(dataDir).filter((f) => /\.(json|md|txt)$/.test(f)).map((f) => path.join(dataDir, f)),
  path.join(cdn, "manifest.json"),
  path.join(cdn, "README-S3.md"),
];
for (const file of textFiles) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const [name, re] of PATTERNS) {
    const m = text.match(re);
    if (m) err(`${path.relative(path.dirname(dataDir), file)}: ${name} – „${m[0]}” (…${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…)`);
  }
  for (const s of secrets) if (text.includes(s)) err(`${file}: zawiera wartość klucza API`);
}
let binaries = 0;
for (const f of cdnFiles) {
  if (!/\.(webp|png)$/.test(f)) continue;
  const buf = readFileSync(cdnFile(f));
  binaries++;
  if (f.endsWith(".webp")) {
    if (buf.subarray(0, 4).toString() !== "RIFF" || buf.subarray(8, 12).toString() !== "WEBP") err(`${f}: to nie jest WebP`);
    // przejdź po kawałkach RIFF – nie chcemy EXIF/XMP (np. GPS) w plikach
    for (let o = 12; o + 8 <= buf.length; ) {
      const id = buf.subarray(o, o + 4).toString("latin1");
      if (id === "EXIF" || id === "XMP ") err(`${f}: zawiera metadane ${id.trim()}`);
      o += 8 + buf.readUInt32LE(o + 4) + (buf.readUInt32LE(o + 4) & 1);
    }
  }
  if (buf.includes("apiKey") || [...secrets].some((s) => buf.includes(s))) err(`${f}: zawiera klucz API`);
}

notes.push(`produktów ${products.length}, ze zdjęciem ${products.filter((p) => p.image).length}, odwołań do galerii ${galleryRefs}`);
notes.push(`kategorii ${categories.length}, plików na CDN ${cdnFiles.length} (sprawdzonych binarnie ${binaries}), znanych kluczy API do wyszukania ${secrets.size}`);
for (const n of notes) console.log(n);
if (errors.length) {
  console.log(`BŁĘDY (${errors.length}${errors.length >= 200 ? "+" : ""}):`);
  for (const e of errors) console.log(`  - ${e}`);
  process.exit(1);
}
console.log("OK – kontrakt zgodny, pliki na miejscu, brak kluczy API / adresów IP / danych prywatnych / zewnętrznych adresów zdjęć.");
