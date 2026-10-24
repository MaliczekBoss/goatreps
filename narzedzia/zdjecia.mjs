// Pobiera zdjęcia z katalogu, konwertuje do WebP i układa w folderze gotowym do wysłania na S3/CDN.
//   i/<hash>.webp  zdjęcie główne (max 1400×1400, q78)        t/<hash>.webp  miniatura do siatki (max 480×480, q72)
//   q/<hash>.webp  zdjęcia z galerii/QC (max 1400, q78)        p/<hash>.webp  podgląd galerii (max 360×360, q70, ten sam hash co q/)
//   c/<slug>.webp  grafiki kategorii                           a/<agent>.webp logotypy agentów
//   b/goat.webp, b/goat.png, b/banner.webp  grafiki marki
// hash = pierwsze 24 znaki sha1(adresu źródłowego); dla /api/image/<id> i data: – sha1 bajtów obrazu.
// Wznawialne: pomija pliki, które już są. Oryginały trzymane w <zrodla>/orig/ (żeby nie pobierać drugi raz).
// Użycie: node zdjecia.mjs <folder-zrodla> <folder-cdn> [--glowne] [--galeria] [--statyczne] [--bez-oryginalow]
//   bez flag = wszystkie etapy po kolei (najpierw główne, potem galeria, na końcu statyczne).
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { Permanent, EXT, download, inspect, runPool, siteKey, toWebp } from "./lib/obrazy.mjs";
import { mb, writeManifest } from "./lib/manifest.mjs";
import { progress } from "./lib/progress.mjs";
import {
  GRAFIKI_KATEGORII,
  LOGA_AGENTOW,
  STARA_STRONA,
  apiImageId,
  apiImagePaths,
  arg,
  decodeDataUri,
  ensureDir,
  flag,
  geiliOriginal,
  hashOf,
  isHttpsUrl,
  readJson,
  redact,
  writeAtomic,
  writeJson,
} from "./lib/wspolne.mjs";

const usage = "Użycie: node zdjecia.mjs <folder-zrodla> <folder-cdn> [--glowne] [--galeria] [--statyczne] [--bez-oryginalow]";
const zrodla = arg(0, undefined, usage);
const cdn = arg(1, undefined, usage);
const ALL = ["glowne", "galeria", "statyczne"];
const phases = ALL.filter((p) => flag(p));
if (!phases.length) phases.push(...ALL);
const keepOriginals = !flag("bez-oryginalow");

const MAIN = { max: 1400, quality: 78 };
const THUMB = { max: 480, quality: 72 };
const GALLERY = { max: 1400, quality: 78 };
const PREVIEW = { max: 360, quality: 70 };

const scaloneFile = path.join(zrodla, "scalone.json");
if (!existsSync(scaloneFile)) {
  console.error(`Brak ${scaloneFile} – najpierw uruchom npm run scal`);
  process.exit(1);
}
const products = readJson(scaloneFile).products;
for (const dir of ["i", "t", "q", "p", "c", "a", "b"]) ensureDir(path.join(cdn, dir));
const out = (rel) => path.join(cdn, ...rel.split("/"));

// --- nieudane: <zrodla>/raporty/failed.json (stan) i <zrodla>/failed.txt (do czytania) ---
const failedJson = path.join(zrodla, "raporty", "failed.json");
const failed = existsSync(failedJson) ? readJson(failedJson) : {};
function saveFailures() {
  writeJson(failedJson, failed, true);
  const rows = Object.values(failed).sort((a, b) => a.folder.localeCompare(b.folder) || a.source.localeCompare(b.source));
  const lines = [
    `# Nieudane / niedostępne zdjęcia – ${new Date().toISOString()} – razem ${rows.length}`,
    "# folder\tźródło\tpowód\tprodukty (id)",
    ...rows.map((r) => [r.folder, r.source, r.reason, r.products?.join(",") ?? ""].join("\t")),
  ];
  writeAtomic(path.join(zrodla, "failed.txt"), lines.join("\n") + "\n");
}
const describe = (src) => (src.startsWith("data:") ? `data:${src.slice(5, src.indexOf(";"))} (${src.length} znaków)` : redact(src));
const reasonOf = (error) => String(error?.message ?? error).slice(0, 200);

// --- oryginały ---
const origIndex = new Map();
function origFile(folder, hash) {
  if (!origIndex.has(folder)) {
    const dir = path.join(zrodla, "orig", folder);
    const map = new Map();
    if (existsSync(dir)) for (const f of readdirSync(dir)) if (!f.endsWith(".tmp")) map.set(f.split(".")[0], path.join(dir, f));
    origIndex.set(folder, map);
  }
  return origIndex.get(folder).get(hash) ?? null;
}
function saveOriginal(folder, hash, buf, format) {
  if (!keepOriginals) return;
  const file = path.join(zrodla, "orig", folder, `${hash}.${EXT[format]}`);
  writeAtomic(file, buf);
  origIndex.get(folder)?.set(hash, file);
}

