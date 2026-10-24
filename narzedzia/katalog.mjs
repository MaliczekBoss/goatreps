// Buduje dane dla strony: products.json i categories.json (tylko ścieżki CDN, bez zewnętrznych adresów zdjęć).
// Użycie: node katalog.mjs <folder-zrodla> <folder-cdn> <folder-danych-strony>
//   wejście: <zrodla>/scalone.json (npm run scal) + pliki w <cdn>/ (npm run zdjecia)
//   wyjście: <dane>/products.json, <dane>/categories.json, <zrodla>/raporty/katalog.json
import { existsSync } from "node:fs";
import path from "node:path";
import { KATEGORIE, arg, cdnHash, readJson, writeJson, writeJsonLines } from "./lib/wspolne.mjs";

const usage = "Użycie: node katalog.mjs <folder-zrodla> <folder-cdn> <folder-danych-strony>";
const zrodla = arg(0, undefined, usage);
const cdn = arg(1, undefined, usage);
const dataDir = arg(2, undefined, usage);

const merged = readJson(path.join(zrodla, "scalone.json")).products;
const exists = (rel) => existsSync(path.join(cdn, ...rel.split("/")));

let galleryTotal = 0;
let galleryMissing = 0;
const noImage = [];
const products = merged.map((p) => {
  const hash = p.imageSrc ? cdnHash(p.imageSrc, zrodla) : null;
  const ok = hash && exists(`i/${hash}.webp`) && exists(`t/${hash}.webp`);
  if (!ok) noImage.push({ id: p.id, title: p.title, reason: p.imageSrc ? "zdjęcie nieudane / jeszcze niepobrane" : "brak zdjęcia w danych" });
  const gallery = [];
  for (const src of p.gallerySrc) {
    const h = cdnHash(src, zrodla);
    const rel = h ? `q/${h}.webp` : null;
    galleryTotal++;
    // strona wylicza podgląd p/<hash>.webp z wpisu q/<hash>.webp – wpisujemy tylko, gdy są oba pliki
    if (rel && exists(rel) && exists(`p/${h}.webp`)) {
      if (!gallery.includes(rel)) gallery.push(rel);
    } else galleryMissing++;
  }
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
    quality: p.quality,
    tags: p.tags,
    image: ok ? `i/${hash}.webp` : null,
    thumb: ok ? `t/${hash}.webp` : null,
    gallery,
    platform: p.platform,
    itemId: p.itemId,
    links: p.links,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
});
products.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

const counts = new Map();
for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
const unknown = [...counts.keys()].filter((slug) => !KATEGORIE[slug]);
const label = (slug) => KATEGORIE[slug] ?? slug.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const categories = [...counts]
  .filter(([, count]) => count > 0)
  .sort((a, b) => (a[0] === "inne") - (b[0] === "inne") || b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([slug, count]) => ({ slug, name: label(slug), count, image: exists(`c/${slug}.webp`) ? `c/${slug}.webp` : null }));

// Ostatnia kontrola przed zapisem: żadnych zewnętrznych adresów zdjęć ani kluczy.
const text = JSON.stringify(products);
const imageFields = products.flatMap((p) => [p.image, p.thumb, ...p.gallery]).filter(Boolean);
if (imageFields.some((v) => !/^[itq]\/[a-f0-9]{24}\.webp$/.test(v))) throw new Error("Nieprawidłowa ścieżka zdjęcia w katalogu – przerwano zapis");
if (/apiKey|api_key|data:image|\/api\/image\//i.test(text)) throw new Error("W katalogu został klucz API / zewnętrzne źródło zdjęcia – przerwano zapis");

writeJsonLines(path.join(dataDir, "products.json"), products);
writeJson(path.join(dataDir, "categories.json"), categories, true);
writeJson(path.join(zrodla, "raporty", "katalog.json"), { builtAt: new Date().toISOString(), products: products.length, withImage: products.length - noImage.length, noImage, galleryTotal, galleryMissing, unknownCategories: unknown }, true);

console.log(`Zapisano ${products.length} produktów -> ${path.join(dataDir, "products.json")}`);
console.log(`Ze zdjęciem: ${products.length - noImage.length}, bez zdjęcia: ${noImage.length}${noImage.length ? ` (id: ${noImage.map((p) => p.id).join(", ")})` : ""}`);
console.log(`Galeria: ${galleryTotal - galleryMissing}/${galleryTotal} odwołań gotowych`);
console.log(`Kategorie (${categories.length}) -> ${path.join(dataDir, "categories.json")}: ${categories.map((c) => `${c.slug} ${c.count}`).join(", ")}`);
if (unknown.length) console.log(`Uwaga: kategorie spoza listy nazw: ${unknown.join(", ")}`);
