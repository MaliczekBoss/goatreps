/** Wspólny wygląd samodzielnych kontrolek (przycisk oferty, menu, zamykanie okien). */
export const NAV_CONTROL =
  "rounded-xl border border-neutral-800 bg-neutral-900/70 text-zinc-400 outline-none transition-all duration-200 hover:border-neutral-600 hover:bg-neutral-800/70 hover:text-white active:scale-[0.97]";

/** Kwadratowy samodzielny przycisk (menu, zamknij). */
export const NAV_BUTTON = `relative grid h-[38px] w-[38px] place-items-center ${NAV_CONTROL}`;

/** Segment wspólnego panelu akcji w pasku (wyszukiwarka, ulubione, agent) – bez własnej ramki. */
export const NAV_SEGMENT =
  "relative flex h-[34px] items-center rounded-[10px] text-zinc-400 outline-none transition-colors duration-200 hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] aria-expanded:bg-white/[0.07] aria-expanded:text-white";
