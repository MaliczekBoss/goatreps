// Scala produkty z kopii bazy i ze strony na żywo w jedną listę (jeszcze z adresami źródłowymi zdjęć).
// Klucz: id (legacyId). Dane na żywo wygrywają dla: title, price, category, image, images, quality, tags, links, updatedAt.
// Użycie: node scal.mjs <folder-zrodla>
//   wejście:  <zrodla>/live/products.json (npm run snapshot), <zrodla>/backup/products.json (npm run kopia)
//   wyjście:  <zrodla>/scalone.json, <zrodla>/raporty/scalanie.json
// Produkty bez id dostają stałe nowe id (zapisane w przydzielone-id.json obok skryptu, żeby nie zmieniały się przy kolejnych uruchomieniach).
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENCI,
  KATEGORIE,
  TAGI,
  arg,
  cleanLinks,
  cleanTitle,
  isImageSource,
  marketplace,
  readJson,
  redact,
  toIso,
  toPrice,
  writeJson,
} from "./lib/wspolne.mjs";

const zrodla = arg(0, undefined, "Użycie: node scal.mjs <folder-zrodla>");
const here = path.dirname(fileURLToPath(import.meta.url));
const idsFile = path.join(here, "przydzielone-id.json");
const NEW_ID_BASE = 100000; // poza zakresem legacyId starej strony, żeby nie kolidować z jej przyszłymi produktami

const liveFile = path.join(zrodla, "live", "products.json");
const backupFile = path.join(zrodla, "backup", "products.json");
const live = existsSync(liveFile) ? readJson(liveFile).products : (console.log("Brak danych na żywo – uruchom npm run snapshot"), []);
const backup = existsSync(backupFile) ? readJson(backupFile).products : (console.log("Brak kopii – uruchom npm run kopia"), []);

const validId = (v) => Number.isInteger(v) && v > 0;
const oidTime = (oid) => (/^[a-f0-9]{24}$/i.test(oid ?? "") ? new Date(parseInt(oid.slice(0, 8), 16) * 1000).toISOString() : null);
const realDate = (iso) => (iso && iso >= "2000-01-01" ? iso : null); // 1970-01-01 = brak daty w starym API
const defaultKey = (link) => {
  const m = marketplace(link ?? "");
  return m.itemId ? `${m.platform}:${m.itemId}` : null;
};

function fromLive(p) {
  const links = {};
  for (const key of AGENCI) links[key] = p[`${key}_link`];
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
    quality: p.quality,
    tags: p.tags,
    imageSrc: p.image_url,
    gallerySrc: p.images,
    links,
    createdAt: realDate(toIso(p.created_at)),
    updatedAt: realDate(toIso(p.updated_at)),
  };
}

function fromBackup(p) {
  return {
    id: p.legacyId,
    _oid: p._id,
    title: p.title,
    price: p.price,
    category: p.category,
    quality: p.quality,
    tags: p.tags,
    imageSrc: p.imageUrl,
    gallerySrc: p.images,
    links: p.links ?? {},
    createdAt: realDate(toIso(p.createdAt)) ?? oidTime(p._id),
    updatedAt: realDate(toIso(p.updatedAt)),
  };
}

const LIVE_WINS = ["title", "price", "category", "imageSrc", "gallerySrc", "quality", "tags", "updatedAt"];
const has = (v) => v !== undefined && v !== null;
function merge(b, l) {
  if (!b) return { ...l, origin: "live" };
  if (!l) return { ...b, origin: "kopia" };
  const out = { ...b, origin: "oba" };
  for (const key of LIVE_WINS) if (has(l[key])) out[key] = l[key];
  out.links = { ...b.links };
  for (const key of AGENCI) if (has(l.links[key])) out.links[key] = l.links[key];
  out.createdAt = b.createdAt ?? l.createdAt;
  return out;
}

const report = { liveCount: live.length, backupCount: backup.length, onlyBackup: [], onlyLive: [], matchedByLink: [], assignedIds: [], warnings: [] };
const warn = (id, msg) => report.warnings.push(`#${id}: ${msg}`);

// 1. Indeksy po id.
const liveById = new Map();
const liveNoId = [];
for (const p of live.map(fromLive)) (validId(p.id) ? liveById.set(p.id, p) : liveNoId.push(p));
const backupById = new Map();
const backupNoId = [];
for (const p of backup.map(fromBackup)) (validId(p.id) ? backupById.set(p.id, p) : backupNoId.push(p));

