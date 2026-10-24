import { ImageSearchError, searchByImage, type ImageSearchCode } from "@/lib/image-search";
import { clientIp } from "@/lib/rate-limit";

export const maxDuration = 60;

const MAX_BODY = 4_000_000;
const STATUS: Record<ImageSearchCode, number> = {
  "not-configured": 503,
  "rate-limited": 429,
  busy: 429,
  "bad-image": 400,
  upstream: 502,
};
const NO_STORE = { "Cache-Control": "no-store" };

/** Czyta ciało do limitu – Content-Length może kłamać albo go nie być. */
async function readCapped(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  // tylko z naszej strony (przeglądarki wysyłają Sec-Fetch-Site)
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return Response.json({ error: "bad-image" }, { status: 403, headers: NO_STORE });
  if (!/^application\/json(;|$)/i.test(request.headers.get("content-type") ?? ""))
    return Response.json({ error: "bad-image" }, { status: 415, headers: NO_STORE });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return Response.json({ error: "bad-image" }, { status: 413, headers: NO_STORE });

  const raw = await readCapped(request, MAX_BODY).catch(() => null);
  if (raw === null) return Response.json({ error: "bad-image" }, { status: 413, headers: NO_STORE });
  let image = "";
  try {
    const body: unknown = JSON.parse(raw);
    image = body && typeof body === "object" && typeof (body as { image?: unknown }).image === "string" ? (body as { image: string }).image : "";
  } catch {
    return Response.json({ error: "bad-image" }, { status: 400, headers: NO_STORE });
  }

  try {
    return Response.json(await searchByImage(image, clientIp(request)), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ImageSearchError) return Response.json({ error: e.code }, { status: STATUS[e.code], headers: NO_STORE });
    console.error("[zdjęcie]", e instanceof Error ? e.message : e);
    return Response.json({ error: "upstream" }, { status: 502, headers: NO_STORE });
  }
}
