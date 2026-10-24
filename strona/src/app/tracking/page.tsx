import type { Metadata } from "next";
import { ToolHeader } from "@/components/tool-header";
import { Tracking } from "@/components/tracking";

export const metadata: Metadata = {
  title: "Śledzenie paczki",
  description: "Sprawdź, gdzie jest paczka od agenta – wpisz numer przesyłki i otwórz śledzenie w 17TRACK, Parcels albo Poczcie Polskiej.",
};

export default function TrackingPage() {
  return (
    <div className="site-container max-w-5xl pt-6">
      <ToolHeader title="Tracking" accent="Śledzenie przesyłek" description="Numer przesyłki znajdziesz w zamówieniu u agenta, gdy paczka wyjedzie z magazynu. Jeśli serwis jeszcze jej nie widzi, sprawdź ponownie za dzień lub dwa." />
      <div>
        <Tracking />
      </div>
    </div>
  );
}
