"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { convert, currencySymbol, toCny } from "@/lib/money";
import { queryToParams } from "@/lib/query";
import type { Query, Sort, Tag } from "@/lib/types";
import { SearchIcon } from "./search-modal";
import { useSettings } from "./settings-provider";

const SORTS: { value: Sort; label: string; icon: string }[] = [
  {
    value: "random",
    label: "Losowe",
    icon: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  },
  {
    value: "newest",
    label: "Najnowsze",
    icon: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  },
  {
    value: "oldest",
    label: "Najstarsze",
    icon: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  },
  {
    value: "price_asc",
    label: "Cena rosnąco",
    icon: "M3 17l6-6 4 4 8-8M15 7h6v6",
  },
  {
    value: "price_desc",
    label: "Cena malejąco",
    icon: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  },
];

const BATCHES: { value: Tag | null; label: string; hint: string }[] = [
  { value: null, label: "Wszystkie batche", hint: "Bez filtra" },
  { value: "bestbatch", label: "Best batch", hint: "Najlepsza wersja modelu" },
  { value: "budgetbatch", label: "Budget batch", hint: "Najtańsza sensowna wersja" },
  { value: "random", label: "Random", hint: "Pozostałe findy" },
];

type Props = { query: Query; categories: { slug: string; name: string }[] };

const href = (q: Query, patch: Partial<Query>) => {
  const s = queryToParams({ ...q, ...patch }).toString();
  return s ? `/products?${s}` : "/products";
};

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        close();
    };
    document.addEventListener("mousedown", on);
    document.addEventListener("keydown", on);
    return () => {
      document.removeEventListener("mousedown", on);
      document.removeEventListener("keydown", on);
    };
  }, [open, close]);
  return ref;
}

const pill =
  "inline-flex items-center gap-2 rounded-xl border border-border bg-card-2/60 px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:border-border-strong";

