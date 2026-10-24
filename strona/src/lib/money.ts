import type { Currency } from "./settings";

/** Ile jednostek danej waluty za 1 CNY. */
export type Rates = Record<Currency, number> & { date: string; source: string };

const SYMBOL: Record<Currency, string> = { PLN: "zł", EUR: "€", USD: "$", CNY: "¥" };

export function convert(cny: number, currency: Currency, rates: Rates) {
  return cny * (rates[currency] || 0);
}

export function formatPrice(cny: number, currency: Currency, rates: Rates) {
  const value = convert(cny, currency, rates);
  const digits = currency === "PLN" || currency === "CNY" || value >= 10 ? 0 : 2;
  const n = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
  return `${n} ${SYMBOL[currency]}`;
}

export const currencySymbol = (c: Currency) => SYMBOL[c];

/** Krótki opis źródła kursu do przypisów pod cenami ("po kursie KakoBuy z 24.10.2026"). */
export const rateNote = (r: Rates) => {
  const day = r.date ? new Date(r.date).toLocaleDateString("pl-PL") : "";
  if (r.source === "KakoBuy") return `po kursie KakoBuy${day ? ` z ${day}` : ""}`;
  if (r.source.startsWith("NBP")) return `po kursie NBP${day ? ` z ${day}` : ""} z narzutem jak w KakoBuy`;
  return "po kursie KakoBuy";
};

/** Odwrotność – kwota w walucie użytkownika na CNY (do filtrów ceny). */
export function toCny(amount: number, currency: Currency, rates: Rates) {
  const r = rates[currency];
  return r > 0 ? amount / r : amount;
}
