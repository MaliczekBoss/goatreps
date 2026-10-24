import { agentUrl } from "./agent-links";
import { AGENT_KEYS, type AgentKey, type Product } from "./types";

// Linki wychodzące tylko do znanych sklepów i agentów. Wszystko inne (np. javascript:, http:, obce domeny) jest odrzucane.
const ALLOWED_HOSTS = [
  "weidian.com",
  "taobao.com",
  "tmall.com",
  "1688.com",
  "kakobuy.com",
  "ikako.vip",
  "cnfans.com",
  "allchinabuy.com",
  "litbuy.com",
  "usfans.com",
  "acbuy.com",
  "oopbuy.com",
  "mulebuy.com",
];

export function safeLink(url: string | undefined | null): string | null {
  if (!url || url.length > 2000) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Linki do agentów dla produktu. Gdy znamy sklep i numer przedmiotu, budujemy je sami z kodami polecającymi
 * (w bazie większość linków ma puste kody); inaczej bierzemy zapisane linki.
 */
export function agentLinks(product: Pick<Product, "links" | "platform" | "itemId">) {
  const known =
    (product.platform === "weidian" || product.platform === "taobao" || product.platform === "1688") &&
    !!product.itemId &&
    /^\d{5,20}$/.test(product.itemId);
  return AGENT_KEYS.map((key) => ({
    key,
    url: known ? agentUrl(key, { itemId: product.itemId!, platform: product.platform! }) : safeLink(product.links[key]),
  })).filter((x): x is { key: AgentKey; url: string } => x.url !== null);
}

export const OUTBOUND_REL = "nofollow sponsored noopener noreferrer";
