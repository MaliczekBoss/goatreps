import Link from "next/link";
import { cdn } from "@/lib/images";
import { FavoritesDrawer } from "./favorites-drawer";
import { MobileMenu } from "./mobile-menu";
import { NavLinks, NavShell } from "./nav-shell";
import { PromoButton } from "./promo-button";
import { SearchModal } from "./search-modal";
import { SettingsMenu } from "./settings-menu";

export function Logo() {
  return (
    <Link
      href="/"
      className="group flex shrink-0 items-center gap-2 rounded-xl py-1 pr-1 sm:gap-2.5"
      aria-label="Goat Reps – strona główna"
    >
      <span className="relative grid h-9 w-9 place-items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cdn("b/goat.webp") ?? ""}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 transition-transform duration-300 ease-out group-hover:-rotate-12 group-hover:scale-110"
        />
      </span>
      <span className="hidden flex-col leading-none min-[420px]:flex">
        <span className="text-[15px] font-bold tracking-tight text-white">Goat Reps</span>
        <span className="mt-1 text-[10px] font-medium text-zinc-500">findy z KakoBuy</span>
      </span>
    </Link>
  );
}

/** Pasek nawigacji: logo i linki po lewej, oferta, wyszukiwarka, ulubione i agent po prawej. */
export function SiteHeader() {
  return (
    <nav aria-label="Główna" className="fixed top-2 z-40 w-full px-2 sm:top-4 sm:px-4">
      <NavShell>
        <Logo />
        <span className="mx-2 hidden h-6 w-px bg-neutral-800 md:block" aria-hidden />
        <NavLinks />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <div className="hidden lg:block">
            <PromoButton />
          </div>
          <div className="lg:hidden">
            <PromoButton compact />
          </div>
          <div className="flex items-center gap-0.5 rounded-[14px] border border-neutral-800 bg-neutral-900/60 p-[3px] shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
            <SearchModal />
            <span className="h-4 w-px bg-neutral-800" aria-hidden />
            <FavoritesDrawer />
            <span className="h-4 w-px bg-neutral-800" aria-hidden />
            <SettingsMenu />
          </div>
          <MobileMenu />
        </div>
      </NavShell>
    </nav>
  );
}
