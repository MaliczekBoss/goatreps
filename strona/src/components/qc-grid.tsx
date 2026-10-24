"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cdn } from "@/lib/images";

/** Siatka zdjęć QC z magazynu (z naszego CDN). Kliknięcie otwiera podgląd ze strzałkami i Esc. */
export function QcGrid({ photos, title }: { photos: string[]; title: string }) {
  const items = photos
    .map((h) => ({ full: cdn(`q/${h}.webp`), preview: cdn(`p/${h}.webp`) }))
    .filter((x): x is { full: string; preview: string } => !!x.full && !!x.preview);
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const count = items.length;
  const go = useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [go]);

  if (!count) return null;
  const btn = "grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur hover:bg-black/80";

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((p, i) => (
          <li key={p.full}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                dialog.current?.showModal();
              }}
              aria-label={`Zdjęcie QC ${i + 1} z ${count}`}
              className="group block aspect-square w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.preview}
                alt=""
                width={360}
                height={360}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className="lightbox" aria-label="Zdjęcia QC">
        <div className="flex h-full flex-col text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/70 tabular">
              QC {index + 1} / {count}
            </span>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white hover:text-black">
              Zamknij
            </button>
          </div>
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16"
            onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={items[index].full} src={items[index].full} alt={`${title} – zdjęcie QC ${index + 1}`} className="lightbox-photo max-h-full max-w-full rounded-md object-contain" />
            {count > 1 ? (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Poprzednie zdjęcie" className={`${btn} absolute top-1/2 left-3 -translate-y-1/2`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                    <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Następne zdjęcie" className={`${btn} absolute top-1/2 right-3 -translate-y-1/2`}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </button>
              </>
            ) : null}
          </div>
          <div className="h-6" />
        </div>
      </dialog>
    </>
  );
}
