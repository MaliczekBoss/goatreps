import { cdn } from "@/lib/images";
import type { ProductCard } from "@/lib/types";
import { HoverLink } from "./hover-link";
import { Price } from "./price";

const POSE = [
  "fan-left z-10 -translate-x-[58%] translate-y-6 -rotate-[9deg] group-hover/fan:-translate-x-[78%] group-hover/fan:-rotate-[12deg]",
  "fan-mid z-20 -translate-y-2 group-hover/fan:-translate-y-5 group-hover/fan:scale-[1.03]",
  "fan-right z-10 translate-x-[58%] translate-y-6 rotate-[9deg] group-hover/fan:translate-x-[78%] group-hover/fan:rotate-[12deg]",
];

/** Trzy najnowsze findy rozłożone w wachlarz obok nagłówka – po najechaniu rozchodzą się na boki. */
export function ProductFan({ items }: { items: ProductCard[] }) {
  if (items.length < 3) return null;
  return (
    <div
      className="group/fan relative mx-auto hidden h-[440px] w-full max-w-[460px] lg:block"
      aria-label="Najnowsze findy"
    >
      <div
        className="absolute inset-x-10 bottom-6 h-24 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      {items.slice(0, 3).map((p, i) => {
        const src = cdn(p.thumb);
        return (
          <HoverLink
            key={p.id}
            href={`/item/details/${p.id}`}
            className={`fan-card absolute top-1/2 left-1/2 -mt-[190px] -ml-[115px] block w-[230px] rounded-[22px] border border-white/10 bg-[rgb(14_14_16/0.92)] p-2.5 shadow-[0_30px_70px_-25px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.06)] backdrop-blur transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:!z-30 hover:border-white/30 ${POSE[i]}`}
            style={{ "--d": i } as React.CSSProperties}
          >
            <span className="block aspect-square overflow-hidden rounded-2xl bg-white">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={p.title}
                  width={230}
                  height={230}
                  fetchPriority={i === 1 ? "high" : "auto"}
                  className="h-full w-full object-contain"
                />
              ) : null}
            </span>
            <span className="flex items-end justify-between gap-2 px-1 pt-3 pb-1">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-white">
                  {p.title}
                </span>
                <span className="text-xs text-green-400">
                  Quality: {p.quality}/10
                </span>
              </span>
              <Price
                cny={p.price}
                className="shrink-0 text-lg font-bold text-white tabular"
              />
            </span>
          </HoverLink>
        );
      })}
    </div>
  );
}