/** Wyszukiwarka, sortowanie, cena i kategorie – wszystko zapisane w adresie strony. */
export function CatalogControls({ query, categories }: Props) {
  const router = useRouter();
  const { settings, rates } = useSettings();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(query.search);
  const [sortOpen, setSortOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const sortRef = useOutside(sortOpen, () => setSortOpen(false));
  const priceRef = useOutside(priceOpen, () => setPriceOpen(false));
  const batchRef = useOutside(batchOpen, () => setBatchOpen(false));
  const local = (cny: number | null) =>
    cny == null
      ? ""
      : String(Math.round(convert(cny, settings.currency, rates)));
  const [min, setMin] = useState(local(query.minPrice));
  const [max, setMax] = useState(local(query.maxPrice));
  const symbol = currencySymbol(settings.currency);

  const navigate = (patch: Partial<Query>, replace = false) =>
    start(() =>
      replace
        ? router.replace(href(query, patch), { scroll: false })
        : router.push(href(query, patch), { scroll: false }),
    );

  // wyszukiwanie z innego miejsca (np. okno Ctrl+K) – przepisz do pola, chyba że ktoś w nim właśnie pisze
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) setSearch(query.search);
  }, [query.search]);

  // wpisywanie w pole – wyniki odświeżają się po chwili przerwy
  useEffect(() => {
    if (search.trim() === query.search) return;
    const t = setTimeout(() => navigate({ search: search.trim() }, true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const applyPrice = () => {
    const toQ = (v: string) =>
      /^\d{1,7}$/.test(v)
        ? Math.round(toCny(Number(v), settings.currency, rates) * 100) / 100
        : null;
    let lo = toQ(min);
    let hi = toQ(max);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    setPriceOpen(false);
    navigate({ minPrice: lo, maxPrice: hi });
  };
  const priceActive = query.minPrice != null || query.maxPrice != null;
  const current = SORTS.find((s) => s.value === query.sort) ?? SORTS[0];

  return (
    <div className={pending ? "opacity-90" : undefined}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-subtle" />
        <label htmlFor="szukaj-katalog" className="sr-only">
          Szukaj produktów albo wklej link
        </label>
        <input
          ref={input}
          id="szukaj-katalog"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={300}
          autoComplete="off"
          spellCheck={false}
          placeholder="Szukaj... (nazwa, marka albo link z Weidiana)"
          className="w-full rounded-xl border border-border bg-card-2/60 py-3 pr-11 pl-11 text-white placeholder:text-subtle focus:border-border-strong focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Wyczyść wyszukiwanie"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg p-1.5 text-subtle hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div ref={sortRef} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((v) => !v)}
            className={pill}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path
                d={current.icon}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {current.label}
            <svg
              viewBox="0 0 24 24"
              className={`h-3.5 w-3.5 text-subtle transition-transform ${sortOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {sortOpen ? (
            <ul className="pop-in absolute top-full left-0 z-30 mt-2 w-52 origin-top-left rounded-xl border border-border bg-card-2 p-1 shadow-2xl">
              {SORTS.map((s) => (
                <li key={s.value}>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOpen(false);
                      navigate({ sort: s.value, seed: null });
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 ${s.value === query.sort ? "text-white" : "text-zinc-400"}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                      <path
                        d={s.icon}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div ref={priceRef} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={priceOpen}
            onClick={() => setPriceOpen((v) => !v)}
            className={`${pill} ${priceActive ? "border-white/40 text-white" : ""}`}
          >
            {priceActive ? `${min || 0} – ${max || "∞"} ${symbol}` : "Cena"}
            <svg
              viewBox="0 0 24 24"
              className={`h-3.5 w-3.5 text-subtle transition-transform ${priceOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {priceOpen ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyPrice();
              }}
              className="pop-in absolute top-full left-0 z-30 mt-2 w-72 origin-top-left rounded-xl border border-border bg-card-2 p-4 shadow-2xl"
            >
              <p className="text-sm font-semibold">Cena ({symbol})</p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  inputMode="numeric"
                  aria-label="Cena od"
                  placeholder="Min"
                  value={min}
                  maxLength={7}
                  onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm tabular"
                />
                <span className="text-subtle" aria-hidden>
                  –
                </span>
                <input
                  inputMode="numeric"
                  aria-label="Cena do"
                  placeholder="Max"
                  value={max}
                  maxLength={7}
                  onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm tabular"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-white py-2 text-sm font-bold text-black hover:bg-zinc-100"
                >
                  Pokaż
                </button>
                {priceActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMin("");
                      setMax("");
                      setPriceOpen(false);
                      navigate({ minPrice: null, maxPrice: null });
                    }}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-zinc-300 hover:border-border-strong"
                  >
                    Wyczyść
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>

        <div ref={batchRef} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={batchOpen}
            onClick={() => setBatchOpen((v) => !v)}
            className={`${pill} ${query.tag ? "border-white/40 text-white" : ""}`}
          >
            {query.tag ? BATCHES.find((b) => b.value === query.tag)?.label : "Batch"}
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-subtle transition-transform ${batchOpen ? "rotate-180" : ""}`} aria-hidden>
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          {batchOpen ? (
            <ul className="pop-in absolute top-full left-0 z-30 mt-2 w-60 origin-top-left rounded-xl border border-border bg-card-2 p-1 shadow-2xl">
              {BATCHES.map((b) => (
                <li key={b.label}>
                  <button
                    type="button"
                    onClick={() => {
                      setBatchOpen(false);
                      navigate({ tag: b.value, seed: null });
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-white/5 ${query.tag === b.value ? "text-white" : "text-zinc-400"}`}
                  >
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${query.tag === b.value ? "bg-white" : "bg-transparent"}`} aria-hidden />
                    <span>
                      <span className="block text-sm">{b.label}</span>
                      <span className="block text-xs text-zinc-500">{b.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <span
          className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block"
          aria-hidden
        />

        <ul
          className="fade-x no-scrollbar -mx-1 flex w-full min-w-0 gap-2 overflow-x-auto px-1 py-1 sm:w-auto sm:flex-1"
          aria-label="Kategorie"
        >
          <li className="shrink-0">
            <Link
              href={href(query, { category: null, seed: null })}
              scroll={false}
              aria-current={!query.category ? "page" : undefined}
              className="inline-block rounded-full border border-border px-3.5 py-1.5 text-sm text-zinc-300 transition-colors hover:border-border-strong hover:text-white aria-[current=page]:border-white aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-black"
            >
              Wszystkie
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug} className="shrink-0">
              <Link
                href={href(query, { category: c.slug, seed: null })}
                scroll={false}
                aria-current={query.category === c.slug ? "page" : undefined}
                className="inline-block rounded-full border border-border px-3.5 py-1.5 text-sm text-zinc-300 transition-colors hover:border-border-strong hover:text-white aria-[current=page]:border-white aria-[current=page]:bg-white aria-[current=page]:font-semibold aria-[current=page]:text-black"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
