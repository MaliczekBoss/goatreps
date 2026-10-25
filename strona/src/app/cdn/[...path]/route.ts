import { readFile } from "node:fs/promises";
import path from "node:path";
import { CDN_DIR } from "@/lib/cdn-dir";
import { CDN_PATH, CDN_URL } from "@/lib/images";
import { getObject, s3Config } from "@/lib/s3.mjs";

// Zdjęcia, gdy nie ma osobnego CDN: najpierw z lokalnego folderu cdn/, a gdy pliku tam nie ma – z bucketu S3
// (Garage na serwerze, S3_* w .env; wgrywa je server/cdn-sync.mjs). Cloudflare trzyma je potem u siebie (cache na rok).
// Gdy NEXT_PUBLIC_CDN_URL jest ustawione, ta ścieżka zawsze odpowiada 404.
const TYPES = { webp: "image/webp", png: "image/png" } as const;
const S3 = s3Config();
const MAX_BYTES = 8 * 1024 * 1024;

function image(body: BodyInit, file: string, length: string | number | null) {
  const headers: Record<string, string> = {
    "Content-Type": TYPES[file.endsWith(".png") ? "png" : "webp"],
    "Cache-Control": "public, max-age=31536000, immutable",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
  if (length != null) headers["Content-Length"] = String(length);
  return new Response(body, { headers });
}

const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

export async function GET(_request: Request, ctx: RouteContext<"/cdn/[...path]">) {
  const { path: parts } = await ctx.params;
  const file = parts.join("/");
  if (CDN_URL || !CDN_PATH.test(file)) return new Response(null, { status: 404 });

  const full = path.join(/*turbopackIgnore: true*/ CDN_DIR, ...parts);
  if (!full.startsWith(CDN_DIR + path.sep)) return new Response(null, { status: 404 });

  try {
    const body = await readFile(full);
    return image(new Uint8Array(body), file, body.byteLength);
  } catch {
    if (!S3) return missing();
  }

  try {
    const res = await getObject(S3, file, 10_000);
    if (res.status === 404) return missing();
    const length = Number(res.headers.get("content-length"));
    if (!res.ok || !res.body || (Number.isFinite(length) && length > MAX_BYTES)) {
      await res.body?.cancel().catch(() => {});
      if (!res.ok) console.error(`[zdjęcia] S3 ${file}: HTTP ${res.status}`);
      return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return image(res.body, file, res.headers.get("content-length"));
  } catch (error) {
    console.error(`[zdjęcia] S3 ${file}: ${error instanceof Error ? error.message : error}`);
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
