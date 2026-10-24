"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/money";
import { useSettings } from "./settings-provider";

type Props = { id: number; cny: number; checkedAt: string | null };
type Fresh = {
  price: number;
  checkedAt: string;
  changed: boolean;
  available: boolean;
};

const rtf = new Intl.RelativeTimeFormat("pl-PL", { numeric: "auto" });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return "przed chwilą";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

/**
 * Cena na stronie produktu. Po wejściu pyta serwer o aktualną cenę – serwer sprawdza sklep najwyżej raz na 3 dni
 * dla danego produktu, więc zwykle odpowiedź przychodzi od razu z zapisanej ceny.
 */
export function LivePrice({ id, cny, checkedAt }: Props) {
  const { settings, rates } = useSettings();
  const [price, setPrice] = useState(cny);
  const [checked, setChecked] = useState(checkedAt);
  const [state, setState] = useState<
    "idle" | "checking" | "updated" | "unavailable"
  >("idle");

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(
      () => setState((s) => (s === "idle" ? "checking" : s)),
      400,
    );
    fetch(`/api/price/${id}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    })
      .then((r) => (r.ok ? (r.json() as Promise<Fresh>) : null))
      .then((data) => {
        if (!data || !(data.price > 0)) return setState("idle");
        setChecked(data.checkedAt);
        if (data.available === false) setState("unavailable");
        else if (Math.abs(data.price - cny) >= 0.01) {
          setPrice(data.price);
          setState("updated");
        } else setState("idle");
      })
      .catch(() => setState("idle"))
      .finally(() => clearTimeout(t));
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [id, cny]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          key={price}
          className={`text-5xl font-bold tracking-tight text-white tabular ${state === "updated" ? "price-flash" : ""}`}
        >
          {formatPrice(price, settings.currency, rates)}
        </span>
        <span className="text-zinc-500 tabular">¥{Math.round(price)} CNY</span>
      </div>
      <p
        className="mt-2 flex items-center gap-1.5 text-xs text-subtle"
        aria-live="polite"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${state === "checking" ? "animate-pulse bg-zinc-400" : state === "unavailable" ? "bg-red-400" : "bg-green-500"}`}
          aria-hidden
        />
        {state === "checking"
          ? "Sprawdzam aktualną cenę w sklepie…"
          : state === "updated"
            ? "Cena zaktualizowana ze sklepu przed chwilą"
            : state === "unavailable"
              ? "Sklep zgłasza, że produkt może być niedostępny"
              : checked
                ? `Cena sprawdzona w sklepie ${ago(checked)}`
                : "Cena z katalogu"}
      </p>
    </div>
  );
}
