import Link from "next/link";
import { logout, logoutEverywhere } from "./actions";

// Bez importów tylko-serwerowych – można go wstawić także w komponencie klienta (np. w panelu statystyk).

const BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-[12px] px-3 text-sm text-zinc-400 outline-none transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:bg-white/[0.07] focus-visible:text-white";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SHIELD = "M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z";
const SHIELD_OFF = "M3 3l18 18M8.5 4.5L12 3l7 3v5c0 1.4-.3 2.8-.8 4M5.6 6.2L5 6.5V11c0 4.5 3 8.3 7 10 1.8-.8 3.4-2 4.6-3.5";
const LOG_OUT = "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11";
const ARROW = "M7 17L17 7M9 7h8v8";

/** Pasek panelu: nazwa sekcji, podgląd strony, wylogowanie (tu i wszędzie). */
export function AdminHeader({ title = "Statystyki" }: { title?: string }) {
  return (
    <header className="mb-8 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/60 p-1.5 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:gap-3">
      <Link href="/admin/stats" className="flex items-center gap-2.5 rounded-[12px] py-1 pr-2 outline-none">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-white/10 bg-white/[0.04] text-white">
          <Icon d={SHIELD} />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold text-white">Panel admina</span>
          <span className="block text-xs text-zinc-500">{title}</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-0.5">
        <a href="/" target="_blank" rel="noopener noreferrer" className={`${BUTTON} hidden sm:inline-flex`}>
          Zobacz stronę
          <Icon d={ARROW} />
        </a>
        <form action={logoutEverywhere}>
          <button type="submit" title="Unieważnia sesje admina na wszystkich urządzeniach" className={BUTTON}>
            <Icon d={SHIELD_OFF} />
            <span className="hidden sm:inline">Wyloguj wszędzie</span>
            <span className="sr-only sm:hidden">Wyloguj wszędzie</span>
          </button>
        </form>
        <form action={logout}>
          <button type="submit" className={`${BUTTON} border border-white/10 bg-white/[0.03] text-zinc-200`}>
            <Icon d={LOG_OUT} />
            <span className="hidden sm:inline">Wyloguj</span>
            <span className="sr-only sm:hidden">Wyloguj</span>
          </button>
        </form>
      </div>
    </header>
  );
}
