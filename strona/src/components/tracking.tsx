"use client";

import { useState } from "react";

// Formaty numerów przesyłek (te same co na starej stronie).
const PATTERNS = [
  /^[A-Z]{2}\d{9}[A-Z]{2}$/,
  /^[A-Z]{2,5}\d{8,20}$/,
  /^\d{10,22}$/,
  /^[A-Z]{2,6}\d{6,18}[A-Z]{0,4}$/,
];

type Tracker = {
  name: string;
  description: string;
  url: (n: string) => string;
};

const TRACKERS: Tracker[] = [
  {
    name: "17TRACK",
    description: "Większość przewoźników z Chin i linie agentów",
    url: (n) => `https://t.17track.net/pl#nums=${n}`,
  },
  {
    name: "Parcels",
    description: "Śledzi paczkę też po przekazaniu krajowemu kurierowi",
    url: (n) => `https://parcelsapp.com/pl/tracking/${n}`,
  },
  {
    name: "Poczta Polska",
    description: "Gdy paczka dotarła do Polski pocztą",
    url: (n) => `https://emonitoring.poczta-polska.pl/?numer=${n}`,
  },
];

/** Numer sprawdzamy u siebie, a śledzenie otwiera się na stronie wybranego serwisu – nic nie wysyłamy na nasz serwer. */
export function Tracking() {
  const [value, setValue] = useState("");
  const [number, setNumber] = useState<string | null>(null);
  const [error, setError] = useState("");

  const check = (e: React.FormEvent) => {
    e.preventDefault();
    const n = value.replace(/[\s-]/g, "").toUpperCase();
    if (!n) {
      setNumber(null);
      setError("Wpisz numer przesyłki.");
      return;
    }
    if (n.length < 8 || n.length > 40 || !PATTERNS.some((p) => p.test(n))) {
      setNumber(null);
      setError(
        "To nie wygląda na numer przesyłki. Skopiuj go z zamówienia u agenta (np. CG52151218DE) i spróbuj ponownie.",
      );
      return;
    }
    setError("");
    setNumber(n);
  };

  return (
    <div>
      <form onSubmit={check} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="nr" className="sr-only">
          Numer przesyłki
        </label>
        <input
          id="nr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="np. CG52151218DE"
          className="min-w-0 flex-1 rounded-xl border border-border bg-card-2/60 px-4 py-3 text-white placeholder:text-subtle focus:border-border-strong focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-white px-6 py-3 font-bold text-black transition-colors hover:bg-zinc-100"
        >
          Śledź paczkę
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-4 text-danger">
          {error}
        </p>
      ) : null}
      {number ? (
        <div className="mt-8" aria-live="polite">
          <p className="text-muted">
            Numer{" "}
            <span className="tabular font-semibold text-fg">{number}</span> –
            wybierz, gdzie sprawdzić status:
          </p>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {TRACKERS.map((t) => (
              <li key={t.name}>
                <a
                  href={t.url(encodeURIComponent(number))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-border bg-card block h-full p-5 hover:outline-2 hover:outline-fg"
                >
                  <span className="block font-bold">{t.name}</span>
                  <span className="mt-1 block text-small text-muted">
                    {t.description}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
