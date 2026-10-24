"use client";

import Link from "next/link";
import { useRef } from "react";
import { categoryName } from "@/lib/category-names";
import { cdn } from "@/lib/images";
import { formatPrice } from "@/lib/money";
import { HeartIcon, useFavorites } from "./favorites";
import { Price } from "./price";
import { useSettings } from "./settings-provider";
import { NAV_BUTTON, NAV_SEGMENT } from "./ui";

/** Ulubione: lista zapisanych produktów z sumą cen (do planowania haula). Dane tylko w tej przeglądarce. */
export function FavoritesDrawer() {
  const { items, remove, clear } = useFavorites();
  const { settings, rates } = useSettings();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  const sum = items.reduce((s, p) => s + p.price, 0);

  const clearAll = () => {
    if (confirm("Usunąć wszystkie produkty z ulubionych?")) clear();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Ulubione (${items.length})`}
        className={`gap-1.5 px-2.5 text-sm ${NAV_SEGMENT}`}
      >
        <HeartIcon filled={items.length > 0} className={items.length ? "text-white" : ""} />
        {items.length ? <span className="font-semibold text-white tabular">{items.length > 99 ? "99+" : items.length}</span> : null}
      </button>
      <dialog ref={dialog} className="drawer" aria-label="Ulubione" onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="flex h-full flex-col bg-[#0a0a0a]">
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                Ulubione <span className="text-zinc-600 tabular">{items.length}</span>
              </h2>
              <p className="mt-1 text-sm text-zinc-500">Zapisane w tej przeglądarce</p>
            </div>
            <button type="button" onClick={close} aria-label="Zamknij" className={NAV_BUTTON}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          {items.length ? (
            <>
              <ul className="flex-1 divide-y divide-neutral-800/70 overflow-y-auto border-t border-neutral-800 px-3">
                {items.map((p) => {
                  const src = cdn(p.thumb);
                  return (
                    <li key={p.id} className="group flex items-center gap-4 px-3 py-3.5">
                      <Link href={`/item/details/${p.id}`} onClick={close} className="flex min-w-0 flex-1 items-center gap-4">
                        <span className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {src ? <img src={src} alt="" width={72} height={72} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs text-zinc-500">{categoryName(p.category)}</span>
                          <span className="mt-0.5 line-clamp-2 text-sm leading-snug font-semibold text-white group-hover:underline group-hover:decoration-zinc-600 group-hover:underline-offset-4">
                            {p.title}
                          </span>
                          <Price cny={p.price} className="mt-1 block text-base font-bold text-white tabular" />
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        aria-label={`Usuń ${p.title} z ulubionych`}
                        title="Usuń z ulubionych"
                        className="shrink-0 rounded-full p-2 text-zinc-600 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <footer className="border-t border-neutral-800 px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-500">Razem bez wysyłki</span>
                  <span className="text-2xl font-bold tracking-tight text-white tabular">{formatPrice(sum, settings.currency, rates)}</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm">
                  <button type="button" onClick={clearAll} className="text-zinc-500 transition-colors hover:text-white">
                    Wyczyść listę
                  </button>
                  <Link href="/shipping" onClick={close} className="font-semibold text-white underline decoration-zinc-700 underline-offset-4 hover:decoration-white">
                    Policz wysyłkę
                  </Link>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-neutral-800 px-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full border border-neutral-800 text-zinc-500">
                <HeartIcon className="h-6 w-6" />
              </span>
              <p className="text-lg font-semibold text-white">Nic tu jeszcze nie ma</p>
              <p className="text-sm text-zinc-500">Kliknij serce na zdjęciu produktu, a zapiszemy go tutaj razem z ceną.</p>
              <Link href="/products" onClick={close} className="mt-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black hover:bg-zinc-100">
                Przeglądaj produkty
              </Link>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
