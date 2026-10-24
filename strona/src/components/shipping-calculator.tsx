"use client";

import { useMemo, useState } from "react";
import { rateNote } from "@/lib/money";
import { estimate, TYPICAL_WEIGHTS, type ShippingTable } from "@/lib/shipping";
import { Select } from "./select";
import { useSettings } from "./settings-provider";

type Item = { id: number; label: string; grams: number };
const VOUCHER_PLN = 55;
const pln = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = (g: number) => (g / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 2 });

/** Linie liczą wagę w krokach co 500 g (do 250 g – jak 250 g), tak samo jak w `estimate`. */
const billed = (g: number) => (g <= 250 ? 250 : Math.ceil(g / 500) * 500);

/** "7-13 days" → "7–13 dni" */
const days = (raw: string) => raw.replace(/\s*days?/i, " dni").replace(/(\d)\s*-\s*(\d)/, "$1–$2");
const minDays = (raw: string) => Number(/\d+/.exec(raw)?.[0] ?? Infinity);

const CONTROL = "rounded-[14px] border border-white/10 bg-neutral-900/70 text-sm text-white outline-none transition-colors focus-within:border-white/30 hover:border-white/20";

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShippingCalculator({ table }: { table: ShippingTable }) {
  const { rates } = useSettings();
  const [country, setCountry] = useState(table.countries.find((c) => c.code === "PL")?.code ?? table.countries[0]?.code ?? "PL");
  const [items, setItems] = useState<Item[]>([]);
  const [label, setLabel] = useState("");
  const [grams, setGrams] = useState("");
  const [voucher, setVoucher] = useState(false);
  const [error, setError] = useState("");

  const total = items.reduce((s, i) => s + i.grams, 0);
  const plnPerUsd = rates.USD > 0 && rates.PLN > 0 ? rates.PLN / rates.USD : 4;
  const options = useMemo(() => (total > 0 ? estimate(table.rates[country] ?? [], total) : []), [table, country, total]);
  const fastest = options.length > 1 ? options.reduce((best, o) => (minDays(o.days) < minDays(best.days) ? o : best), options[0]).name : null;
  const counts = items.reduce<Record<string, number>>((acc, i) => ((acc[i.label] = (acc[i.label] ?? 0) + 1), acc), {});

  const add = (itemLabel: string, g: number) => {
    setItems((list) => [...list, { id: Date.now() + Math.random(), label: itemLabel, grams: g }]);
    setError("");
  };

  const addManual = (e: React.FormEvent) => {
    e.preventDefault();
    const g = Number(grams);
    if (!Number.isInteger(g) || g < 10 || g > 30000) {
      setError("Podaj wagę w gramach – od 10 do 30 000.");
      return;
    }
    add(label.trim().slice(0, 60) || "Przedmiot", g);
    setLabel("");
    setGrams("");
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
      {/* paczka */}
      <section aria-labelledby="paczka" className="rounded-[22px] border border-white/10 bg-neutral-950/60 p-5 backdrop-blur-sm sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="paczka" className="text-lg font-bold text-white">
            Co jest w paczce?
          </h2>
          {items.length ? (
            <button type="button" onClick={() => setItems([])} className="text-sm text-zinc-500 transition-colors hover:text-white">
              Wyczyść
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-zinc-400">Kliknij typ przedmiotu, żeby dodać jego typową wagę, albo wpisz wagę z zamówienia u agenta.</p>

        <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TYPICAL_WEIGHTS.map((t) => (
            <li key={t.label}>
              <button
                type="button"
                onClick={() => add(t.label, t.grams)}
                aria-label={`Dodaj: ${t.label}, ${t.grams} g`}
                className="group relative flex w-full items-center justify-between gap-2 rounded-[14px] border border-white/10 bg-neutral-900/60 px-3.5 py-3 text-left transition-colors hover:border-white/25 hover:bg-neutral-800/60 active:scale-[0.98]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{t.label}</span>
                  <span className="block text-xs text-zinc-500 tabular-nums">{t.grams} g</span>
                </span>
                {counts[t.label] ? (
                  <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-xs font-bold text-black tabular-nums">
                    {counts[t.label]}
                  </span>
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-zinc-400 transition-colors group-hover:border-white/30 group-hover:text-white">
                    <Icon d="M12 5v14M5 12h14" className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={addManual} className={`mt-4 flex items-center gap-1 p-1 ${CONTROL}`}>
          <label className="sr-only" htmlFor="ship-label">
            Opis przedmiotu
          </label>
          <input
            id="ship-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={60}
            placeholder="Własny przedmiot"
            className="h-10 min-w-0 flex-1 bg-transparent px-3 text-white placeholder:text-zinc-500 focus:outline-none"
          />
          <span className="h-6 w-px bg-white/10" aria-hidden />
          <label className="sr-only" htmlFor="ship-grams">
            Waga w gramach
          </label>
          <span className="flex items-center pr-1">
            <input
              id="ship-grams"
              value={grams}
              onChange={(e) => setGrams(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={5}
              placeholder="800"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? "ship-error" : undefined}
              className="h-10 w-16 bg-transparent px-2 text-right text-white tabular-nums placeholder:text-zinc-500 focus:outline-none"
            />
            <span className="text-zinc-500">g</span>
          </span>
          <button type="submit" className="h-10 shrink-0 rounded-[10px] bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-zinc-200">
            Dodaj
          </button>
        </form>
        {error ? (
          <p id="ship-error" role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-[16px] border border-white/10">
          {items.length ? (
            <ul className="divide-y divide-white/[0.06]">
              {items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 pr-2 pl-4">
                  <span className="min-w-0 truncate text-sm text-zinc-200">{i.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-sm text-zinc-500 tabular-nums">{i.grams} g</span>
                    <button
                      type="button"
                      onClick={() => setItems((list) => list.filter((x) => x.id !== i.id))}
                      aria-label={`Usuń: ${i.label}`}
                      className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                      <Icon d="M6 6l12 12M18 6L6 18" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-7 text-center text-sm text-zinc-500">Paczka jest pusta – dodaj pierwszy przedmiot.</p>
          )}
          <div className="flex items-end justify-between gap-4 border-t border-white/10 bg-white/[0.02] px-4 py-4">
            <span>
              <span className="block text-sm text-zinc-400">Razem</span>
              {total ? <span className="block text-xs text-zinc-500">liczone jako {kg(billed(total))} kg – linie liczą co 0,5 kg</span> : null}
            </span>
            <span className="shrink-0 text-2xl font-bold tracking-[-0.03em] whitespace-nowrap text-white tabular-nums sm:text-3xl">{kg(total)} kg</span>
          </div>
        </div>
      </section>

      {/* wyniki */}
      <section aria-labelledby="linie" className="rounded-[22px] border border-white/10 bg-neutral-950/60 p-5 backdrop-blur-sm sm:p-6 lg:sticky lg:top-28">
        <h2 id="linie" className="text-lg font-bold text-white">
          Linie wysyłkowe
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select
            label="Kraj dostawy"
            options={table.countries.map((c) => ({ value: c.code, label: c.name }))}
            value={country}
            onChange={setCountry}
            icon={<Icon d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />}
            className="w-48"
          />
          <button
            type="button"
            role="switch"
            aria-checked={voucher}
            onClick={() => setVoucher((v) => !v)}
            className={`flex h-11 items-center gap-2.5 rounded-[14px] border px-3 text-sm transition-colors ${voucher ? "border-white/40 bg-white/[0.08] text-white" : "border-white/10 bg-neutral-900/70 text-zinc-400 hover:border-white/20 hover:text-white"}`}
          >
            <span className={`relative h-5 w-9 rounded-full transition-colors ${voucher ? "bg-white" : "bg-white/15"}`} aria-hidden>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-[left,background-color] ${voucher ? "left-[18px] bg-black" : "left-0.5 bg-zinc-400"}`} />
            </span>
            Kupon <span className="font-semibold text-white">Perkoz</span>
            <span className="text-zinc-500">−{VOUCHER_PLN} zł</span>
          </button>
        </div>

        <div className="mt-5" aria-live="polite">
          {!total ? (
            <div className="relative">
              <ul className="flex flex-col gap-2 opacity-40" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex items-center justify-between gap-4 rounded-[16px] border border-dashed border-white/10 px-4 py-4">
                    <span className="flex flex-col gap-2">
                      <span className="h-3 w-32 rounded-full bg-white/[0.07]" />
                      <span className="h-2.5 w-20 rounded-full bg-white/[0.05]" />
                    </span>
                    <span className="h-5 w-20 rounded-full bg-white/[0.07]" />
                  </li>
                ))}
              </ul>
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-zinc-400">Dodaj przedmioty, a pokażemy ceny linii wysyłkowych.</p>
            </div>
          ) : options.length ? (
            <ul className="flex flex-col gap-2">
              {options.map((o, idx) => {
                const base = o.price * plnPerUsd;
                const shown = voucher ? Math.max(0, base - VOUCHER_PLN) : base;
                const cheapest = idx === 0;
                return (
                  <li
                    key={o.name}
                    className={`flex items-center justify-between gap-4 rounded-[16px] border px-4 py-3.5 transition-colors ${cheapest ? "border-white/40 bg-white/[0.05]" : "border-white/10 bg-neutral-900/50"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{o.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                        <Icon d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" className="h-3.5 w-3.5 text-zinc-500" />
                        {days(o.days)}
                        {cheapest ? <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-black">Najtaniej</span> : null}
                        {o.name === fastest ? (
                          <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-200">Najszybciej</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-2xl leading-none font-bold tracking-[-0.03em] text-white tabular-nums">{pln.format(shown)} zł</span>
                      {voucher ? <span className="mt-1 block text-xs text-zinc-500 tabular-nums line-through">{pln.format(base)} zł</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[16px] border border-white/10 px-4 py-6 text-sm text-zinc-400">
              Nie mamy stawek dla tej wagi do wybranego kraju. Sprawdź wycenę w koszyku u agenta.
            </p>
          )}
        </div>

        <p className="mt-5 text-xs leading-relaxed text-zinc-500">
          Stawki linii KakoBuy z {new Date(table.updatedAt).toLocaleDateString("pl-PL")}, przeliczone z dolarów {rateNote(rates)}. Wagi pośrednie są szacowane.
          Ostateczną cenę zobaczysz u agenta po zważeniu paczki.
        </p>
      </section>
    </div>
  );
}
