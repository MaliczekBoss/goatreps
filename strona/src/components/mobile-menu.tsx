"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_BUTTON } from "./ui";

const LINKS = [
  { href: "/products", label: "Produkty" },
  { href: "/tools", label: "Narzędzia" },
  { href: "/link-converter", label: "Konwerter linków" },
  { href: "/qc-finder", label: "Zdjęcia QC" },
  { href: "/shipping", label: "Kalkulator wysyłki" },
  { href: "/tracking", label: "Śledzenie paczki" },
];

export function MobileMenu() {
  // menu zamyka się samo po przejściu na inną stronę: jest otwarte tylko dla adresu, na którym je otwarto
  const pathname = usePathname();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (fn: (v: boolean) => boolean) =>
    setOpenAt(fn(open) ? pathname : null);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-mobile"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
        className={NAV_BUTTON}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          {open ? (
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      {open ? (
        <ul
          id="menu-mobile"
          className="pop-in absolute top-full right-0 left-0 mt-2 origin-top rounded-2xl border border-border bg-[rgb(23_23_23/0.95)] p-2 backdrop-blur-xl"
        >
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="block rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
