"use client";

import { useCallback, useState } from "react";
import TrueFocus from "./true-focus";

const STEPS = [
  { word: "Znajdź", text: "Przeszukaj ponad 3 tysiące findów albo wklej link z Weidiana lub Taobao w wyszukiwarkę." },
  { word: "Sprawdź", text: "Obejrzyj zdjęcia QC, ocenę jakości i cenę w złotówkach, zanim cokolwiek kupisz." },
  { word: "Zamów", text: "„Kup na KakoBuy” otwiera produkt prosto u wybranego agenta – dodajesz do koszyka i płacisz." },
  { word: "Odbierz", text: "Agent sprawdza paczkę w magazynie i wysyła ją do Polski. Koszt wysyłki policzysz w kalkulatorze." },
];

/** Sekcja "Jak kupować": ramka TrueFocus przeskakuje po krokach, a pod spodem podświetla się opis bieżącego kroku. */
export function HowToBuy() {
  const [active, setActive] = useState(0);
  const onFocusChange = useCallback((i: number) => setActive(i), []);

  return (
    <section aria-labelledby="jak-kupowac" className="relative overflow-hidden rounded-[22px] border border-neutral-800/80 bg-neutral-950/60 px-5 py-10 sm:px-10 sm:py-14">
      <h2 id="jak-kupowac" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        Jak kupować
      </h2>
      <p className="mt-2 max-w-[52ch] text-zinc-400">Cztery kroki od znaleziska do paczki pod drzwiami.</p>

      <div className="mt-10 sm:mt-12" aria-hidden>
        <TrueFocus
          sentence={STEPS.map((s) => s.word).join(" ")}
          blurAmount={4}
          borderColor="#ffffff"
          glowColor="rgb(255 255 255 / 0.45)"
          animationDuration={0.55}
          pauseBetweenAnimations={1.9}
          cornerSize={14}
          borderWidth={2}
          unfocusedOpacity={0.35}
          className="justify-start gap-x-6 gap-y-5 sm:gap-x-10"
          wordClassName="text-[2.1rem] font-extrabold tracking-[-0.04em] text-white sm:text-5xl xl:text-6xl"
          onFocusChange={onFocusChange}
        />
      </div>

      <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-neutral-800/80 bg-neutral-800/80 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li
            key={s.word}
            aria-current={i === active ? "step" : undefined}
            className={`bg-[#0c0c0e] p-5 transition-colors duration-500 ${i === active ? "text-white" : "text-zinc-500"}`}
          >
            <p className="flex items-baseline gap-2 font-semibold">
              <span className={`tabular-nums transition-colors duration-500 ${i === active ? "text-white" : "text-zinc-600"}`}>{i + 1}.</span>
              {s.word}
            </p>
            <p className={`mt-2 text-sm leading-relaxed transition-colors duration-500 ${i === active ? "text-zinc-300" : "text-zinc-500"}`}>{s.text}</p>
            <span aria-hidden className="mt-4 block h-px overflow-hidden bg-neutral-800">
              <span
                className={`block h-full origin-left bg-white ${i === active ? "progress-step" : "scale-x-0"}`}
                style={{ animationDuration: "2.45s" }}
              />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
