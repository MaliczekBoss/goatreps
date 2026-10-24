"use client";

import Link from "next/link";
import FuzzyText from "@/components/fuzzy-text";
import Magnet from "@/components/magnet";
import StarBorder from "@/components/star-border";

// Nie pokazujemy szczegółów błędu – trafiają tylko do logów serwera.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="site-container flex flex-col items-center px-4 pt-10 pb-24 text-center sm:pt-16">
      <FuzzyText fontSize="clamp(5rem, 20vw, 11rem)" fontWeight={900} color="#fafafa" baseIntensity={0.22} hoverIntensity={0.55} enableHover>
        Błąd
      </FuzzyText>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">Strona się nie wczytała</h1>
      <p className="mt-3 max-w-[44ch] text-zinc-400">
        Wystąpił błąd po naszej stronie. Spróbuj jeszcze raz – jeśli to się powtarza, daj znać na Discordzie.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Magnet padding={40} magnetStrength={4} maxOffset={10}>
          <StarBorder onClick={reset} radius={14} backgroundColor="#fafafa" textColor="#0a0a0a" color="#ffffff" glow={0.7} className="h-11 px-5 py-0 text-sm font-semibold">
            Spróbuj ponownie
          </StarBorder>
        </Magnet>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[14px] border border-neutral-800 bg-neutral-900/70 px-5 text-sm font-medium text-zinc-300 transition-colors hover:border-neutral-600 hover:text-white"
        >
          Strona główna
        </Link>
      </div>
    </div>
  );
}
