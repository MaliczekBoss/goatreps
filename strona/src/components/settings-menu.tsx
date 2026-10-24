"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AGENTS, CURRENCIES } from "@/lib/settings";
import { AGENT_KEYS } from "@/lib/types";
import { rateNote } from "@/lib/money";
import { useSettings } from "./settings-provider";
import { AgentLogo } from "./agent-logo";
import { NAV_SEGMENT } from "./ui";


/** Waluta i agent – zapisywane w cookie, żeby ceny i linki były od razu dobre po odświeżeniu. */
export function SettingsMenu() {
  const { settings, update, rates } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Ustawienia: ${settings.currency}, ${AGENTS[settings.agent].name}`}
        onClick={() => setOpen((v) => !v)}
        className={`gap-2 pr-2 pl-1 text-sm ${NAV_SEGMENT}`}
      >
        <span className="grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-full bg-neutral-800 ring-1 ring-white/10">
          <AgentLogo agent={settings.agent} bare className="h-[18px] w-[18px]" />
        </span>
        <span className="hidden font-semibold text-zinc-200 tabular sm:inline">{settings.currency}</span>
        <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div
          id={id}
          className="pop-in absolute top-full right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-4 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(255_255_255/0.04)]"
        >
          <fieldset>
            <legend className="text-small font-semibold">Waluta</legend>
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-bg p-1">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={settings.currency === c}
                  onClick={() => update({ currency: c })}
                  className="rounded-lg py-1.5 text-small text-muted hover:text-fg aria-pressed:bg-fg aria-pressed:font-semibold aria-pressed:text-bg"
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-small font-semibold">Agent zakupowy</legend>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {AGENT_KEYS.map((a) => {
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={settings.agent === a}
                    onClick={() => update({ agent: a })}
                    className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-left text-small hover:border-border-strong aria-pressed:border-fg aria-pressed:bg-card-2 aria-pressed:font-semibold"
                  >
                    <AgentLogo agent={a} className="h-5 w-5" />
                    {AGENTS[a].name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-3 text-meta text-muted">
            Ceny w zł, € i $ przeliczamy {rateNote(rates)} – tak jak w kasie agenta. Agent doliczy swoją prowizję i wysyłkę.
          </p>
        </div>
      ) : null}
    </div>
  );
}
