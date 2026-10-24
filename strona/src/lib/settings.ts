import { AGENT_KEYS, type AgentKey } from "./types";

export const CURRENCIES = ["PLN", "EUR", "USD", "CNY"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type Settings = { currency: Currency; agent: AgentKey };

export const SETTINGS_COOKIE = "gr_ustawienia";
export const DEFAULT_SETTINGS: Settings = { currency: "PLN", agent: "kakobuy" };

export const AGENTS: Record<AgentKey, { name: string }> = {
  kakobuy: { name: "KakoBuy" },
  usfans: { name: "USFans" },
  allchinabuy: { name: "AllChinaBuy" },
  acbuy: { name: "ACBuy" },
  litbuy: { name: "LitBuy" },
  cnfans: { name: "CNFans" },
  mulebuy: { name: "MuleBuy" },
  oopbuy: { name: "OopBuy" },
};

const isCurrency = (v: string): v is Currency => (CURRENCIES as readonly string[]).includes(v);
const isAgent = (v: string): v is AgentKey => (AGENT_KEYS as readonly string[]).includes(v);

/** Cookie ma postać "PLN.kakobuy". Wszystko, co nie pasuje do listy, jest ignorowane. */
export function parseSettings(raw: string | undefined | null): Settings {
  if (!raw || raw.length > 40) return DEFAULT_SETTINGS;
  const [currency = "", agent = ""] = raw.split(".");
  return {
    currency: isCurrency(currency) ? currency : DEFAULT_SETTINGS.currency,
    agent: isAgent(agent) ? agent : DEFAULT_SETTINGS.agent,
  };
}

export const serializeSettings = (s: Settings) => `${s.currency}.${s.agent}`;
