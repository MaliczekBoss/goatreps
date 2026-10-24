"use client";

import { KakoBuyMark } from "./brand-icons";
import Magnet from "./magnet";
import StarBorder from "./star-border";

export const PROMO_EVENT = "goatreps:promocja";

/** Stały "hook" w pasku: otwiera okno z ofertą KakoBuy (to samo, które wyskakuje przy pierwszej wizycie). */
export function PromoButton({ compact = false }: { compact?: boolean }) {
  return (
    <Magnet padding={22} magnetStrength={5} maxOffset={5}>
      <StarBorder
        onClick={() => dispatchEvent(new Event(PROMO_EVENT))}
        aria-label="Oferta KakoBuy: −50% na shipping"
        radius={12}
        thickness={1}
        duration={5}
        trailLength={0.35}
        glow={0.55}
        hover="lap"
        color="#ffffff"
        trailColor="#a1a1aa"
        backgroundColor="rgb(23 23 23 / 0.7)"
        borderColor="rgb(38 38 38)"
        textColor="#a1a1aa"
        className={`h-[38px] shrink-0 gap-2 text-sm font-normal transition-colors duration-200 hover:text-white active:scale-[0.97] ${compact ? "w-[38px] p-0" : "py-0 pr-3 pl-1.5"}`}
      >
        <span className="relative grid h-[26px] w-[26px] place-items-center rounded-[7px] bg-white/[0.06]">
          <KakoBuyMark className="h-[18px] w-[18px]" />
        </span>
        {compact ? null : (
          <span className="whitespace-nowrap">
            <span className="font-semibold text-white">−50%</span> shipping
          </span>
        )}
      </StarBorder>
    </Magnet>
  );
}
