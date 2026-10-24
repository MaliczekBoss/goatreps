"use client";

import { useState } from "react";
import { OUTBOUND_REL } from "@/lib/links";
import { AGENTS } from "@/lib/settings";
import type { AgentKey } from "@/lib/types";
import { AgentLogo } from "./agent-logo";
import Magnet from "./magnet";
import { useSettings } from "./settings-provider";

type Props = { agents: { key: AgentKey; url: string }[]; source: string | null; sticky?: boolean };

export function ExternalIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Jeden biały przycisk zakupu u wybranego agenta; oryginał i kopiowanie linku jako zwykłe linki pod spodem. */
export function BuyBox({ agents, source, sticky = false }: Props) {
  const { settings } = useSettings();
  const [copied, setCopied] = useState(false);
  const preferred = agents.find((a) => a.key === settings.agent) ?? agents[0];

  if (!preferred) return <p className="text-sm text-zinc-500">Ten produkt nie ma jeszcze linków do agentów.</p>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preferred.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const button = (
    <a
      href={preferred.url}
      target="_blank"
      rel={OUTBOUND_REL}
      className="group flex h-14 flex-1 items-center gap-3 rounded-2xl bg-white pr-5 pl-2 text-black transition-colors hover:bg-zinc-100"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0a0a0a]">
        <AgentLogo agent={preferred.key} bare className="h-7 w-7" />
      </span>
      <span className="flex-1 text-[15px] font-bold">Kup na {AGENTS[preferred.key].name}</span>
      <svg viewBox="0 0 24 24" className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );

  if (sticky) {
    return (
      <div className="flex gap-2">
        {button}
        {source ? (
          <a
            href={source}
            target="_blank"
            rel={OUTBOUND_REL}
            aria-label="Oryginalna aukcja"
            className="grid h-14 w-14 place-items-center rounded-2xl border border-neutral-800 text-zinc-300"
          >
            <ExternalIcon />
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <Magnet padding={44} magnetStrength={6} maxOffset={8} style={{ display: "block" }}>
        {button}
      </Magnet>
      <div className="mt-3 flex items-center gap-5 text-sm text-zinc-500">
        {source ? (
          <a href={source} target="_blank" rel={OUTBOUND_REL} className="inline-flex items-center gap-1.5 transition-colors hover:text-white">
            <ExternalIcon className="h-3.5 w-3.5" />
            Oryginalna aukcja
          </a>
        ) : null}
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 transition-colors hover:text-white">
          {copied ? (
            <span className="text-green-400">Skopiowano link</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              Kopiuj link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
