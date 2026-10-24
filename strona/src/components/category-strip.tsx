"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cdn } from "@/lib/images";

type Item = { slug: string; name: string; image: string | null };

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Okrągłe ikony kategorii przewijane poziomo – strzałki, kółko myszy i przeciąganie, jak na starej stronie. */
export function CategoryStrip({ items }: { items: Item[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft < 8,
      end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (
        Math.abs(e.deltaY) > Math.abs(e.deltaX) &&
        el.scrollWidth > el.clientWidth
      ) {
        const atEdge =
          (e.deltaY < 0 && el.scrollLeft <= 0) ||
          (e.deltaY > 0 &&
            el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
        if (!atEdge) {
          e.preventDefault();
          el.scrollBy({ left: e.deltaY });
        }
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    addEventListener("resize", update);
    return () => {
      el.removeEventListener("wheel", onWheel);
      removeEventListener("resize", update);
    };
  }, [update]);

  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * 360, behavior: "smooth" });
  const edgeBtn =
    "absolute top-[40%] -translate-y-1/2 rounded-full border border-white/10 bg-[rgb(23_23_23/0.85)] p-2 text-zinc-300 shadow-lg backdrop-blur transition-colors hover:border-white/25 hover:text-white";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Przewiń kategorie w lewo"
        tabIndex={edges.start ? -1 : 0}
        className={`${edgeBtn} left-1 z-10 transition-opacity duration-300 ${edges.start ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <Arrow dir="left" />
      </button>
      <ul
        ref={ref}
        onScroll={update}
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || !ref.current) return;
          drag.current = {
            x: e.clientX,
            left: ref.current.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !ref.current) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) d.moved = true;
          ref.current.scrollLeft = d.left - dx;
        }}
        onPointerUp={() => setTimeout(() => (drag.current = null))}
        onPointerLeave={() => (drag.current = null)}
        onClickCapture={(e) => {
          if (drag.current?.moved) e.preventDefault();
        }}
        style={{
          maskImage: `linear-gradient(90deg, ${edges.start ? "#000" : "transparent"}, #000 ${edges.start ? "0" : "96px"}, #000 calc(100% - ${edges.end ? "0px" : "120px"}), ${edges.end ? "#000" : "transparent"})`,
        }}
        className="no-scrollbar flex items-center gap-4 overflow-x-auto pb-4 select-none"
      >
        {items.map((c, i) => {
          const src = cdn(c.image);
          return (
            <li
              key={c.slug}
              className="cat-in shrink-0 last:mr-12"
              style={{ "--d": i } as React.CSSProperties}
            >
              <Link
                href={`/products?category=${encodeURIComponent(c.slug)}`}
                draggable={false}
                className="group flex min-w-[90px] flex-col items-center gap-2.5"
              >
                <span className="relative h-20 w-20 overflow-hidden rounded-xl">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt=""
                      width={80}
                      height={80}
                      draggable={false}
                      className="pointer-events-none h-full w-full object-contain transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-105"
                    />
                  ) : null}
                </span>
                <span className="text-center text-xs font-semibold text-white/70 duration-150 ease-in-out group-hover:text-white">
                  {c.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Przewiń kategorie w prawo"
        tabIndex={edges.end ? -1 : 0}
        className={`${edgeBtn} right-1 z-10 transition-opacity duration-300 ${edges.end ? "pointer-events-none opacity-0" : "opacity-100"}`}
      >
        <Arrow dir="right" />
      </button>
    </div>
  );
}
