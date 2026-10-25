// Mały klient S3 (Garage, MinIO, R2, AWS) bez zależności: podpis AWS SigV4, adresy w stylu ścieżki (endpoint/bucket/klucz).
// Używają go trasa /cdn/… (zdjęcia z bucketu, gdy nie ma ich na dysku) i server/cdn-sync.mjs (wgranie cdn/ do bucketu).
// Ustawienia: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, opcjonalnie S3_REGION (Garage: "garage") i S3_PREFIX.
import { createHash, createHmac } from "node:crypto";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
// gdy S3_REGION nie pasuje do serwera, próbujemy kolejnych (Garage domyślnie "garage", R2 "auto", reszta "us-east-1")
const REGIONS = ["garage", "us-east-1", "auto"];

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
/** RFC 3986 – jak wymaga SigV4 (bez ! ' ( ) *). */
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export const encodeKey = (key) => key.split("/").map(encode).join("/");

/** Ustawienia z env albo null, gdy czegoś brakuje. */
export function s3Config(env = process.env) {
  const endpoint = String(env.S3_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const bucket = String(env.S3_BUCKET ?? "").trim();
  const accessKeyId = String(env.S3_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = String(env.S3_SECRET_ACCESS_KEY ?? "").trim();
  if (!/^https?:\/\/[^\s/]+$/i.test(endpoint) || !/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket) || !accessKeyId || !secretAccessKey) return null;
  const prefix = String(env.S3_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: String(env.S3_REGION ?? "").trim() || null, prefix: prefix ? `${prefix}/` : "" };
}

/**
 * Nagłówek Authorization (SigV4). Podpisywane są host i wszystkie podane nagłówki.
 * @param {{ method: string, host: string, path: string, query?: Record<string,string>, headers: Record<string,string>,
 *   payloadHash: string, accessKeyId: string, secretAccessKey: string, region: string, service?: string, amzDate: string }} r
 */
export function authorization(r) {
  const service = r.service ?? "s3";
  const day = r.amzDate.slice(0, 8);
  const headers = Object.fromEntries([["host", r.host], ...Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])]);
  const names = Object.keys(headers).sort();
  const query = Object.entries(r.query ?? {})
    .map(([k, v]) => [encode(k), encode(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonical = [r.method, r.path, query, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), r.payloadHash].join("\n");
  const scope = `${day}/${r.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", r.amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${r.secretAccessKey}`, day), r.region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

/** Zapytanie do bucketu (key = "" → sam bucket, np. lista). Dobiera region, gdy pierwszy nie pasuje. */
export async function s3Request(cfg, method, key, { query = {}, body, headers = {}, timeoutMs = 15_000 } = {}) {
  const url = new URL(cfg.endpoint);
  const path = `/${encode(cfg.bucket)}${key ? `/${encodeKey(key)}` : "/"}`;
  const payloadHash = body ? sha256(body) : EMPTY_SHA256;
  // region, który już raz zadziałał, jest pewny – wtedy bez zgadywania (zły klucz nie udaje złego regionu)
  const regions = cfg.regionOk ? [cfg.region] : cfg.region ? [cfg.region, ...REGIONS.filter((r) => r !== cfg.region)] : REGIONS;
  let first;
  let last;
  for (const region of regions) {
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
    const signed = { ...headers, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const auth = authorization({ method, host: url.host, path, query, headers: signed, payloadHash, accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region, amzDate });
    const qs = new URLSearchParams(query).toString();
    last = await fetch(`${url.origin}${path}${qs ? `?${qs}` : ""}`, {
      method,
      body,
      headers: { ...signed, authorization: auth },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    // zły region: Garage/AWS odpowiadają 400 albo 403 z AuthorizationHeaderMalformed / SignatureDoesNotMatch
    if ((last.status === 400 || last.status === 403) && regions.length > 1) {
      const text = await last.clone().text().catch(() => "");
      if (/region|AuthorizationHeaderMalformed|SignatureDoesNotMatch/i.test(text) && region !== regions.at(-1)) {
        first ??= last;
        continue;
      }
    }
    if (last.ok || last.status === 404) {
      cfg.region = region;
      cfg.regionOk = true;
      return last;
    }
    // żaden region nie przeszedł – pierwszy błąd mówi najwięcej (np. SignatureDoesNotMatch przy złym kluczu)
    return first ?? last;
  }
  return first ?? last;
}

/** Plik z bucketu (Response: 200 z treścią albo 404). */
export const getObject = (cfg, key, timeoutMs) => s3Request(cfg, "GET", cfg.prefix + key, { timeoutMs });

export async function putObject(cfg, key, body, contentType, cacheControl = "public, max-age=31536000, immutable") {
  const res = await s3Request(cfg, "PUT", cfg.prefix + key, { body, headers: { "content-type": contentType, "cache-control": cacheControl }, timeoutMs: 60_000 });
  if (!res.ok) throw new Error(`S3 PUT ${key}: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

const xmlDecode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Wszystkie klucze w buckecie pod prefiksem (bez prefiksu S3_PREFIX w wyniku). */
export async function listKeys(cfg, prefix = "") {
  const keys = new Set();
  let token = "";
  for (let page = 0; page < 10_000; page++) {
    const query = { "list-type": "2", "max-keys": "1000", prefix: cfg.prefix + prefix, ...(token ? { "continuation-token": token } : {}) };
    const res = await s3Request(cfg, "GET", "", { query, timeoutMs: 30_000 });
    const text = await res.text();
    if (!res.ok) throw new Error(`S3 lista: HTTP ${res.status} ${text.slice(0, 200)}`);
    for (const m of text.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.add(xmlDecode(m[1]).slice(cfg.prefix.length));
    token = /<IsTruncated>true<\/IsTruncated>/.test(text) ? xmlDecode(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text)?.[1] ?? "") : "";
    if (!token) break;
  }
  return keys;
}
