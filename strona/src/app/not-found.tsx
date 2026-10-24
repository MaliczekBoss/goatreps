import Link from "next/link";
import FuzzyText from "@/components/fuzzy-text";
import Magnet from "@/components/magnet";
import { StarLink } from "@/components/star-link";

export default function NotFound() {
  return (
    <div className="site-container flex flex-col items-center px-4 pt-10 pb-24 text-center sm:pt-16">
      <FuzzyText fontSize="clamp(6rem, 24vw, 13rem)" fontWeight={900} color="#fafafa" baseIntensity={0.16} hoverIntensity={0.5} enableHover>
        404
      </FuzzyText>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">Tej strony nie ma</h1>
      <p className="mt-3 max-w-[44ch] text-zinc-400">
        Produkt mógł zostać usunięty albo link jest niepełny. Wyszukaj go po nazwie albo wklej link z Weidiana w wyszukiwarkę.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Magnet padding={40} magnetStrength={4} maxOffset={10}>
          <StarLink href="/products" radius={14} backgroundColor="#fafafa" textColor="#0a0a0a" color="#ffffff" glow={0.7} className="h-11 px-5 py-0 text-sm font-semibold">
            Przeglądaj produkty
          </StarLink>
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
