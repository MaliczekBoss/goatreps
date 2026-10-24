"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

/** Pasek w stylu kart produktów; po przewinięciu gęstnieje i lekko się zwęża. */
export function NavShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useLayoutEffect(() => {
    const on = () => setScrolled(scrollY > 16);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return (
    <div
      data-scrolled={scrolled || undefined}
      className="site-container relative flex items-center gap-2 rounded-[20px] border border-neutral-800/90 bg-[rgb(10_10_10/0.7)] py-2 pr-2 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_24px_60px_-30px_rgb(0_0_0/0.95)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,padding,max-width,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[scrolled]:max-w-[74rem] data-[scrolled]:border-neutral-700/70 data-[scrolled]:bg-[rgb(10_10_10/0.88)] data-[scrolled]:py-1.5 data-[scrolled]:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_18px_50px_-20px_rgb(0_0_0/1)] sm:pl-4"
    >
      {/* cienka poświata na górnej krawędzi */}
      <span
        className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-white/30 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  );
}

const LINKS = [
  {
    href: "/products",
    label: "Produkty",
    match: (p: string) => p.startsWith("/products") || p.startsWith("/item"),
  },
  {
    href: "/tools",
    label: "Narzędzia",
    match: (p: string) =>
      ["/tools", "/link-converter", "/qc-finder", "/shipping", "/tracking"].some((x) =>
        p.startsWith(x),
      ),
  },
  {
    href: "/link-converter",
    label: "Konwerter",
    match: () => false,
  },
];

/**
 * Linki z przesuwającym się podświetleniem: jedzie za kursorem i wraca na aktywną stronę.
 * Bez JS linki działają normalnie, tylko bez animacji.
 */
export function NavLinks() {
  const pathname = usePathname();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const active = LINKS.findIndex((l) => l.match(pathname));
  const target = hover ?? (active >= 0 ? active : null);

  useLayoutEffect(() => {
    const el = target == null ? null : refs.current[target];
    // pomiar położenia linku po wyrenderowaniu – świadome ustawienie stanu z pomiaru układu
    setBox(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [target, pathname]);

  return (
    <ul className="relative hidden items-center md:flex" onMouseLeave={() => setHover(null)}>
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 h-full rounded-xl border border-white/[0.12] bg-white/[0.07] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          left: box?.left ?? 0,
          width: box?.width ?? 0,
          opacity: box ? 1 : 0,
        }}
      />
      {LINKS.map((l, i) => (
        <li key={l.href}>
          <Link
            ref={(el) => {
              refs.current[i] = el;
            }}
            href={l.href}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-current={i === active ? "page" : undefined}
            className="relative block rounded-xl px-3.5 py-2 text-sm text-zinc-400 transition-colors duration-200 hover:text-white aria-[current=page]:text-white"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
