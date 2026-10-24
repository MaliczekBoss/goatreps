import Link from "next/link";
import { AgentPicker } from "@/components/agent-picker";
import { ArrowUpRight, DiscordIcon } from "@/components/brand-icons";
import { CategoryStrip } from "@/components/category-strip";
import { FindsCarousel } from "@/components/finds-carousel";
import { HeroSticker } from "@/components/hero-sticker";
import { HomeStats } from "@/components/home-stats";
import { HowToBuy } from "@/components/how-to-buy";
import Magnet from "@/components/magnet";
import { ProductFan } from "@/components/product-fan";
import { ChevronRight, ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import { SearchModal } from "@/components/search-modal";
import { SOCIAL } from "@/lib/social";
import {
  bestBatch,
  countProducts,
  newest,
  newestInCategory,
} from "@/lib/catalog";
import { CATEGORY_NAMES } from "@/lib/category-names";
import { AGENT_KEYS } from "@/lib/types";
import { cdn } from "@/lib/images";

// Kolejność kategorii jak na starej stronie.
const STRIP = [
  "buty",
  "koszulki",
  "bluzy",
  "swetry",
  "kurtki",
  "sety",
  "spodnie",
  "spodenki",
  "longsleeve",
  "nakrycie_glowy",
  "okulary",
  "torby_i_plecaki",
  "paski",
  "elektronika",
  "akcesoria",
];

function Flame() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
      <path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Home() {
  const total = countProducts();
  const finds = newest(20);
  const fan = bestBatch(3);
  const fresh = finds.slice(0, 5);
  // ta sama karta może być na stronie kilka razy – przejście "zdjęcie → produkt" dostaje tylko pierwsza
  const named = new Set(fresh.map((p) => p.id));
  const rows = STRIP.map((slug) => ({
    slug,
    name: CATEGORY_NAMES[slug] ?? slug,
    items: newestInCategory(slug, 5),
  })).filter((r) => r.items.length);

  return (
    <>
      <div className="relative flex min-h-0 items-center px-2 pb-8 sm:min-h-[calc(98vh-6rem)] sm:px-6 sm:pb-12">
        <div
          className="hero-blobs pointer-events-none absolute inset-0 -top-24 overflow-hidden"
          aria-hidden
        >
          <div className="hero-glow absolute inset-0">
            <div className="absolute -top-10 left-0 h-[320px] w-[320px] rounded-full bg-white opacity-[0.07] blur-[140px]" />
            <div className="absolute top-1/4 right-10 h-[240px] w-[240px] rounded-full bg-white opacity-[0.05] blur-[130px]" />
            <div className="absolute top-1/2 left-1/3 h-[380px] w-[380px] rounded-full bg-white opacity-[0.03] blur-[180px]" />
            <div className="absolute bottom-10 left-10 h-[220px] w-[220px] rounded-full bg-white opacity-[0.05] blur-[120px]" />
            <div className="absolute right-0 bottom-0 h-[300px] w-[300px] rounded-full bg-white opacity-[0.04] blur-[160px]" />
          </div>
        </div>

        <div className="site-container relative w-full">
          <div className="relative mt-4 mb-10 grid grid-cols-1 items-center gap-10 sm:mt-10 sm:mb-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            {/* na dużym ekranie zamiast wyblakłego kozła jest naklejka, którą można odkleić */}
            <HeroSticker anchor="[data-sticker-anchor]" />
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cdn("b/goat.webp") ?? ""}
                alt=""
                width={96}
                height={96}
                className="float pointer-events-none absolute -top-10 -left-8 h-24 w-24 -rotate-[15deg] opacity-20 lg:hidden"
              />
              <div className="reveal-line">
                <a
                  href={SOCIAL.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative inline-flex items-center gap-2 rounded-full border border-[#5865f2]/30 bg-[#5865f2]/10 py-1 pr-3 pl-1 text-sm text-zinc-200 transition-colors hover:border-[#5865f2]/60 hover:bg-[#5865f2]/20"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#5865f2] text-white">
                    <DiscordIcon className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    Discord:{" "}
                    <span className="font-semibold text-white">4,5K</span>
                  </span>
                  <ArrowUpRight />
                </a>
              </div>
              <h1 className="relative z-10 mt-6 text-[2.75rem] leading-[1.02] font-bold tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">
                <span
                  className="reveal-line"
                  style={{ "--d": 1 } as React.CSSProperties}
                >
                  <span data-sticker-anchor>Znajdź więcej</span>
                </span>
                <span
                  className="reveal-line bg-gradient-to-r from-white via-zinc-300 to-zinc-600 bg-clip-text pb-1 text-transparent"
                  style={{ "--d": 2 } as React.CSSProperties}
                >
                  Szybciej i lepiej
                </span>
              </h1>
              <p
                className="reveal-line mt-5 max-w-[46ch] text-base text-zinc-400 sm:text-lg"
                style={{ "--d": 3 } as React.CSSProperties}
              >
                {new Intl.NumberFormat("pl-PL").format(total)} findów z Weidiana
                z ceną w złotówkach. Wybierz agenta, a linki dopasują się same.
              </p>
              <div
                className="reveal-line mt-7 max-w-xl"
                style={{ "--d": 4 } as React.CSSProperties}
              >
                <SearchModal variant="hero" />
              </div>
              <AgentPicker />
            </div>
            <ProductFan items={fan} />
          </div>

          <div className="mb-12">
            <HomeStats products={total} agents={AGENT_KEYS.length} categories={STRIP.length} />
          </div>

          <div className="mb-12">
            <CategoryStrip
              items={STRIP.map((slug) => ({
                slug,
                name: CATEGORY_NAMES[slug] ?? slug,
                image: `c/${slug}.webp`,
              }))}
            />
          </div>

          <Reveal as="section" className="mb-10 sm:mb-14">
            <div className="mb-6 flex flex-col justify-between gap-3 sm:mb-8 sm:flex-row sm:items-end sm:gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-white uppercase">
                  <Flame />
                  Popularne
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Ostatnie znaleziska
                </h2>
              </div>
              <Magnet padding={36} magnetStrength={4} maxOffset={8} wrapperClassName="shrink-0 self-start sm:self-auto">
                <Link
                  href="/products"
                  className="inline-flex shrink-0 items-center gap-1 self-start rounded-xl border border-border-strong bg-[rgb(23_23_23/0.8)] px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-neutral-600 hover:text-white sm:self-auto"
                >
                  Zobacz wszystko <ChevronRight className="h-4 w-4" />
                </Link>
              </Magnet>
            </div>
            <FindsCarousel items={finds} />
          </Reveal>

          <div className="mb-14">
            <HowToBuy />
          </div>

          <Reveal className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <Link
                href="/products"
                className="group flex flex-row items-center gap-2 text-2xl font-bold text-white hover:text-zinc-200"
              >
                Nowe produkty{" "}
                <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <ul className="products-grid">
              {fresh.map((p, i) => (
                <li key={p.id}>
                  <ProductCard product={p} priority={i < 2} />
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>

      <div className="pb-12">
        <div className="site-container">
          {rows.map((r) => (
            <Reveal key={r.slug} className="mb-12">
              <div className="mb-6 flex items-center justify-between">
                <Link
                  href={`/products?category=${encodeURIComponent(r.slug)}`}
                  className="group flex flex-row items-center gap-2 text-2xl font-bold text-white hover:text-zinc-200"
                >
                  Nowe {r.name}{" "}
                  <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <ul className="products-grid">
                {r.items.map((p) => {
                  const first = !named.has(p.id);
                  named.add(p.id);
                  return (
                    <li key={p.id}>
                      <ProductCard product={p} named={first} />
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
