import { after } from "next/server";
import { getProduct } from "@/lib/catalog";
import { AGENT_HOSTS, isSource, normalizePath, normalizeSearch, SESSION_ID } from "@/lib/analytics/shared";
import { record, stamp, visitorId, type TrackEvent, type Visitor } from "@/lib/analytics/stats";
import { clientIp, hit, rateLimit } from "@/lib/rate-limit";

// Zdarzenia z przeglądarki (sendBeacon, text/plain). Zawsze 204 – nawet przy błędzie, limicie albo bocie,
// żeby nie zdradzać, co zostało policzone.

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|curl|wget|python|axios|httpclient|go-http|okhttp|java\/|node-fetch|undici|phantom|selenium|puppeteer|playwright/i;
const MAX_BODY = 2048;
const MAX_DUR_S = 30 * 60;
const PRODUCT_PAGE = /^\/item\/details\/(\d{1,7})$/;
const AGENTS = new Set(AGENT_HOSTS.map(([id]) => id));

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

export async function POST(request: Request) {
  // tylko z naszej strony (przeglądarki wysyłają Sec-Fetch-Site) – obca strona nie nabije statystyk
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done();
  if (!/^text\/plain(;|$)/i.test(request.headers.get("content-type") ?? "")) return done();

  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || ua.length > 1000 || BOT.test(ua)) return done();

  if (!rateLimit(request, "track", 120, 60_000).ok) return done();
  // limit całej strony obowiązuje zawsze, także bez znanego IP
  if (!hit("track", "*", 3000, 60_000).ok) return done();

  const text = await readCapped(request, MAX_BODY).catch(() => null);
  if (!text) return done();
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return done();
    body = parsed as Record<string, unknown>;
  } catch {
    return done();
  }

  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!SESSION_ID.test(sid)) return done();
  const inApp = /musical_ly|BytedanceWebview|TikTok/i.test(ua)
    ? "tiktok"
    : /Instagram/i.test(ua)
      ? "instagram"
      : /FBAN|FBAV|FB_IAB/i.test(ua)
        ? "facebook"
        : null;
  const claimed = isSource(body.src) ? body.src : "other";
  const src = claimed === "direct" && inApp ? inApp : claimed;
  const dur = int(body.dur, 0, MAX_DUR_S);

  let event: TrackEvent | null = null;
  if (body.t === "pv") {
    let path = normalizePath(typeof body.p === "string" ? body.p : "/");
    let product: number | undefined;
    const id = PRODUCT_PAGE.exec(path)?.[1];
    if (id) {
      // tylko produkty z katalogu – zmyślone numery nie zapchają statystyk
      const found = getProduct(Number(id));
      product = found ? found.id : undefined;
      path = found ? `/item/details/${found.id}` : "/inne";
    }
    const q = path === "/products" ? (normalizeSearch(body.q) ?? undefined) : undefined;
    event = { t: "pv", sid, src, dur, path, isNew: body.new === true, n: int(body.n, 1, 100_000), product, q };
  } else if (body.t === "ping") {
    if (dur > 0) event = { t: "ping", sid, src, dur };
  } else if (body.t === "out") {
    if (typeof body.a === "string" && AGENTS.has(body.a)) event = { t: "out", sid, src, agent: body.a };
  } else if (body.t === "promo") {
    event = { t: "promo", sid, src };
  } else if (body.t === "search") {
    const q = normalizeSearch(body.q);
    if (q) event = { t: "search", sid, src, q };
  }
  if (!event) return done();

  const now = Date.now();
  const ip = clientIp(request);
  // kraj tylko od Cloudflare (gdy ufamy jego nagłówkom) – inaczej nagłówek mógłby wpisać każdy
  const trust = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();
  // kraj tylko od zaufanego pośrednika: Cloudflare (cf-ipcountry) albo Vercel (x-vercel-ip-country) – inaczej nagłówek wpisałby każdy
  const cfCountry =
    trust === "cf-connecting-ip"
      ? request.headers.get("cf-ipcountry")
      : trust === "x-real-ip" && process.env.VERCEL
        ? request.headers.get("x-vercel-ip-country")
        : null;
  const visitor: Visitor = {
    id: visitorId(stamp(now).day, ip, ua),
    country: cfCountry && /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : "XX",
    device: /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop",
  };

  // zapis po wysłaniu odpowiedzi – wolna albo niedostępna baza nie opóźnia strony (record() sam loguje błędy)
  const tracked = event;
  after(() => record(tracked, visitor, now));
  return done();
}