// Bajty dla źródeł bez adresu https (/api/image/<id>, data:) – jeśli są dostępne lokalnie.
function localBytes(src) {
  const data = decodeDataUri(src);
  if (data) return data;
  const id = apiImageId(src);
  if (!id) return null;
  const file = apiImagePaths(zrodla, id).find((f) => existsSync(f));
  return file ? readFileSync(file) : null;
}

const usedBy = (pick) => {
  const map = new Map();
  for (const p of products) for (const src of pick(p)) (map.get(src) ?? map.set(src, []).get(src)).push(p.id);
  return map;
};

// ===================== 1. zdjęcia główne -> i/ + t/ =====================
async function mainPhase() {
  for (const k of Object.keys(failed)) if (failed[k].folder === "i") delete failed[k];
  const sources = usedBy((p) => (p.imageSrc ? [p.imageSrc] : []));
  const jobs = [];
  let have = 0;
  for (const src of sources.keys()) {
    const local = isHttpsUrl(src) ? null : localBytes(src);
    const hash = isHttpsUrl(src) ? hashOf(src) : local ? hashOf(local) : null;
    if (hash && existsSync(out(`i/${hash}.webp`)) && existsSync(out(`t/${hash}.webp`))) {
      have++;
      continue;
    }
    jobs.push({ src, hash, local, cached: hash && isHttpsUrl(src) ? origFile("i", hash) : null });
  }
  console.log(`Zdjęcia główne: ${sources.size} unikalnych źródeł, już gotowe: ${have}, do zrobienia: ${jobs.length}`);
  const bar = progress(jobs.length, "Zdjęcia główne");
  let bad = 0;
  await runPool(jobs, {
    keyOf: (j) => (j.local || j.cached ? "lokalne" : isHttpsUrl(j.src) ? siteKey(j.src) : siteKey(STARA_STRONA)),
    perKey: (k) => (k === "lokalne" ? 12 : 6),
    worker: async (job) => {
      try {
        let { hash } = job;
        let buf = job.local ?? (job.cached ? readFileSync(job.cached) : null);
        if (!buf) {
          const id = apiImageId(job.src);
          buf = await download(id ? `${STARA_STRONA}/api/image/${id}` : job.src);
          const { format } = await inspect(buf);
          if (id) writeAtomic(apiImagePaths(zrodla, id)[1], buf);
          else saveOriginal("i", hash, buf, format);
        }
        await inspect(buf);
        hash ??= hashOf(buf);
        const [big, small] = [await toWebp(buf, MAIN), await toWebp(buf, THUMB)];
        writeAtomic(out(`t/${hash}.webp`), small);
        writeAtomic(out(`i/${hash}.webp`), big);
      } catch (error) {
        bad++;
        failed[`i|${job.hash ?? hashOf(job.src)}`] = { folder: "i", source: describe(job.src), reason: reasonOf(error), products: sources.get(job.src) };
      }
      bar.tick(`nieudane: ${bad}`);
    },
  });
  saveFailures();
  console.log(`Zdjęcia główne gotowe: ${sources.size - bad}/${sources.size}, nieudane: ${bad}`);
}

