import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// Zdjęcia QC z magazynu (zebrane skryptem narzedzia/qc.mjs z USFans i trzymane na naszym CDN: q/ i p/).
export type QcInfo = {
  photos: string[]; // hashe: q/<hash>.webp (pełne) i p/<hash>.webp (miniatury)
  weight: number | null; // gramy
  dims: { l: number; w: number; h: number } | null; // cm
  arrivalDays: string | null;
  checkedAt: string;
};

const FILE = path.join(process.cwd(), "data", "qc.json");
const CHECK_EVERY_MS = 60_000;
const HASH = /^[a-f0-9]{24}$/;

type Cache = { mtime: number; checkedAt: number; items: Record<string, QcInfo> };
const g = globalThis as typeof globalThis & { __grQc?: Cache };

function load(): Record<string, QcInfo> {
  const now = Date.now();
  const c = g.__grQc;
  if (c && now - c.checkedAt < CHECK_EVERY_MS) return c.items;
  let mtime = 0;
  try {
    mtime = statSync(FILE).mtimeMs;
  } catch {
    g.__grQc = { mtime: 0, checkedAt: now, items: {} };
    return {};
  }
  if (c && c.mtime === mtime) {
    c.checkedAt = now;
    return c.items;
  }
  let items: Record<string, QcInfo> = {};
  try {
    items = (JSON.parse(readFileSync(FILE, "utf8")) as { items?: Record<string, QcInfo> }).items ?? {};
  } catch (error) {
    console.error("[qc] nie można wczytać qc.json:", error instanceof Error ? error.message : error);
  }
  g.__grQc = { mtime, checkedAt: now, items };
  return items;
}

export function getQc(itemId: string | null): QcInfo | null {
  if (!itemId || !/^\d{5,20}$/.test(itemId)) return null;
  const info = load()[itemId];
  if (!info) return null;
  return { ...info, photos: Array.isArray(info.photos) ? info.photos.filter((h) => HASH.test(h)) : [] };
}

/** Podsumowanie do panelu admina: ile produktów sprawdzono w USFans i ile ma zdjęcia z magazynu. */
export function qcStats() {
  const items = Object.values(load());
  let withPhotos = 0;
  let photos = 0;
  let lastCheck = 0;
  for (const info of items) {
    const n = Array.isArray(info.photos) ? info.photos.filter((h) => HASH.test(h)).length : 0;
    if (n) withPhotos++;
    photos += n;
    const at = Date.parse(info.checkedAt);
    if (Number.isFinite(at) && at > lastCheck) lastCheck = at;
  }
  return { checked: items.length, withPhotos, photos, lastCheck: lastCheck || null };
}
