"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const SIZES = {
  sm: "h-5 min-w-5 rounded-[5px] px-1 text-[10px]",
  md: "h-[22px] min-w-[22px] rounded-[6px] px-1.5 text-[11px]",
} as const;

/** Klawisz jak mały kapsel: jasna górna krawędź, ciemniejszy spód – ten sam wygląd w całej stronie. */
export function Kbd({ children, size = "md", className = "" }: { children: ReactNode; size?: keyof typeof SIZES; className?: string }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center border border-white/[0.12] bg-gradient-to-b from-white/[0.09] to-white/[0.02] font-sans leading-none font-semibold text-zinc-300 shadow-[inset_0_-1.5px_0_rgb(255_255_255/0.07),0_1px_2px_rgb(0_0_0/0.5)] ${SIZES[size]} ${className}`}
    >
      {children}
    </kbd>
  );
}

/** Ikona klawisza Command – rysowana, bo znak ⌘ z fontu na Windowsie wygląda krzywo. */
function CommandIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M9 6v12M15 6v12M6 9h12M6 15h12M9 9H6a3 3 0 1 1 3-3v3zm6 0h3a3 3 0 1 0-3-3v3zM9 15H6a3 3 0 1 0 3 3v-3zm6 0h3a3 3 0 1 1-3 3v-3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const subscribe = () => () => {};
const isMac = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent);
};

/** Skrót wyszukiwarki: ⌘ K na Macu, Ctrl K wszędzie indziej (na serwerze – Ctrl, większość odwiedzających ma Windowsa). */
export function SearchShortcut({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const mac = useSyncExternalStore(subscribe, isMac, () => false);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={mac ? "Command K" : "Control K"}>
      <Kbd size={size}>{mac ? <CommandIcon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} /> : "Ctrl"}</Kbd>
      <Kbd size={size}>K</Kbd>
    </span>
  );
}