// 2. Produkty bez id: dopasuj po linku do sklepu (kopia <-> live).
const liveByLink = new Map();
for (const p of [...liveById.values(), ...liveNoId]) {
  const k = defaultKey(p.links.default);
  if (k) (liveByLink.get(k) ?? liveByLink.set(k, []).get(k)).push(p);
}
const assigned = existsSync(idsFile) ? readJson(idsFile) : {};
const usedIds = new Set([...liveById.keys(), ...backupById.keys(), ...Object.values(assigned)]);
let nextId = Math.max(NEW_ID_BASE, ...usedIds) + 1;
const stableId = (link, title) => {
  const key = `${defaultKey(link) ?? link ?? "brak-linku"}|${cleanTitle(title).toLowerCase()}`;
  if (!assigned[key]) {
    assigned[key] = nextId++;
    report.assignedIds.push({ id: assigned[key], key, title: cleanTitle(title) });
  }
  return assigned[key];
};

const pairs = []; // [backup, live]
const liveTaken = new Set();
for (const b of backupNoId) {
  const k = defaultKey(b.links.default);
  const candidates = (liveByLink.get(k) ?? []).filter((l) => !liveTaken.has(l));
  const l = candidates.find((c) => !validId(c.id) && cleanTitle(c.title) === cleanTitle(b.title)) ?? candidates.find((c) => !validId(c.id)) ?? (candidates.length === 1 && !backupById.has(candidates[0].id) ? candidates[0] : null);
  if (l) {
    liveTaken.add(l);
    report.matchedByLink.push({ backupOid: b._oid, title: cleanTitle(b.title), liveId: l.id, link: b.links.default });
  }
  const id = l && validId(l.id) ? l.id : stableId(b.links.default, b.title);
  pairs.push([{ ...b, id }, l ? { ...l, id } : null]);
}
for (const l of liveNoId) {
  if (liveTaken.has(l)) continue;
  const id = stableId(l.links.default, l.title);
  pairs.push([null, { ...l, id }]);
}
for (const id of new Set([...backupById.keys(), ...liveById.keys()])) {
  const b = backupById.get(id) ?? null;
  const l = liveById.has(id) && !liveTaken.has(liveById.get(id)) ? liveById.get(id) : null;
  if (!b && !l) continue;
  if (!l) report.onlyBackup.push({ id, title: cleanTitle(b.title) });
  if (!b) report.onlyLive.push({ id, title: cleanTitle(l.title) });
  pairs.push([b, l]);
}

// 3. Normalizacja do formatu katalogu.
const knownCategories = new Set(Object.keys(KATEGORIE));
const products = pairs.map(([b, l]) => {
  const p = merge(b, l);
  const title = cleanTitle(p.title);
  if (!title) warn(p.id, "pusty tytuł");
  let price = toPrice(p.price);
  if (price === null) (warn(p.id, `nieprawidłowa cena ${JSON.stringify(p.price)} -> 0`), (price = 0));
  let category = String(p.category ?? "").trim().toLowerCase();
  if (!category) category = "inne";
  if (!/^[a-z0-9_]+$/.test(category)) {
    const slug = category.normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "inne";
    warn(p.id, `kategoria "${category}" -> "${slug}"`);
    category = slug;
  }
  if (!knownCategories.has(category)) warn(p.id, `nieznana kategoria "${category}"`);
  let quality = Math.round(Number(p.quality));
  if (!Number.isFinite(quality) || quality < 7 || quality > 10) {
    warn(p.id, `jakość ${JSON.stringify(p.quality)} poza 7–10`);
    quality = Number.isFinite(quality) ? Math.min(10, Math.max(7, quality)) : 7;
  }
  const rawTags = Array.isArray(p.tags) ? p.tags.map((t) => String(t).trim().toLowerCase()) : [];
  const tags = TAGI.filter((t) => rawTags.includes(t));
  const otherTags = rawTags.filter((t) => !TAGI.includes(t));
  if (otherTags.length) warn(p.id, `pominięte tagi: ${otherTags.join(", ")}`);
  const { links, bad } = cleanLinks(p.links);
  if (bad.length) warn(p.id, `pominięte nieprawidłowe linki: ${bad.join(", ")}`);
  const { platform, itemId } = marketplace(links.default ?? "");
  if (!links.default) warn(p.id, "brak linku default");
  else if (!itemId) warn(p.id, `nie rozpoznano id przedmiotu w linku ${redact(links.default)}`);
  const imageSrc = typeof p.imageSrc === "string" && p.imageSrc.trim() ? p.imageSrc.trim() : null;
  if (imageSrc && !isImageSource(imageSrc)) warn(p.id, `nieobsługiwane źródło zdjęcia ${redact(imageSrc.slice(0, 80))}`);
  const gallerySrc = [...new Set((Array.isArray(p.gallerySrc) ? p.gallerySrc : []).filter((u) => typeof u === "string").map((u) => u.trim()))];
  const createdAt = p.createdAt ?? p.updatedAt ?? "1970-01-01T00:00:00.000Z";
  if (!p.createdAt) warn(p.id, `brak createdAt -> ${createdAt}`);
  return {
    id: p.id,
    title,
    price,
    category,
    quality,
    tags,
    imageSrc: imageSrc && isImageSource(imageSrc) ? imageSrc : null,
    gallerySrc: gallerySrc.filter(isImageSource),
    platform,
    itemId,
    links,
    createdAt,
    updatedAt: p.updatedAt ?? createdAt,
    origin: p.origin,
  };
});
const seenIds = new Set();
for (const p of products) {
  if (seenIds.has(p.id)) throw new Error(`Zduplikowane id ${p.id} po scaleniu – sprawdź dane`);
  seenIds.add(p.id);
}
products.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id - a.id);

