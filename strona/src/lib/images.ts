const raw = (process.env.NEXT_PUBLIC_CDN_URL ?? "").trim().replace(/\/+$/, "");

/** Adres CDN (np. https://cdn.goatreps.com). Pusty = zdjęcia z lokalnego folderu przez /cdn/… */
export const CDN_URL = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(raw) ? raw : "";

export const CDN_PATH = /^(i|t|q|p|c|a|b)\/[a-z0-9_-]{1,64}\.(webp|png)$/;

export function cdn(file: string | null | undefined) {
  if (!file || !CDN_PATH.test(file)) return null;
  return CDN_URL ? `${CDN_URL}/${file}` : `/cdn/${file}`;
}

/** Miniatura zdjęcia QC: q/<hash>.webp → p/<hash>.webp (360 px). */
export const qcPreview = (file: string) => file.replace(/^q\//, "p/");
