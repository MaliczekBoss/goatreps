// Strażnik przed Next.js (używa go server/serve.mjs): skąd przyszło zapytanie i czy je wpuścić.
//  - CLOUDFLARE_ONLY=1: tylko połączenia z adresów Cloudflare (i z localhost). Sieć lokalna (reverse proxy na węźle)
//    tylko z TRUST_LOCAL_NETWORK=1 – domyślnie nie, bo za proxy Dockera cały ruch, także obcy, ma adres 172.x.
//    Kto zna IP:port serwera, nie ominie Cloudflare (WAF, ochrona przed DDoS) i nie podrobi cf-connecting-ip,
//    z którego liczone są limity zapytań (logowanie, wyszukiwanie po zdjęciu, ceny).
//  - CF_ORIGIN_SECRET: (opcjonalnie) tajny nagłówek X-Origin-Secret dopisywany przez regułę w Cloudflare –
//    wtedy nawet inne konto Cloudflare skierowane na nasz adres IP nie dostanie strony.
//  - nagłówki cf-* / x-forwarded-* od kogoś spoza zaufanych adresów są usuwane, x-forwarded-host zawsze,
//    a x-real-ip zawsze ustawia strażnik (adres od Cloudflare albo z połączenia – działa też bez domeny),
//  - tylko domeny strony (NEXT_PUBLIC_SITE_URL + www, ALLOWED_HOSTS); www → przekierowanie na adres główny,
//  - POST/PUT/PATCH/DELETE tylko z Origin naszej strony (Next sam przepuszcza akcje serwera bez Origin),
//    /api/* nie dla innych stron (Sec-Fetch-Site: cross-site),
//  - zapytania większe niż 6 MB odrzucane od razu.
import { createHash, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";

// https://www.cloudflare.com/ips/ (stan z 25.10.2026) – na start i gdy pobranie aktualnej listy się nie uda
export const CLOUDFLARE_FALLBACK = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
  "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];
const LOOPBACK = ["127.0.0.0/8", "::1/128"];
const LOCAL = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10", "fc00::/7", "fe80::/10"];
// nagłówki, które ustawia pośrednik – od obcego adresu to zawsze podróbka
const FORWARDED = ["cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "cf-worker", "true-client-ip", "x-real-ip", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-port"];
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_BODY = 6 * 1024 * 1024;

const on = (v, fallback) => (v == null || String(v).trim() === "" ? fallback : /^(1|true|yes|tak|on)$/i.test(String(v).trim()));

export function blockList(cidrs) {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [ip, bits] = cidr.split("/");
    const v = isIP(ip);
    if (!v || !/^\d{1,3}$/.test(bits ?? "")) continue;
    list.addSubnet(ip, Number(bits), v === 6 ? "ipv6" : "ipv4");
  }
  return list;
}

/** Lista z cloudflare.com/ips-v4 i ips-v6 (tylko poprawne zakresy; za krótka = błąd). */
export function parseCloudflare(texts) {
  const cidrs = texts.flatMap((t) => t.split(/\s+/)).filter((c) => /^[0-9a-f:.]+\/\d{1,3}$/i.test(c) && isIP(c.split("/")[0]));
  if (cidrs.length < 10) throw new Error("za krótka lista adresów");
  return cidrs;
}

