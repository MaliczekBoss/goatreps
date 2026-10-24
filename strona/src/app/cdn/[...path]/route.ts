import { readFile } from "node:fs/promises";
import path from "node:path";
import { CDN_PATH, CDN_URL } from "@/lib/images";

// Zapas na czas, gdy zdjęcia nie są jeszcze na S3/CDN: podaje pliki z lokalnego folderu cdn/.
// Gdy NEXT_PUBLIC_CDN_URL jest ustawione, ta ścieżka zawsze odpowiada 404.
const CDN_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.CDN_DIR || path.join(process.cwd(), "..", "cdn"));
const TYPES = { webp: "image/webp", png: "image/png" } as const;

export async function GET(_request: Request, ctx: RouteContext<"/cdn/[...path]">) {
  const { path: parts } = await ctx.params;
  const file = parts.join("/");
  if (CDN_URL || !CDN_PATH.test(file)) return new Response(null, { status: 404 });

  const full = path.join(/*turbopackIgnore: true*/ CDN_DIR, ...parts);
  if (!full.startsWith(CDN_DIR + path.sep)) return new Response(null, { status: 404 });

  try {
    const body = await readFile(full);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": TYPES[file.endsWith(".png") ? "png" : "webp"],
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  }
}
