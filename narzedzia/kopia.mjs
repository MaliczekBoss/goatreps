// Wyciąga z kopii bazy MongoDB (JSON) tylko to, co potrzebne do katalogu.
// Pomija dane osobowe i sekrety: pageViews (IP, user agent), adminCredentials, adminSessions, tracking,
// a z produktów: vectors/imageVector (CLIP), flags, description, averageArrival, dimensions.
// Użycie: node kopia.mjs <backup.json> <folder-zrodla>
//   -> <folder-zrodla>/backup/products.json, <folder-zrodla>/backup/api-image/<_id>.bin
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { arg, ensureDir, writeAtomic, writeJson } from "./lib/wspolne.mjs";

const usage = "Użycie: node kopia.mjs <backup.json> <folder-zrodla>";
const backupFile = arg(0, undefined, usage);
const zrodla = arg(1, undefined, usage);
const outDir = ensureDir(path.join(zrodla, "backup"));
const imgDir = ensureDir(path.join(outDir, "api-image"));

console.log(`Wczytuję ${backupFile} …`);
const dump = JSON.parse(readFileSync(backupFile, "utf8"));
const collections = dump?.databases?.goatreps?.collections;
if (!collections) throw new Error("Brak databases.goatreps.collections w kopii");
const list = (name) => {
  const c = collections[name];
  return Array.isArray(c) ? c : Array.isArray(c?.documents) ? c.documents : [];
};

const KEEP = ["_id", "legacyId", "title", "price", "imageUrl", "images", "platform", "category", "tags", "links", "quality", "createdAt", "updatedAt"];
const oid = (v) => (typeof v === "string" ? v : (v?.$oid ?? null));
const products = list("products").map((doc) => {
  const p = {};
  for (const key of KEEP) if (doc[key] !== undefined) p[key] = key === "_id" ? oid(doc[key]) : doc[key];
  return p;
});

const MAGIC = { "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP", "image/png": (b) => b[0] === 0x89 && b.subarray(1, 4).toString() === "PNG", "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 };
let saved = 0;
let skipped = 0;
for (const img of list("images")) {
  const id = oid(img._id);
  if (!/^[a-f0-9]{24}$/i.test(id ?? "") || typeof img.data !== "string") continue;
  const bytes = Buffer.from(img.data, "base64");
  const check = MAGIC[img.mime];
  if (!check || !check(bytes) || bytes.length > 25 * 1024 * 1024) {
    console.log(`Pomijam obraz ${id}: nieobsługiwany typ ${img.mime} lub uszkodzone dane`);
    continue;
  }
  const file = path.join(imgDir, `${id}.bin`);
  if (existsSync(file)) skipped++;
  else (writeAtomic(file, bytes), saved++);
}

writeJson(path.join(outDir, "products.json"), { exportedAt: dump.timestamp ?? null, products });
console.log(`Produkty z kopii: ${products.length} -> ${path.join(outDir, "products.json")}`);
console.log(`Obrazy z kolekcji images: zapisane ${saved}, już były ${skipped} -> ${imgDir}`);
