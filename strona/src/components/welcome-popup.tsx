"use client";

import { useEffect, useRef, useState } from "react";
import { closeDialog } from "@/lib/dialog";
import { cdn } from "@/lib/images";
import { SOCIAL } from "@/lib/social";
import { KakoBuyMark } from "./brand-icons";
import { PROMO_EVENT } from "./promo-button";
import { FluxFill } from "./flux-fill";
import Magnet from "./magnet";

const KEY = "goatreps:powitanie";
const DELAY_MS = 1200;
const CODE = "Perkoz";

/**
 * Powitanie z ofertą KakoBuy – pokazuje się raz (do zamknięcia). Bez sztucznych liczników i "X osób ogląda",
 * które miała stara strona – to nieuczciwa praktyka rynkowa.
 */
export function WelcomePopup() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(KEY);
    } catch {}
    // przycisk oferty w pasku nawigacji otwiera to samo okno w każdej chwili
    const openNow = () => {
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    addEventListener(PROMO_EVENT, openNow);
    const t = seen ? undefined : setTimeout(openNow, DELAY_MS);
    return () => {
      clearTimeout(t);
      removeEventListener(PROMO_EVENT, openNow);
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {}
    closeDialog(dialog.current);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="powitanie-tytul"
      onCancel={(e) => {
        // Esc też zamyka z animacją
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="overflow-hidden rounded-3xl border border-neutral-800 bg-[#0a0a0a] shadow-[0_40px_100px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.05)]">
        <div className="relative overflow-hidden border-b border-neutral-800/80 px-6 pt-5 pb-7 sm:px-8">
          <FluxFill opacity={0.65} density={2.4} className="flux-fade-left" />
          <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-white opacity-[0.06] blur-3xl" aria-hidden />
          <div className="relative flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-800 bg-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cdn("b/goat.webp") ?? ""} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
              </span>
              <span className="text-zinc-600" aria-hidden>
                ×
              </span>
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-neutral-800 bg-neutral-900">
                <KakoBuyMark className="h-5 w-5" />
              </span>
              <span className="ml-1 text-sm font-semibold text-zinc-300">Goat Reps × KakoBuy</span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Zamknij"
              className="group/x grid h-9 w-9 place-items-center rounded-xl border border-neutral-800 bg-neutral-900/80 text-zinc-400 transition-[background-color,border-color,color,scale] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] outline-none hover:scale-105 hover:border-white hover:bg-white hover:text-black focus-visible:border-white active:scale-90 active:duration-100"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover/x:rotate-90" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <h2 id="powitanie-tytul" className="relative mt-6 text-[2.5rem] leading-[1.02] font-bold tracking-[-0.035em] text-white">
            −50% na shipping
            <span className="block bg-gradient-to-r from-zinc-300 to-zinc-600 bg-clip-text text-transparent">na pierwszą paczkę</span>
          </h2>
          <p className="relative mt-3 max-w-[42ch] text-sm text-zinc-400">
            Załóż konto KakoBuy przez nasz link – zniżka na wysyłkę naliczy się przy pierwszej paczce.
          </p>
        </div>

        <div className="px-6 pt-5 pb-6 sm:px-8">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/60 p-3 pl-4">
            <div>
              <p className="text-xs text-zinc-500">Kod polecający</p>
              <p className="text-2xl leading-tight font-bold tracking-wide text-white tabular">{CODE}</p>
            </div>
            <button
              type="button"
              onClick={copy}
              className="rounded-xl border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-neutral-500 hover:text-white"
            >
              {copied ? <span className="text-green-400">Skopiowano</span> : "Kopiuj kod"}
            </button>
          </div>

          <ul className="mt-5 space-y-2.5 text-sm text-zinc-300">
            {["Bonus powitalny na pierwszy haul.", "Zniżka −50% na wysyłkę pierwszej paczki.", "Wszystkie linki KakoBuy na Goat Reps mają już nasz kod."].map((t) => (
              <li key={t} className="flex gap-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-white" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>

          <Magnet padding={36} magnetStrength={5} maxOffset={8} wrapperClassName="mt-6" style={{ display: "block" }}>
            <a
              href={SOCIAL.kakobuy}
              target="_blank"
              rel="nofollow sponsored noopener noreferrer"
              onClick={close}
              className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98]"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0a0a0a]">
                <KakoBuyMark className="h-5 w-5" />
              </span>
              Zarejestruj się w KakoBuy
            </a>
          </Magnet>
          <button type="button" onClick={close} className="mt-2 w-full rounded-2xl py-2.5 text-sm text-zinc-500 transition-colors hover:text-white">
            Może później
          </button>
        </div>
      </div>
    </dialog>
  );
}
