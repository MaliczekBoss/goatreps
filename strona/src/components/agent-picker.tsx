"use client";

import { AGENTS } from "@/lib/settings";
import { AGENT_KEYS } from "@/lib/types";
import { AgentLogo } from "./agent-logo";
import { useSettings } from "./settings-provider";

/**
 * Wybór agenta – kolorowe logo, kliknięcie od razu zmienia linki "Kup na …" na całej stronie.
 * "hero": przewijany rząd na stronie głównej, "panel": siatka w panelu zakupu na stronie produktu.
 */
export function AgentPicker({ variant = "hero" }: { variant?: "hero" | "panel" }) {
  const { settings, update } = useSettings();
  const panel = variant === "panel";
  return (
    <div className={panel ? "" : "mt-6"}>
      <p className="mb-2.5 text-xs font-medium text-zinc-500">Kupujesz przez</p>
      <ul
        className={panel ? "grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-3" : "no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"}
        aria-label="Wybierz agenta zakupowego"
      >
        {AGENT_KEYS.map((key, i) => {
          const on = settings.agent === key;
          return (
            <li key={key} className={panel ? "" : "cat-in shrink-0"} style={panel ? undefined : ({ "--d": i + 4 } as React.CSSProperties)}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => update({ agent: key })}
                className={`group flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition-all duration-200 hover:border-white/20 hover:text-white aria-pressed:border-white/40 aria-pressed:bg-white/[0.08] aria-pressed:text-white ${
                  panel ? "py-1.5 pr-2 pl-1.5 text-[13px]" : "py-1.5 pr-3 pl-1.5 text-sm aria-pressed:shadow-[0_0_24px_-6px_rgb(255_255_255/0.25)]"
                }`}
              >
                <AgentLogo agent={key} className={`${panel ? "h-6 w-6" : "h-7 w-7"} transition-transform duration-200 group-hover:scale-110`} />
                <span className="truncate">{AGENTS[key].name}</span>
                {on ? (
                  <svg viewBox="0 0 24 24" className="pop-in ml-auto h-3.5 w-3.5 shrink-0 text-green-400" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
