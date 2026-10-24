"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCard as Card } from "@/lib/types";
import { NavArrow } from "./nav-arrow";
import { ProductCard } from "./product-card";

const INTERVAL_MS = 4500;

/**
 * "Ostatnie znaleziska": zapętlona karuzela – 5 kart na komputerze (środkowa powiększona, boczne przygaszone), 1 na telefonie.
 * Każda karta stoi według odległości od środka liczonej w kółko, więc po obu stronach zawsze są sąsiednie produkty.
 * Przewija się sama co 4,5 s, stoi po najechaniu i przy fokusie, a przy "ogranicz ruch" tylko na kliknięcie.
 */
export function FindsCarousel({ items }: { items: Card[] }) {
  const [index, setIndex] = useState(0);
  const [mobile, setMobile] = useState(false);
  const paused = useRef(false);
  const count = items.length;

  useEffect(() => {
    const mq = matchMedia("(max-width: 639px)");
    const set = () => setMobile(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => !paused.current && !document.hidden && go(1), INTERVAL_MS);
    return () => clearInterval(t);
  }, [go, count]);

  if (!count) return null;
  const visible = mobile ? 1 : 5;
  const reach = mobile ? 0 : 2;

  return (
    <div
      className="relative overflow-hidden py-6 sm:py-10"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocusCapture={() => (paused.current = true)}
      onBlurCapture={() => (paused.current = false)}
      aria-roledescription="karuzela"
      aria-label="Ostatnie znaleziska"
    >
      <div className="relative mx-14 sm:mx-16">
        {/* niewidoczna karta ustala wysokość karuzeli (karty właściwe są pozycjonowane absolutnie) */}
        <div className="invisible mx-auto max-w-[220px]" aria-hidden inert>
          <ProductCard product={items[index]} named={false} />
        </div>
        <ul>
          {items.map((p, i) => {
            // odległość od środka w kółko: -count/2 … count/2
            let d = (i - index + count) % count;
            if (d > count / 2) d -= count;
            const center = d === 0;
            const near = Math.abs(d) <= reach;
            // karty przeskakujące z jednego końca na drugi są niewidoczne, więc ich przelot nie razi
            const shown = Math.abs(d) <= reach + 1;
            return (
              <li
                key={p.id}
                className="absolute top-0 w-full max-w-[220px] transition-[left,scale,opacity] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                style={{
                  left: `calc(50% + ${d} * (100% / ${visible}))`,
                  translate: "-50% 0",
                  scale: center ? (mobile ? "1" : "1.12") : "0.92",
                  opacity: !shown ? 0 : center ? 1 : near ? 0.5 : 0,
                  zIndex: center ? 10 : 5 - Math.abs(d),
                  pointerEvents: near ? undefined : "none",
                }}
                aria-hidden={!near || undefined}
                inert={!near || undefined}
              >
                <ProductCard product={p} named={false} />
              </li>
            );
          })}
        </ul>
      </div>
      <NavArrow dir="left" label="Poprzedni produkt" onClick={() => go(-1)} className="absolute top-1/2 left-1 z-20 -translate-y-1/2" />
      <NavArrow dir="right" label="Następny produkt" onClick={() => go(1)} className="absolute top-1/2 right-1 z-20 -translate-y-1/2" />
    </div>
  );
}
