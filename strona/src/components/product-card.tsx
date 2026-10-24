import { ViewTransition } from "react";
import { categoryName } from "@/lib/category-names";
import { cdn } from "@/lib/images";
import type { ProductCard as Card } from "@/lib/types";
import { FavoriteButton } from "./favorites";
import { HoloBackdrop, HoloCard } from "./holo-card";
import { HoverLink } from "./hover-link";
import { Price } from "./price";
import { TagStamp } from "./tag-stamp";

export function ChevronRight({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ocena jakości jako 10 kresek – szybciej czytelna niż sama liczba. */
export function QualityMeter({ quality, className = "" }: { quality: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={`Jakość ${quality}/10`}>
      <span className="flex gap-[2px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-2.5 w-[3px] rounded-full ${i < quality ? "bg-green-400" : "bg-white/15"}`} />
        ))}
      </span>
      <span className="text-[11px] font-semibold text-white tabular">{quality}/10</span>
    </span>
  );
}

/**
 * Okładka produktu jako holograficzna karta (styl ProfileCard z React Bits): zdjęcie w okienku,
 * pod nim nazwa na tle z folią prześwitującą przez wzór z logo kozła; karta przechyla się do kursora.
 */
export function ProductCard({ product, priority = false, named = true }: { product: Card; priority?: boolean; named?: boolean }) {
  const src = cdn(product.thumb);
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={product.title}
      width={480}
      height={480}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      // całe zdjęcie w okienku – buty (zwykle poziome) i spodnie (pionowe) nie są już ucinane
      className="relative h-full w-full object-contain"
    />
  ) : (
    <span className="grid h-full w-full place-items-center bg-neutral-900 text-xs text-zinc-500">Brak zdjęcia</span>
  );

  return (
    <article className="group relative h-full">
      <HoloCard className="h-full" bodyClassName="flex h-full flex-col p-2" holo={0.9}>
        <HoverLink href={`/item/details/${product.id}`} className="flex flex-1 flex-col rounded-[16px] outline-none">
          <div className="holo-card__tile relative flex flex-1 flex-col overflow-hidden rounded-[16px] p-3 pb-3.5">
            <HoloBackdrop />
            <div className="holo-card__photo relative aspect-square overflow-hidden rounded-[12px] bg-white shadow-[0_16px_32px_-14px_rgb(0_0_0/0.85)]">
              {src ? (
                // wolne miejsce przy zdjęciach, które nie są kwadratowe, wypełnia rozmyta kopia (ten sam plik z pamięci podręcznej)
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  aria-hidden
                  loading={priority ? "eager" : "lazy"}
                  decoding="async"
                  className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-xl saturate-150"
                />
              ) : null}
              {named ? (
                <ViewTransition name={`produkt-${product.id}`} share="morph" default="none">
                  {img}
                </ViewTransition>
              ) : (
                img
              )}
              <TagStamp tags={product.tags} className="absolute top-2 left-2" />
              <span className="absolute bottom-2 left-2 rounded-lg bg-black/70 px-2 py-1.5 backdrop-blur-md">
                <QualityMeter quality={product.quality} />
              </span>
            </div>
            <div className="relative mt-3 px-1">
              <p className="text-[11px] font-medium text-zinc-400">{categoryName(product.category)}</p>
              <h3 className="mt-0.5 line-clamp-2 min-h-[2.5em] text-sm leading-snug font-semibold text-white">{product.title}</h3>
            </div>
            <span className="holo-card__tile-rim" aria-hidden />
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pt-2.5 pb-1">
            <div className="min-w-0 leading-none">
              <Price cny={product.price} className="block text-xl font-bold tracking-tight text-white tabular" />
              <span className="mt-1 block text-[11px] text-zinc-500 tabular">¥{Math.round(product.price)}</span>
            </div>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform duration-300 group-hover:-rotate-45"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4">
                <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </HoverLink>
        <FavoriteButton product={product} className="absolute top-7 right-7 z-10" />
      </HoloCard>
    </article>
  );
}
