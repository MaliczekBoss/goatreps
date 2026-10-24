import type { Metadata } from "next";
import { ToolHeader } from "@/components/tool-header";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ShippingCalculator } from "@/components/shipping-calculator";
import type { ShippingTable } from "@/lib/shipping";

export const metadata: Metadata = {
  title: "Kalkulator wysyłki",
  description: "Policz koszt wysyłki paczki z Chin do Polski, Niemiec, Czech i innych krajów według wagi – ceny linii KakoBuy w złotówkach.",
};

function loadTable(): ShippingTable | null {
  try {
    const t = JSON.parse(readFileSync(path.join(process.cwd(), "data", "shipping.json"), "utf8")) as ShippingTable;
    return t.countries?.length && t.rates ? t : null;
  } catch {
    return null;
  }
}

export default function ShippingPage() {
  const table = loadTable();
  return (
    <div className="site-container pt-6">
      <ToolHeader title="Kalkulator" accent="kosztów wysyłki" description="Dodaj przedmioty, wybierz kraj i porównaj linie wysyłkowe z magazynu w Chinach." />
      <div>
        {table ? (
          <ShippingCalculator table={table} />
        ) : (
          <p className="max-w-xl rounded-[22px] border border-white/10 bg-neutral-950/60 p-6 text-zinc-400">
            Stawki wysyłki są chwilowo niedostępne. Sprawdź wycenę w koszyku u agenta.
          </p>
        )}
      </div>
    </div>
  );
}
