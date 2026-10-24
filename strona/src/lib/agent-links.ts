import type { AgentKey } from "./types";

// Port konwertera ze starej strony (docs/link-converter.md) z poprawionymi błędami B1–B6:
// bezpieczne dekodowanie, rozpoznawanie hosta po nazwie domeny (nie po fragmencie tekstu),
// obsługa Tmall, world.taobao, weidian.com/item/{id} i linków CNFans.

export type Platform = "weidian" | "taobao" | "1688";
export type Parsed = { itemId: string; platform: Platform; source: AgentKey | "direct" };

/** Kody polecające goatreps (ze starej strony). Puste = link bez kodu. */
export const REFERRALS: Record<AgentKey, string> = {
  kakobuy: "Perkoz",
  usfans: "GSWJ8H",
  allchinabuy: "wVSV4X",
  acbuy: "MD2BNM",
  litbuy: "GOATREPS",
  cnfans: "634281",
  mulebuy: "200910978",
  oopbuy: "",
};

const MAX_INPUT = 2000;
const ID = /^\d{5,20}$/;

function safeDecode(text: string) {
  let out = text;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(out);
      if (next === out) break;
      out = next;
    } catch {
      break;
    }
  }
  return out;
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function toUrl(text: string): URL | null {
  const t = text.trim();
  if (!t || t.length > MAX_INPUT) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Link bezpośrednio do sklepu (Weidian / Taobao / Tmall / 1688). */
function parseMarketplace(u: URL): Omit<Parsed, "source"> | null {
  const host = u.hostname.toLowerCase();
  const q = (k: string) => (ID.test(u.searchParams.get(k) ?? "") ? u.searchParams.get(k)! : "");
  // zapas na linki z zakodowanym "=" albo śmieciami na końcu (np. itemID%3D123…, itemID=123%)
  const decoded = safeDecode(u.search);
  if (hostIs(host, "weidian.com")) {
    const id = q("itemID") || q("itemId") || q("itemid") || u.pathname.match(/\/item\/(\d+)/)?.[1] || decoded.match(/itemI[Dd]=(\d{5,20})/)?.[1] || "";
    return ID.test(id) ? { itemId: id, platform: "weidian" } : null;
  }
  if (hostIs(host, "taobao.com") || hostIs(host, "tmall.com")) {
    const id = q("id") || q("itemId") || u.pathname.match(/\/item\/(\d+)\.htm/)?.[1] || decoded.match(/[?&]id=(\d{5,20})/)?.[1] || "";
    return ID.test(id) ? { itemId: id, platform: "taobao" } : null;
  }
  if (hostIs(host, "1688.com")) {
    const id = u.pathname.match(/\/offer\/(\d+)\.html/)?.[1] || q("offerId") || "";
    return ID.test(id) ? { itemId: id, platform: "1688" } : null;
  }
  return null;
}

const platformFrom = (value: string, map: Record<string, Platform>, fallback: Platform = "weidian") => map[value] ?? fallback;

/** Rozpoznaje link ze sklepu albo od agenta. Zwraca null, gdy to nie jest znany link. */
export function parseLink(input: string): Parsed | null {
  const u = toUrl(input);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const q = (k: string) => u.searchParams.get(k) ?? "";
  const path = u.pathname;

  const direct = parseMarketplace(u);
  if (direct) return { ...direct, source: "direct" };

  // agenci, którzy trzymają oryginalny link w parametrze url=
  for (const [domain, source] of [
    ["kakobuy.com", "kakobuy"],
    ["allchinabuy.com", "allchinabuy"],
  ] as const) {
    if (!hostIs(host, domain)) continue;
    const inner = toUrl(safeDecode(q("url")));
    const p = inner ? parseMarketplace(inner) : null;
    return p ? { ...p, source } : null;
  }

  const seg = path.match(/\/product\/([^/]+)\/(\d{5,20})(?:[/?#]|$)/);
  if (hostIs(host, "litbuy.com") && seg) {
    return { itemId: seg[2], platform: platformFrom(seg[1].toLowerCase(), { taobao: "taobao", "1688": "1688" }), source: "litbuy" };
  }
  if (hostIs(host, "usfans.com") && seg) {
    return { itemId: seg[2], platform: platformFrom(seg[1], { "1": "1688", "2": "taobao" }), source: "usfans" };
  }
  if (hostIs(host, "oopbuy.com") && seg) {
    return { itemId: seg[2], platform: platformFrom(seg[1].toUpperCase(), { TAOBAO: "taobao", "1688": "1688" }), source: "oopbuy" };
  }
  if (hostIs(host, "acbuy.com") && ID.test(q("id"))) {
    return { itemId: q("id"), platform: platformFrom(q("source"), { TB: "taobao", AL: "1688" }), source: "acbuy" };
  }
  if (hostIs(host, "mulebuy.com") && ID.test(q("id"))) {
    return { itemId: q("id"), platform: platformFrom(q("platform"), { TAOBAO: "taobao", ALI_1688: "1688" }), source: "mulebuy" };
  }
  if (hostIs(host, "cnfans.com") && ID.test(q("id"))) {
    return { itemId: q("id"), platform: platformFrom(q("shop_type").toLowerCase(), { taobao: "taobao", ali_1688: "1688", "1688": "1688" }), source: "cnfans" };
  }
  return null;
}

export function marketplaceUrl({ itemId, platform }: Pick<Parsed, "itemId" | "platform">) {
  if (platform === "weidian") return `https://weidian.com/item.html?itemID=${itemId}`;
  if (platform === "taobao") return `https://item.taobao.com/item.htm?id=${itemId}`;
  return `https://detail.1688.com/offer/${itemId}.html`;
}

/** Link do produktu u agenta, zawsze z kodem polecającym goatreps. */
export function agentUrl(agent: AgentKey, p: Pick<Parsed, "itemId" | "platform">): string {
  const { itemId: id, platform } = p;
  const enc = encodeURIComponent(marketplaceUrl(p));
  const ref = encodeURIComponent(REFERRALS[agent]);
  switch (agent) {
    case "kakobuy":
      return `https://kakobuy.com/item/details?url=${enc}&affcode=${ref}`;
    case "allchinabuy":
      return `https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=${enc}&partnercode=${ref}`;
    case "litbuy":
      return `https://litbuy.com/product/${platform}/${id}?inviteCode=${ref}`;
    case "usfans":
      return `https://www.usfans.com/product/${platform === "1688" ? "1" : platform === "taobao" ? "2" : "3"}/${id}?ref=${ref}`;
    case "acbuy":
      return `https://www.acbuy.com/product?id=${id}&source=${platform === "weidian" ? "WD" : platform === "1688" ? "AL" : "TB"}&u=${ref}`;
    case "oopbuy":
      return `https://oopbuy.com/product/${platform === "weidian" ? "WEIDIAN" : platform === "1688" ? "1688" : "TAOBAO"}/${id}${ref ? `?ref=${ref}` : ""}`;
    case "mulebuy":
      return `https://mulebuy.com/product?id=${id}&platform=${platform === "1688" ? "ALI_1688" : platform === "weidian" ? "WEIDIAN" : "TAOBAO"}&ref=${ref}`;
    case "cnfans":
      return `https://cnfans.com/product/?shop_type=${platform}&id=${id}&ref=${ref}`;
  }
}
