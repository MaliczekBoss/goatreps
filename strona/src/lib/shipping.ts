export type ShippingOption = { name: string; price: number; days: string };
export type ShippingPoint = { weight: number; options: ShippingOption[] };
export type ShippingTable = {
  updatedAt: string;
  currency: "USD";
  countries: { code: string; name: string }[];
  rates: Record<string, ShippingPoint[]>;
};

/** Typowe wagi paczek (g) – do szybkiego dodawania, gdy nie znasz dokładnej wagi. */
export const TYPICAL_WEIGHTS = [
  { label: "Buty", grams: 1300 },
  { label: "Kurtka", grams: 1200 },
  { label: "Bluza", grams: 750 },
  { label: "Spodnie", grams: 700 },
  { label: "Torba", grams: 700 },
  { label: "Spodenki", grams: 420 },
  { label: "Pasek", grams: 350 },
  { label: "Koszulka", grams: 250 },
  { label: "Czapka", grams: 150 },
] as const;

/**
 * Cena każdej linii dla dowolnej wagi: interpolacja liniowa między zmierzonymi punktami,
 * powyżej ostatniego punktu – przedłużenie ostatniego odcinka. Linie bez dwóch punktów obok wagi są pomijane.
 */
export function estimate(points: ShippingPoint[], rawGrams: number) {
  // linie liczą wagę w krokach co 500 g (250 g kosztuje tyle co 500 g), więc zaokrąglamy w górę do kroku
  const grams = rawGrams <= 250 ? 250 : Math.ceil(rawGrams / 500) * 500;
  const sorted = [...points].sort((a, b) => a.weight - b.weight);
  const names = new Set(sorted.flatMap((p) => p.options.map((o) => o.name)));
  const out: (ShippingOption & { exact: boolean })[] = [];

  for (const name of names) {
    const series = sorted
      .map((p) => ({ w: p.weight, o: p.options.find((o) => o.name === name) }))
      .filter((x): x is { w: number; o: ShippingOption } => !!x.o);
    if (!series.length) continue;
    const exact = series.find((x) => x.w === grams);
    if (exact) {
      out.push({ ...exact.o, exact: true });
      continue;
    }
    let lo = series.filter((x) => x.w < grams).at(-1);
    let hi = series.find((x) => x.w > grams);
    if (!lo && hi) {
      // lżej niż najmniejszy punkt – linie zwykle mają minimalną cenę, więc bierzemy najmniejszy punkt
      out.push({ ...hi.o, exact: false });
      continue;
    }
    if (lo && !hi) {
      const prev = series.filter((x) => x.w < lo!.w).at(-1);
      if (!prev) continue;
      hi = lo;
      lo = prev;
    }
    if (!lo || !hi) continue;
    const t = (grams - lo.w) / (hi.w - lo.w);
    const price = lo.o.price + (hi.o.price - lo.o.price) * t;
    out.push({ name, days: (t < 0.5 ? lo : hi).o.days, price: Math.max(0, price), exact: false });
  }
  return out.sort((a, b) => a.price - b.price);
}