export function createGuard(env = process.env) {
  const cloudflareOnly = on(env.CLOUDFLARE_ONLY, false);
  const trustLocal = on(env.TRUST_LOCAL_NETWORK, false);
  const secret = (env.CF_ORIGIN_SECRET ?? "").trim();
  const secretHash = secret ? createHash("sha256").update(secret).digest() : null;
  const site = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SITE_URL || "https://goatreps.com");
    } catch {
      return new URL("https://goatreps.com");
    }
  })();
  const apex = site.host.toLowerCase().replace(/^www\./, "");
  const hosts = new Set([apex, `www.${apex}`, ...String(env.ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)]);
  const loopback = blockList(LOOPBACK);
  const local = blockList(LOCAL);
  let cloudflare = blockList(CLOUDFLARE_FALLBACK);

  /** loopback | local | cloudflare | public (privateNet: adres z sieci lokalnej, której nie ufamy) */
  function classify(address) {
    let ip = String(address ?? "");
    if (ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
    const v = isIP(ip);
    if (!v) return { ip, kind: "public" };
    const type = v === 6 ? "ipv6" : "ipv4";
    if (loopback.check(ip, type)) return { ip, kind: "loopback" };
    if (cloudflare.check(ip, type)) return { ip, kind: "cloudflare" };
    if (local.check(ip, type)) return trustLocal ? { ip, kind: "local" } : { ip, kind: "public", privateNet: true };
    return { ip, kind: "public" };
  }

  /** Czy w ogóle rozmawiać z tym połączeniem (sprawdzane od razu po połączeniu, zanim przyjdą nagłówki). */
  const acceptConnection = (address) => !cloudflareOnly || classify(address).kind !== "public";

  const secretOk = (value) => {
    if (!secretHash) return true;
    if (typeof value !== "string" || !value) return false;
    return timingSafeEqual(createHash("sha256").update(value).digest(), secretHash);
  };

  const originOk = (headers) => {
    const origin = headers.origin;
    if (typeof origin !== "string" || !origin || origin === "null") return false;
    try {
      const host = new URL(origin).host.toLowerCase();
      return host === String(headers.host ?? "").toLowerCase() || hosts.has(host);
    } catch {
      return false;
    }
  };

  /**
   * Decyzja dla zapytania. Czyści nagłówki w `req.headers` (na miejscu) i zwraca:
   * { pass: true, peer } albo { status, text, peer } albo { redirect, peer }.
   */
  function check(req, address) {
    const peer = classify(address);
    const trusted = peer.kind !== "public";
    const h = req.headers;
    delete h["x-forwarded-host"];
    if (!trusted) for (const name of FORWARDED) delete h[name];
    // prawdziwy adres odwiedzającego zawsze w x-real-ip (TRUST_PROXY=x-real-ip): od Cloudflare z cf-connecting-ip,
    // od zaufanego proxy z jego nagłówka, a przy bezpośrednim połączeniu (serwer bez domeny) – adres połączenia
    const valid = (v) => (typeof v === "string" && isIP(v.trim()) ? v.trim() : "");
    h["x-real-ip"] =
      (peer.kind === "cloudflare" && valid(h["cf-connecting-ip"])) ||
      ((peer.kind === "local" || peer.kind === "loopback") && (valid(h["x-real-ip"]) || valid(h["cf-connecting-ip"]))) ||
      peer.ip;

    if (cloudflareOnly && peer.kind !== "loopback") {
      if (!trusted) return { status: 403, text: `Strona działa tylko przez ${site.protocol}//${apex}`, peer, reason: "spoza Cloudflare" };
      if (!secretOk(h["x-origin-secret"])) return { status: 403, text: `Strona działa tylko przez ${site.protocol}//${apex}`, peer, reason: "bez tajnego nagłówka" };
      if (!hosts.has(String(h.host ?? "").toLowerCase())) return { status: 421, text: "Nieznana domena.", peer, reason: "obca domena" };
    }
    delete h["x-origin-secret"];

    if (String(h.host ?? "").toLowerCase() === `www.${apex}` && apex !== "localhost") {
      const url = typeof req.url === "string" && req.url.startsWith("/") ? req.url : "/";
      return { redirect: `${site.protocol}//${apex}${url}`, peer };
    }
    if (UNSAFE.has(String(req.method).toUpperCase()) && !originOk(h)) return { status: 403, text: "Niedozwolone źródło zapytania.", peer, reason: "POST bez naszego Origin" };
    // API tylko dla naszej strony: obca strona nie użyje go przeglądarkami swoich odwiedzających (np. <img src=/api/price/…>)
    const fetchSite = String(h["sec-fetch-site"] ?? "");
    if (String(req.url ?? "").startsWith("/api/") && (fetchSite === "cross-site" || fetchSite === "same-site"))
      return { status: 403, text: "Niedozwolone źródło zapytania.", peer, reason: "API z obcej strony" };
    if (Number(h["content-length"] ?? 0) > MAX_BODY) return { status: 413, text: "Za duże zapytanie.", peer, reason: "za duże" };
    return { pass: true, peer };
  }

  return {
    cloudflareOnly,
    hosts,
    apex,
    classify,
    acceptConnection,
    check,
    setCloudflare: (cidrs) => (cloudflare = blockList(cidrs)),
  };
}
