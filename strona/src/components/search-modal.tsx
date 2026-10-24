"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeDialog } from "@/lib/dialog";
import { cdn } from "@/lib/images";
import type { ProductCard } from "@/lib/types";
import { categoryName } from "@/lib/category-names";
import { TOOLS } from "@/lib/tools";
import { Kbd, SearchShortcut } from "./kbd";
import { Price } from "./price";
import { NAV_SEGMENT } from "./ui";

const QUICK = [
  ["buty", "Buty"],
  ["koszulki", "Koszulki"],
  ["bluzy", "Bluzy"],
  ["kurtki", "Kurtki"],
  ["spodnie", "Spodnie"],
  ["akcesoria", "Akcesoria"],
  ["torby_i_plecaki", "Torby i plecaki"],
] as const;

export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      className={className}
    >
      <circle
        cx="11"
        cy="11"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 20l-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Wyszukiwarka w oknie (Ctrl/⌘ + K). Pokazuje 5 trafień na bieżąco, Enter otwiera pełne wyniki. */
export function SearchModal({
  variant = "bar",
}: {
  variant?: "bar" | "icon" | "hero";
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const open = useCallback(() => {
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }, []);

  useEffect(() => {
    if (variant !== "bar") return; // skrót obsługuje jedna instancja (pasek nawigacji)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, variant]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/products?${new URLSearchParams({ search: term, count: "5" })}`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            items: ProductCard[];
            total: number;
          };
          setItems(data.items);
          setTotal(data.total);
        }
      } catch {
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const close = () => closeDialog(dialog.current);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    close();
    router.push(`/products?search=${encodeURIComponent(term)}`);
  };

  const trigger =
    variant === "hero" ? (
      <button
        type="button"
        onClick={open}
        className="group relative flex w-full cursor-pointer items-center rounded-xl border border-white/[0.09] bg-[rgb(23_23_23/0.7)] py-3.5 pr-20 pl-11 text-left text-zinc-500 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_20px_50px_-30px_rgb(255_255_255/0.15)] backdrop-blur transition-all duration-200 hover:border-white/20 hover:text-zinc-300"
      >
        <SearchIcon className="absolute left-4 text-zinc-500 transition-colors group-hover:text-white" />
        <span className="truncate">Szukaj produktów albo wklej link...</span>
        {/* opakowanie steruje widocznością – SearchShortcut sam ma display: inline-flex */}
        <span className="absolute right-3 hidden sm:block">
          <SearchShortcut />
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={open}
        aria-label="Szukaj produktów"
        className={`group w-[34px] cursor-pointer justify-center gap-2.5 text-sm xl:w-56 xl:justify-start xl:pr-2.5 xl:pl-3 ${NAV_SEGMENT}`}
      >
        <SearchIcon className="shrink-0" />
        <span className="hidden flex-1 text-left xl:inline">Szukaj</span>
        <span className="hidden opacity-60 transition-opacity group-hover:opacity-100 xl:block">
          <SearchShortcut size="sm" />
        </span>
      </button>
    );

  return (
    <>
      {trigger}
      <dialog
        ref={dialog}
        className="modal top-[9vh] mt-0 max-w-[min(100vw-32px,640px)]"
        aria-label="Wyszukiwarka"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-[#0a0a0a]/95 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.05)] backdrop-blur-xl">
          <form onSubmit={submit} className="flex items-center gap-3 border-b border-neutral-800 px-5">
            <SearchIcon className="h-5 w-5 shrink-0 text-zinc-500" />
            <label htmlFor="szukaj-modal" className="sr-only">
              Szukaj produktu albo wklej link
            </label>
            <input
              ref={input}
              id="szukaj-modal"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={300}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              placeholder="Szukaj produktu albo wklej link…"
              className="h-16 min-w-0 flex-1 bg-transparent text-lg text-white outline-none placeholder:text-zinc-600 focus-visible:outline-none"
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-white">
                Wyczyść
              </button>
            ) : null}
            <button type="button" onClick={close} className="rounded-md border border-neutral-700 px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-white">
              Esc
            </button>
          </form>

          <div className="max-h-[min(62vh,560px)] overflow-y-auto p-2">
            {q.trim().length >= 2 ? (
              <div aria-live="polite">
                {items.length ? (
                  <>
                    <p className="px-3 pt-2 pb-1.5 text-xs text-zinc-500">
                      {total} {total === 1 ? "produkt" : "wyników"}
                    </p>
                    <ul>
                      {items.map((p) => {
                        const src = cdn(p.thumb);
                        return (
                          <li key={p.id}>
                            <Link
                              href={`/item/details/${p.id}`}
                              onClick={close}
                              className="group flex items-center gap-3.5 rounded-2xl p-2 transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
                            >
                              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {src ? <img src={src} alt="" width={56} height={56} className="h-full w-full object-cover" /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-semibold text-white">{p.title}</span>
                                <span className="mt-0.5 block text-xs text-zinc-500">{categoryName(p.category)}</span>
                              </span>
                              <Price cny={p.price} className="shrink-0 text-base font-bold text-white tabular" />
                              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-zinc-600 transition-all group-hover:translate-x-0.5 group-hover:text-white" aria-hidden>
                                <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                              </svg>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    {total > items.length ? (
                      <button
                        type="button"
                        onClick={submit}
                        className="mt-1 flex w-full items-center justify-between rounded-2xl px-3 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white"
                      >
                        Pokaż wszystkie wyniki
                        <span className="text-zinc-500 tabular">{total}</span>
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="px-4 py-10 text-center">
                    <p className="font-semibold text-white">{loading ? "Szukam…" : "Nic nie znaleźliśmy"}</p>
                    {loading ? null : <p className="mt-1 text-sm text-zinc-500">Spróbuj samej marki albo wklej link z Weidiana lub od agenta.</p>}
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="px-3 pt-2 pb-2 text-xs text-zinc-500">Szybko do kategorii</p>
                <ul className="flex flex-wrap gap-1.5 px-2 pb-3">
                  {QUICK.map(([slug, name]) => (
                    <li key={slug}>
                      <Link
                        href={`/products?category=${slug}`}
                        onClick={close}
                        className="inline-block rounded-full border border-neutral-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-neutral-600 hover:text-white"
                      >
                        {name}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="border-t border-neutral-800/80 px-3 pt-4 pb-2 text-xs text-zinc-500">Narzędzia</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {TOOLS.map((t) => (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        onClick={close}
                        className="group flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-neutral-800 bg-neutral-900 text-zinc-300 transition-colors group-hover:text-white">
                          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
                            <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className="text-sm font-semibold text-zinc-200 group-hover:text-white">{t.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-neutral-800 px-5 py-2.5 text-[11px] text-zinc-600">
            <span className="inline-flex items-center gap-1.5">
              <Kbd size="sm">Enter</Kbd>
              wszystkie wyniki
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd size="sm">Esc</Kbd>
              zamknij
            </span>
            <span className="ml-auto hidden sm:inline">Działa też z linkiem z Weidiana i od agenta</span>
          </div>
        </div>
      </dialog>
    </>
  );
}
