"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { cdn, qcPreview } from "@/lib/images";
import DepthCarousel from "./depth-carousel";
import { NavArrow } from "./nav-arrow";

type Photo = { full: string; preview: string };
type Props = {
  productId: number;
  title: string;
  image: string | null;
  gallery: string[];
};

// na urządzeniach z kursorem strzałki wysuwają się z boków dopiero po najechaniu na zdjęcie (albo przy fokusie z klawiatury)
const REVEAL =
  "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:translate-x-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:pointer-events-auto [@media(hover:hover)]:focus-visible:translate-x-0 [@media(hover:hover)]:focus-visible:opacity-100";

/** Galeria jak na starej stronie: duże zdjęcie ze strzałkami i licznikiem, pasek miniatur, podgląd z powiększeniem. */
export function Gallery({ productId, title, image, gallery }: Props) {
  const photos: Photo[] = [];
  const main = cdn(image);
  if (main)
    photos.push({
      full: main,
      preview: cdn(image?.replace(/^i\//, "t/")) ?? main,
    });
  for (const g of gallery) {
    const full = cdn(g);
    const preview = cdn(qcPreview(g));
    if (full && preview) photos.push({ full, preview });
  }
  const count = photos.length;

  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const strip = useRef<HTMLUListElement>(null);
  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (i + delta + count) % count);
      setZoom(1);
    },
    [count],
  );

  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>(`[data-i="${index}"]`)
      ?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
  }, [index]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(5, z + 0.5));
      if (e.key === "-") setZoom((z) => Math.max(0.5, z - 0.5));
      if (e.key === "0") setZoom(1);
    };
    d.addEventListener("keydown", onKey);
    return () => d.removeEventListener("keydown", onKey);
  }, [go]);

  const current = photos[index];
  const roundBtn =
    "grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/75";

  return (
    <div className={count > 1 ? "lg:grid lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-3" : undefined}>
      <div className="group relative lg:order-2">
        {count > 1 ? (
          // kilka zdjęć: stos kart 3D – przeciąganie, strzałki, gest poziomy; klik w przednią kartę otwiera podgląd.
          // Przednie zdjęcie wypełnia ramkę, kolejne wystają równymi, przyciemnionymi krawędziami z prawej.
          <div className="relative aspect-square w-full">
            <DepthCarousel
              items={photos.map((p, i) => ({ image: p.full, alt: i === 0 ? title : `${title} – zdjęcie ${i + 1}` }))}
              index={index}
              onChange={(i) => {
                setIndex(i);
                setZoom(1);
              }}
              onActiveClick={() => dialog.current?.showModal()}
              transitionName={`produkt-${productId}`}
              label={`Zdjęcia: ${title}`}
              cardWidth={600}
              cardHeight={600}
              radius={20}
              tint="#09090b"
              depth={60}
              spread={26}
              tilt={4}
              perspective={1400}
              visibleCards={3}
              falloff={0.26}
              blur={0}
              duration={600}
              fit={12}
              showControls={false}
              showIndicators={false}
              className="min-h-0"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => count && dialog.current?.showModal()}
            disabled={!count}
            aria-label={count ? "Powiększ zdjęcie" : undefined}
            className="block aspect-square w-full overflow-hidden rounded-[24px] border border-neutral-800/90 bg-white"
          >
            <ViewTransition name={`produkt-${productId}`} share="morph" default="none">
              {current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={current.full}
                  src={current.full}
                  alt={title}
                  width={1400}
                  height={1400}
                  fetchPriority="high"
                  className="h-full w-full object-contain"
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                />
              ) : (
                <span className="grid h-full place-items-center bg-card-2 text-subtle">Brak zdjęcia</span>
              )}
            </ViewTransition>
          </button>
        )}
        {count > 1 ? (
          <>
            <NavArrow dir="left" label="Poprzednie zdjęcie" onClick={() => go(-1)} className={`absolute top-1/2 left-4 z-[3000] -translate-y-1/2 [@media(hover:hover)]:-translate-x-3 ${REVEAL}`} />
            <NavArrow dir="right" label="Następne zdjęcie" onClick={() => go(1)} className={`absolute top-1/2 right-4 z-[3000] -translate-y-1/2 [@media(hover:hover)]:translate-x-3 ${REVEAL}`} />
            <span className="absolute top-4 left-4 z-[3000] rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-xs font-semibold text-white tabular backdrop-blur-md">
              {index + 1}/{count}
            </span>
          </>
        ) : null}
        {count ? (
          <span className="pointer-events-none absolute right-4 bottom-4 z-[3000] flex items-center gap-1 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11px] text-white/85 opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100">
            <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
              <circle
                cx="11"
                cy="11"
                r="7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20l-3.5-3.5M11 8v6M8 11h6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Kliknij aby powiększyć
          </span>
        ) : null}
      </div>

      {count > 1 ? (
        <ul
          ref={strip}
          className="no-scrollbar mt-3 flex gap-2 overflow-x-auto lg:order-1 lg:mt-0 lg:h-0 lg:min-h-full lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
        >
          {photos.map((p, i) => (
            <li key={p.full} className="shrink-0" data-i={i}>
              <button
                type="button"
                onClick={() => {
                  setIndex(i);
                  setZoom(1);
                }}
                aria-label={`Zdjęcie ${i + 1} z ${count}`}
                aria-current={i === index || undefined}
                className="block h-16 w-16 overflow-hidden rounded-xl border-2 border-transparent bg-white opacity-55 transition-all duration-200 hover:opacity-100 aria-[current=true]:border-white aria-[current=true]:opacity-100 sm:h-[76px] sm:w-[76px] lg:h-[84px] lg:w-[84px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.preview}
                  alt=""
                  width={80}
                  height={80}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialog}
        className="lightbox"
        aria-label="Podgląd zdjęć"
        onClose={() => setZoom(1)}
      >
        {current ? (
          <div className="flex h-full flex-col text-white">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="text-sm tabular text-white/70">
                {index + 1} / {count}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
                  aria-label="Pomniejsz"
                  className={roundBtn}
                >
                  −
                </button>
                <span className="w-12 text-center text-xs tabular text-white/70">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(5, z + 0.5))}
                  aria-label="Powiększ"
                  className={roundBtn}
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => dialog.current?.close()}
                  className="ml-2 rounded-full border border-white/20 px-4 py-1.5 text-sm hover:bg-white hover:text-black"
                >
                  Zamknij
                </button>
              </div>
            </div>
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 sm:px-16"
              onClick={(e) =>
                e.target === e.currentTarget && dialog.current?.close()
              }
              onWheel={(e) =>
                setZoom((z) =>
                  Math.min(5, Math.max(0.5, z + (e.deltaY < 0 ? 0.25 : -0.25))),
                )
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={current.full}
                src={current.full}
                alt={title}
                className="lightbox-photo max-h-full max-w-full rounded-md object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
              {count > 1 ? (
                <>
                  <NavArrow dir="left" label="Poprzednie zdjęcie" onClick={() => go(-1)} className="absolute top-1/2 left-3 -translate-y-1/2" />
                  <NavArrow dir="right" label="Następne zdjęcie" onClick={() => go(1)} className="absolute top-1/2 right-3 -translate-y-1/2" />
                </>
              ) : null}
            </div>
            <div className="h-6" />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
