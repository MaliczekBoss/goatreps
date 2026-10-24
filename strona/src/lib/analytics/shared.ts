// Wspólne dla przeglądarki i serwera (bez server-only): źródła wejść, dozwolone ścieżki, hosty agentów.

export type SourceId =
  | "google"
  | "bing"
  | "duckduckgo"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "discord"
  | "youtube"
  | "reddit"
  | "x"
  | "telegram"
  | "direct"
  | "other";

export const sources: Record<SourceId, { label: string; color: string; mark: string }> = {
  google: { label: "Google", color: "#ffffff", mark: "G" },
  bing: { label: "Bing", color: "#2b7de9", mark: "b" },
  duckduckgo: { label: "DuckDuckGo", color: "#de5833", mark: "D" },
  facebook: { label: "Facebook", color: "#1877f2", mark: "f" },
  instagram: { label: "Instagram", color: "#e1306c", mark: "I" },
  tiktok: { label: "TikTok", color: "#25f4ee", mark: "T" },
  discord: { label: "Discord", color: "#5865f2", mark: "D" },
  youtube: { label: "YouTube", color: "#ff0000", mark: "▶" },
  reddit: { label: "Reddit", color: "#ff4500", mark: "r" },
  x: { label: "X", color: "#e7e9ea", mark: "X" },
  telegram: { label: "Telegram", color: "#2aabee", mark: "t" },
  direct: { label: "Bezpośrednio", color: "#8f8f94", mark: "→" },
  other: { label: "Inne strony", color: "#5f5f66", mark: "…" },
};

export const isSource = (v: unknown): v is SourceId =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(sources, v);

/** Zakresy panelu statystyk (tu, a nie w stats.ts, żeby komponenty klienta mogły ich użyć). */
export type Range = "today" | "yesterday" | "7d" | "30d";
export const ranges: Range[] = ["today", "yesterday", "7d", "30d"];

const HOSTS: [SourceId, RegExp][] = [
  ["google", /(^|\.)google\.[a-z.]+$/],
  ["bing", /(^|\.)bing\.com$/],
  ["duckduckgo", /(^|\.)duckduckgo\.com$/],
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["discord", /(^|\.)(discord\.com|discord\.gg|discordapp\.com)$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
  ["reddit", /(^|\.)reddit\.com$/],
  ["x", /(^|\.)(twitter\.com|x\.com|t\.co)$/],
  ["telegram", /(^|\.)(t\.me|telegram\.org)$/],
];

/** Źródło wejścia z utm_source albo z adresu poprzedniej strony. */
export function classifySource(referrer: string, utm: string | null, ownHost: string): SourceId {
  const tag = utm?.trim().toLowerCase().slice(0, 60);
  if (tag) {
    if (isSource(tag)) return tag;
    const fromTag = HOSTS.find(([id]) => tag.includes(id))?.[0];
    if (fromTag) return fromTag;
    if (tag === "fb" || tag === "ig") return tag === "fb" ? "facebook" : "instagram";
  }
  if (!referrer) return "direct";
  let host = "";
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "direct";
  }
  if (!host || host === ownHost.replace(/^www\./, "").toLowerCase()) return "direct";
  return HOSTS.find(([, re]) => re.test(host))?.[0] ?? "other";
}

// Strony goatreps. Wszystko inne (404, stare adresy, śmieci) liczy się jako /inne.
const PATHS = /^\/(?:products|qc-finder|link-converter|tracking|shipping|tools|photo-search|item\/details\/\d{1,7})?$/;

/** Ścieżka bez parametrów i końcowego ukośnika, z białej listy – inaczej "/inne". */
export function normalizePath(path: string) {
  if (typeof path !== "string" || path.length > 300) return "/inne";
  const clean = (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  return PATHS.test(clean) ? clean : "/inne";
}

/** Kliknięcia wychodzące: agenci (kolejność jak w AGENT_KEYS) i oryginalna aukcja w sklepie. */
export const AGENT_HOSTS: [string, RegExp][] = [
  ["kakobuy", /(^|\.)kakobuy\.com$/],
  ["usfans", /(^|\.)usfans\.com$/],
  ["allchinabuy", /(^|\.)allchinabuy\.com$/],
  ["acbuy", /(^|\.)acbuy\.com$/],
  ["litbuy", /(^|\.)litbuy\.com$/],
  ["cnfans", /(^|\.)cnfans\.com$/],
  ["mulebuy", /(^|\.)mulebuy\.com$/],
  ["oopbuy", /(^|\.)oopbuy\.com$/],
  ["oryginal", /(^|\.)(weidian\.com|taobao\.com|tmall\.com|1688\.com)$/],
];

/** Link z okna promocji KakoBuy (ikako.vip) – liczony osobno jako "promo". */
export const PROMO_HOST = /(^|\.)ikako\.vip$/;

export const SESSION_ID = /^[a-z0-9]{8,24}$/;

const SEARCH_CHARS = /^[a-z0-9ąćęłńóśźż -]+$/;

/**
 * Fraza wyszukiwania do statystyk: małe litery, bez zbędnych spacji, max 40 znaków,
 * tylko litery (z polskimi), cyfry, spacje i myślniki. Cokolwiek innego (linki, emoji, za długie) → null.
 */
export function normalizeSearch(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const q = raw.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
  if (!q || q.length > 40 || !SEARCH_CHARS.test(q) || !/[a-z0-9ąćęłńóśźż]/.test(q)) return null;
  return q;
}