// 4. Ciekawostki do raportu.
const byItem = new Map();
for (const p of products) if (p.itemId) (byItem.get(`${p.platform}:${p.itemId}`) ?? byItem.set(`${p.platform}:${p.itemId}`, []).get(`${p.platform}:${p.itemId}`)).push(p);
const shared = [...byItem.values()].filter((g) => g.length > 1);
const exact = [];
for (const g of shared) {
  const seen = new Map();
  for (const p of g) {
    const k = [p.title.toLowerCase(), p.price, p.imageSrc].join("|");
    (seen.get(k) ?? seen.set(k, []).get(k)).push(p.id);
  }
  for (const ids of seen.values()) if (ids.length > 1) exact.push(ids);
}
report.total = products.length;
report.sharedItemLinks = { groups: shared.length, products: shared.reduce((a, g) => a + g.length, 0), biggest: shared.sort((a, b) => b.length - a.length).slice(0, 5).map((g) => ({ item: `${g[0].platform}:${g[0].itemId}`, count: g.length })) };
report.exactDuplicates = exact;
report.withoutImageSource = products.filter((p) => !p.imageSrc).map((p) => ({ id: p.id, title: p.title, gallery: p.gallerySrc.length }));
report.categories = Object.fromEntries([...products.reduce((m, p) => m.set(p.category, (m.get(p.category) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
report.platforms = Object.fromEntries([...products.reduce((m, p) => m.set(String(p.platform), (m.get(String(p.platform)) ?? 0) + 1), new Map())]);
report.priceOutliers = products.filter((p) => p.price > 5000 || p.price < 5).map((p) => ({ id: p.id, title: p.title, price: p.price }));

writeJson(path.join(zrodla, "scalone.json"), { mergedAt: new Date().toISOString(), products });
writeJson(path.join(zrodla, "raporty", "scalanie.json"), report, true);
writeJson(idsFile, assigned, true);

console.log(`Scalono: ${products.length} produktów (na żywo ${live.length}, w kopii ${backup.length})`);
console.log(`Tylko w kopii: ${report.onlyBackup.length}${report.onlyBackup.length ? ` (${report.onlyBackup.map((p) => p.id).join(", ")})` : ""}`);
console.log(`Tylko na żywo: ${report.onlyLive.length}${report.onlyLive.length ? ` (${report.onlyLive.map((p) => p.id).join(", ")})` : ""}`);
for (const m of report.matchedByLink) console.log(`Dopasowano po linku: "${m.title}" (kopia ${m.backupOid}) <-> na żywo id ${m.liveId}`);
for (const a of report.assignedIds) console.log(`Nowe id ${a.id}: "${a.title}" (${a.key})`);
for (const [key, id] of Object.entries(assigned)) if (!report.assignedIds.some((a) => a.key === key)) console.log(`Id ${id} przydzielone wcześniej (${key})`);
console.log(`Bez zdjęcia głównego w danych: ${report.withoutImageSource.length}; ten sam przedmiot w wielu produktach: ${shared.length} grup; dokładne duplikaty: ${exact.length}`);
if (report.warnings.length) console.log(`Ostrzeżeń: ${report.warnings.length} (szczegóły w raporty/scalanie.json)`);