// ===================== 2. galeria / QC -> q/ + p/ =====================
async function galleryPhase() {
  for (const k of Object.keys(failed)) if (failed[k].folder === "q") delete failed[k];
  const sources = usedBy((p) => p.gallerySrc.filter(isHttpsUrl));
  const jobs = [];
  for (const src of sources.keys()) {
    const hash = hashOf(src);
    const needQ = !existsSync(out(`q/${hash}.webp`));
    const needP = !existsSync(out(`p/${hash}.webp`));
    if (needQ || needP) jobs.push({ src, hash, needQ, needP, cached: origFile("q", hash) ?? (needQ ? null : out(`q/${hash}.webp`)) });
  }
  console.log(`Galeria: ${sources.size} unikalnych zdjęć, już gotowe: ${sources.size - jobs.length}, do zrobienia: ${jobs.length}`);
  const bar = progress(jobs.length, "Galeria");
  let bad = 0;
  let fallbacks = 0;
  await runPool(jobs, {
    keyOf: (j) => (j.cached ? "lokalne" : siteKey(j.src)),
    perKey: (k) => (k === "lokalne" ? 12 : 6),
    worker: async (job) => {
      try {
        // Kolejność prób: zapisany oryginał -> oryginał z si.geilicdn.com -> podany adres (700 px).
        // Każda próba musi przejść pełną konwersję (uszkodzony oryginał = przejście do następnej).
        const original = geiliOriginal(job.src);
        const attempts = [...(job.cached ? [{ file: job.cached }] : []), ...(original ? [{ url: original }] : []), { url: job.src }];
        const errors = [];
        for (const attempt of attempts) {
          try {
            const buf = attempt.file ? readFileSync(attempt.file) : await download(attempt.url);
            const { format } = await inspect(buf);
            const big = job.needQ ? await toWebp(buf, GALLERY) : null;
            const small = await toWebp(buf, PREVIEW);
            if (attempt.url) saveOriginal("q", job.hash, buf, format);
            writeAtomic(out(`p/${job.hash}.webp`), small);
            if (big) writeAtomic(out(`q/${job.hash}.webp`), big);
            if (original && attempt.url === job.src) fallbacks++;
            errors.length = 0;
            break;
          } catch (error) {
            errors.push(`${attempt.file ? "zapisany plik" : attempt.url === job.src ? "podany adres" : "oryginał"}: ${reasonOf(error)}`);
            if (attempt.file && attempt.file.startsWith(path.join(zrodla, "orig"))) rmSync(attempt.file, { force: true });
          }
        }
        if (errors.length) throw new Error(errors.join("; "));
      } catch (error) {
        bad++;
        failed[`q|${job.hash}`] = { folder: "q", source: describe(job.src), reason: reasonOf(error), products: sources.get(job.src) };
      }
      bar.tick(`nieudane: ${bad}, z adresu zastępczego: ${fallbacks}`);
    },
  });
  saveFailures();
  console.log(`Galeria gotowa: ${sources.size - bad}/${sources.size}, nieudane: ${bad}, oryginał niedostępny (użyto wersji 700 px): ${fallbacks}`);
}

// ===================== 3. grafiki ze starej strony -> c/, a/, b/ =====================
async function staticPhase() {
  for (const k of Object.keys(failed)) if (["c", "a", "b"].includes(failed[k].folder)) delete failed[k];
  const assets = [
    { src: "/goat.png", out: "b/goat.webp", raw: "b/goat.png", max: 1400, quality: 85 },
    { src: "/goatreps_banner.png", out: "b/banner.webp", max: 2400, quality: 80 },
    ...Object.entries(GRAFIKI_KATEGORII).map(([slug, file]) => ({ src: `/clothes/${file}.png`, out: `c/${slug}.webp`, max: 1400, quality: 80 })),
    ...LOGA_AGENTOW.map((agent) => ({ src: `/agents/${agent}.png`, out: `a/${agent}.webp`, max: 1400, quality: 90 })),
  ];
  const jobs = assets.filter((a) => !existsSync(out(a.out)) || (a.raw && !existsSync(out(a.raw))));
  console.log(`Grafiki statyczne: ${assets.length}, już gotowe: ${assets.length - jobs.length}, do zrobienia: ${jobs.length}`);
  let bad = 0;
  await runPool(jobs, {
    keyOf: () => siteKey(STARA_STRONA),
    total: 4,
    perKey: 4,
    worker: async (a) => {
      try {
        const name = a.src.replace(/^\//, "").replaceAll("/", "_");
        const cachedFile = path.join(zrodla, "orig", "static", name);
        const buf = existsSync(cachedFile) ? readFileSync(cachedFile) : await download(`${STARA_STRONA}${a.src}`);
        const meta = await inspect(buf);
        if (keepOriginals) writeAtomic(cachedFile, buf);
        if (a.raw) {
          if (meta.format !== "png") throw new Permanent(`oczekiwano PNG, jest ${meta.format}`);
          writeAtomic(out(a.raw), buf);
        }
        writeAtomic(out(a.out), await toWebp(buf, a));
        console.log(`  ${a.src} (${meta.width}×${meta.height} ${meta.format}) -> ${a.out}${a.raw ? ` + ${a.raw}` : ""}`);
      } catch (error) {
        bad++;
        failed[`static|${a.out}`] = { folder: a.out.split("/")[0], source: `${STARA_STRONA}${a.src}`, reason: reasonOf(error) };
      }
    },
  });
  saveFailures();
  console.log(`Grafiki statyczne gotowe: ${assets.length - bad}/${assets.length}, nieudane: ${bad}`);
}

const started = Date.now();
if (phases.includes("glowne")) await mainPhase();
if (phases.includes("galeria")) await galleryPhase();
if (phases.includes("statyczne")) await staticPhase();
const m = writeManifest(cdn);
console.log(`CDN: ${m.count} plików, ${mb(m.bytes)} – ${Object.entries(m.folders).map(([f, s]) => `${f}/ ${s.files} (${mb(s.bytes)})`).join(", ")}`);
console.log(`Nieudane razem: ${Object.keys(failed).length} (lista: ${path.join(zrodla, "failed.txt")}). Czas: ${Math.round((Date.now() - started) / 1000)} s`);
