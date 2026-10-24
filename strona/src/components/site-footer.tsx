import Link from "next/link";
import { cdn } from "@/lib/images";
import { SOCIAL } from "@/lib/social";
import { TOOLS } from "@/lib/tools";
import { BackToTop } from "./back-to-top";
import { DiscordIcon, KakoBuyMark, TikTokIcon } from "./brand-icons";
import { FluxFill } from "./flux-fill";
import { FluxWordmark } from "./flux-wordmark";
import Magnet from "./magnet";

const COLUMNS = [
  {
    title: "Kategorie",
    links: [
      { href: "/products?category=buty", label: "Buty" },
      { href: "/products?category=koszulki", label: "Koszulki" },
      { href: "/products?category=bluzy", label: "Bluzy" },
      { href: "/products?category=kurtki", label: "Kurtki" },
      { href: "/products?category=spodnie", label: "Spodnie" },
      { href: "/products?category=akcesoria", label: "Akcesoria" },
    ],
  },
  {
    title: "Narzędzia",
    links: TOOLS.map((t) => ({ href: t.href, label: t.name })),
  },
  {
    title: "Na skróty",
    links: [
      { href: "/products", label: "Wszystkie produkty" },
      { href: "/products?tag=bestbatch", label: "Best batch" },
      { href: "/products?tag=budgetbatch", label: "Budget batch" },
      { href: "/products?sort=price_asc", label: "Najtańsze" },
    ],
  },
];

/** Stopka: karta społeczności, kolumny linków i wielki napis wypełniony poziomicami z tła. */
export function SiteFooter() {
  return (
    <footer className="relative mt-28 overflow-hidden border-t border-white/[0.06]">
      <div
        className="pointer-events-none absolute top-0 left-1/2 h-px w-[640px] max-w-full -translate-x-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        aria-hidden
      />

      <div className="site-container pt-14">
        {/* karta społeczności */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] sm:p-8">
          {/* te same płynące linie co tło strony, wygaszone od lewej, żeby nie wchodziły pod tekst */}
          <FluxFill opacity={0.6} density={2.6} className="flux-fade-left" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-lg">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Dołącz do ekipy Goat Reps
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Ponad 4,5 tysiąca osób na Discordzie. Nowe findy trafiają tam
                pierwsze, a przy QC i rozmiarach zawsze ktoś pomoże.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Magnet padding={40} magnetStrength={4} maxOffset={10}>
                <a
                  href={SOCIAL.discord}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#5865f2] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_#5865f2] transition-colors hover:bg-[#4752e0]"
                >
                  <DiscordIcon />
                  Dołącz na Discordzie
                </a>
              </Magnet>
              <Magnet padding={40} magnetStrength={4} maxOffset={10}>
                <a
                  href={SOCIAL.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-[0_10px_30px_-12px_rgb(255_255_255/0.7)] transition-colors hover:bg-zinc-100"
                >
                  <TikTokIcon />
                  TikTok
                </a>
              </Magnet>
              <Magnet padding={40} magnetStrength={4} maxOffset={10}>
                <a
                  href={SOCIAL.kakobuy}
                  target="_blank"
                  rel="nofollow sponsored noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#e7000b] py-2.5 pr-4 pl-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_#e7000b] transition-colors hover:bg-[#cc000a]"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-[#0a0a0a]">
                    <KakoBuyMark className="h-[18px] w-[18px]" />
                  </span>
                  Konto KakoBuy
                </a>
              </Magnet>
            </div>
          </div>
        </div>

        {/* kolumny */}
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <Link
              href="/"
              className="group inline-flex items-center gap-2.5"
              aria-label="Goat Reps – strona główna"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cdn("b/goat.webp") ?? ""}
                alt=""
                width={34}
                height={34}
                className="h-[34px] w-[34px] transition-transform duration-300 group-hover:-rotate-12"
              />
              <span className="text-lg font-bold tracking-tight text-white">
                Goat Reps
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              Findy z Weidiana z ceną w złotówkach i linkami do Twojego agenta.
              Nie sprzedajemy produktów – zamówienie składasz u agenta.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="mb-4 text-sm font-semibold text-zinc-200">
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="group inline-flex items-center text-sm text-zinc-500 transition-colors hover:text-white"
                    >
                      <span
                        className="h-px w-0 bg-white transition-all duration-200 group-hover:mr-1.5 group-hover:w-2.5"
                        aria-hidden
                      />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* wielki napis wypełniony tymi samymi płynącymi liniami co tło strony */}
      <div className="relative h-[clamp(4.5rem,13vw,11rem)] select-none" aria-hidden>
        <FluxWordmark
          text="GOAT REPS"
          className="pointer-events-none absolute inset-x-0 top-0 text-center text-[clamp(5rem,19vw,17rem)] leading-[0.8] font-black tracking-[-0.06em]"
        />
      </div>

      <div className="relative border-t border-white/[0.06]">
        <div className="site-container flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdn("b/goat.webp") ?? ""}
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px] opacity-70"
            />
            <span className="text-zinc-400">
              © {new Date().getFullYear()} Goat Reps
            </span>
            <span
              className="hidden h-3 w-px bg-white/10 sm:block"
              aria-hidden
            />
            <span>Ceny są orientacyjne – ostateczną kwotę podaje agent.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-500">
            <BackToTop />
            <a href="https://hypercode.cc" target="_blank" rel="noopener" className="group inline-flex items-center gap-1 transition-colors hover:text-white">
              Stworzone przez
              <span className="font-semibold text-zinc-300 underline decoration-zinc-700 underline-offset-4 transition-colors group-hover:text-white group-hover:decoration-white">
                hypercode.cc
              </span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
