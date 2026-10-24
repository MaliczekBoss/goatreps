"use client";

import { useState } from "react";
import { cdn } from "@/lib/images";
import { AGENTS } from "@/lib/settings";
import type { AgentKey } from "@/lib/types";

// Kolorowe logo pobrane z oficjalnych stron (CNFans i MuleBuy nie udostępniają logo – dostają literę).
const HAS_LOGO = new Set<AgentKey>(["kakobuy", "usfans", "allchinabuy", "acbuy", "litbuy", "oopbuy"]);

/** Kolorowe logo agenta z CDN (a/<agent>-mark.webp). Gdy pliku brak – pierwsza litera nazwy. */
export function AgentLogo({ agent, className = "h-6 w-6", bare = false }: { agent: AgentKey; className?: string; bare?: boolean }) {
  const [failed, setFailed] = useState(false);
  // KakoBuy: logo z napisem ze starej strony (znak "k" wyglądał za duży)
  const src = !HAS_LOGO.has(agent) ? null : cdn(agent === "kakobuy" ? "a/kakobuy-napis.webp" : `a/${agent}-mark.webp`);
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden ${bare ? "" : "rounded-[7px] bg-white/[0.06]"} ${className}`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={32} height={32} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : (
        <span className="text-[11px] font-bold text-zinc-300">{AGENTS[agent].name[0]}</span>
      )}
    </span>
  );
}
