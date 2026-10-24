"use client";

import { AGENTS } from "@/lib/settings";
import { AGENT_KEYS } from "@/lib/types";
import { AgentLogo } from "./agent-logo";
import { useSettings } from "./settings-provider";

/** Wybór agenta na stronie produktu: jeden rząd okrągłych logo, nazwa wybranego obok etykiety. */
export function AgentRow() {
  const { settings, update } = useSettings();
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-zinc-500">Kupujesz przez</span>
        <span className="font-semibold text-white">{AGENTS[settings.agent].name}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Wybierz agenta zakupowego">
        {AGENT_KEYS.map((key) => (
          <li key={key}>
            <button
              type="button"
              aria-pressed={settings.agent === key}
              aria-label={AGENTS[key].name}
              title={AGENTS[key].name}
              onClick={() => update({ agent: key })}
              className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-neutral-900 ring-1 ring-white/10 transition-all duration-200 hover:ring-white/30 aria-pressed:bg-neutral-800 aria-pressed:ring-2 aria-pressed:ring-white"
            >
              <AgentLogo agent={key} bare className="h-7 w-7" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
