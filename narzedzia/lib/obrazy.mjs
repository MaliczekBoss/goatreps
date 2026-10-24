// Pobieranie (z limitami) i konwersja zdjęć do WebP. Pobrane pliki traktujemy jako niezaufane.
import { isIP } from "node:net";
import sharp from "sharp";
import { UA, hostOf, sleep } from "./wspolne.mjs";

sharp.cache(false);

export const MAX_BYTES = 25 * 1024 * 1024;
export const LIMIT_PIXELS = 64_000_000; // ok. 8000×8000 – większe obrazy odrzucamy (ochrona pamięci)
const TIMEOUT = 60_000;
const RETRIES = 3; // razem 4 próby
const ALLOWED = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);
export const EXT = { jpeg: "jpg", png: "png", webp: "webp", gif: "gif", avif: "avif", tiff: "tif" };

export class Permanent extends Error {}

// Klucz limitu równoległości: domena drugiego poziomu (cdn.dekriss.pl i photos.dekriss.pl liczą się razem).
export const siteKey = (url) => hostOf(url).split(".").slice(-2).join(".") || "lokalne";

function assertPublicHost(url) {
  const host = hostOf(url).replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Permanent(`niedozwolony host ${host}`);
  if (isIP(host)) {
    const priv = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd]|fe80:)/i;
    if (priv.test(host)) throw new Permanent(`niedozwolony adres ${host}`);
  }
}

async function readCapped(res) {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) {
    await res.body?.cancel().catch(() => {});
    throw new Permanent(`za duży plik (${(len / 1048576).toFixed(1)} MB)`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Permanent("za duży plik (> 25 MB)");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Pobiera plik; zwraca Buffer. Błędy trwałe (404, nie-obraz, za duży) bez ponawiania, przejściowe z wydłużającą się przerwą.
export async function download(url) {
  assertPublicHost(url);
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      if (res.redirected) assertPublicHost(res.url);
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        if ([400, 401, 403, 404, 405, 410, 451].includes(res.status)) throw new Permanent(`HTTP ${res.status}`);
        const retryAfter = Math.min(30, Number(res.headers.get("retry-after")) || 0);
        const err = new Error(`HTTP ${res.status}`);
        err.wait = retryAfter * 1000;
        throw err;
      }
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (/text\/html|svg|xml|json|javascript/.test(type)) {
        await res.body?.cancel().catch(() => {});
        throw new Permanent(`to nie jest obraz (${type.split(";")[0]})`);
      }
      return await readCapped(res);
    } catch (error) {
      if (error instanceof Permanent) throw error;
      const code = error?.cause?.code ?? "";
      if (/ENOTFOUND|EAI_AGAIN|ERR_INVALID_URL|CERT|UNABLE_TO_VERIFY/.test(code)) throw new Permanent(`błąd sieci ${code}`);
      lastError = error.name === "TimeoutError" ? new Error("przekroczony czas 60 s") : error;
      if (attempt < RETRIES) await sleep(Math.max(error.wait ?? 0, 1500 * 3 ** attempt) + Math.random() * 500);
    }
  }
  throw new Error(`${lastError?.message ?? "błąd pobierania"}${lastError?.cause?.code ? ` (${lastError.cause.code})` : ""} – po ${RETRIES + 1} próbach`);
}

// Sprawdza, czy bajty to obsługiwany obraz rastrowy. Zwraca { format, width, height }.
export async function inspect(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) throw new Permanent("pusty lub uszkodzony plik");
  if (buf.length > MAX_BYTES) throw new Permanent("za duży plik (> 25 MB)");
  const head = buf.subarray(0, 256).toString("latin1").trimStart().toLowerCase();
  if (head.startsWith("<")) throw new Permanent("to nie jest obraz (HTML/SVG/XML)");
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: LIMIT_PIXELS, failOn: "error" }).metadata();
  } catch (error) {
    throw new Permanent(`nieobsługiwany lub uszkodzony obraz (${String(error.message).slice(0, 80)})`);
  }
  const format = meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format;
  if (!ALLOWED.has(format)) throw new Permanent(`niedozwolony format ${meta.format}`);
  if (!meta.width || !meta.height) throw new Permanent("brak wymiarów obrazu");
  if (meta.width * meta.height > LIMIT_PIXELS) throw new Permanent(`za duży obraz ${meta.width}×${meta.height}`);
  return { format, width: meta.width, height: meta.height };
}

// Dopasowanie do max×max (bez powiększania), autoobrót wg EXIF, WebP. Metadane (EXIF/GPS) nie są kopiowane.
export async function toWebp(buf, { max, quality }) {
  try {
    return await sharp(buf, { animated: false, limitInputPixels: LIMIT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer();
  } catch (error) {
    throw new Permanent(`błąd konwersji (${String(error.message).slice(0, 80)})`);
  }
}

// Kolejka zadań: łącznie `total` naraz, najwyżej `perKey` na jedną domenę.
export function runPool(jobs, { keyOf, worker, total = 12, perKey = 6 }) {
  const queues = new Map();
  for (const job of jobs) {
    const key = keyOf(job);
    (queues.get(key) ?? queues.set(key, []).get(key)).push(job);
  }
  const active = new Map();
  let running = 0;
  let left = jobs.length;
  const limitOf = typeof perKey === "function" ? perKey : () => perKey;
  return new Promise((resolve) => {
    if (!left) return resolve();
    const pump = () => {
      for (const [key, queue] of queues) {
        while (queue.length && running < total && (active.get(key) ?? 0) < limitOf(key)) {
          const job = queue.shift();
          running++;
          active.set(key, (active.get(key) ?? 0) + 1);
          Promise.resolve()
            .then(() => worker(job))
            .catch((error) => console.error(`Błąd zadania: ${error?.message ?? error}`))
            .finally(() => {
              running--;
              active.set(key, active.get(key) - 1);
              if (--left === 0) resolve();
              else pump();
            });
        }
        if (running >= total) break;
      }
    };
    pump();
  });
}
