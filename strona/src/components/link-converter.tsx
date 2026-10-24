"use client";

import Link from "next/link";
import { useState } from "react";
import {
  agentUrl,
  marketplaceUrl,
  parseLink,
  type Parsed,
} from "@/lib/agent-links";
import { OUTBOUND_REL } from "@/lib/links";
import { AGENTS } from "@/lib/settings";
import { AGENT_KEYS } from "@/lib/types";
import { useSettings } from "./settings-provider";

const SHOP = { weidian: "Weidian", taobao: "Taobao", "1688": "1688" } as const;

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {}
      }}
      className="relative shrink-0 rounded-md border border-border px-3 py-1.5 text-small font-semibold hover:border-fg"
    >
      {done ? <span className="text-accent-ink">Skopiowano</span> : "Kopiuj"}
    </button>
  );
}

/** Wszystko dzieje się w przeglądarce – wklejony link nie jest nigdzie wysyłany. */
export function LinkConverter() {
  const { settings } = useSettings();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Parsed | null>(null);
  const [error, setError] = useState("");

  const convert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      setResult(null);
      setError("Wklej link do produktu.");
      return;
    }
    const parsed = parseLink(input);
    setResult(parsed);
    setError(
      parsed
        ? ""
        : "Nie rozpoznaliśmy tego linku. Obsługujemy Weidian, Taobao, Tmall, 1688 oraz linki z KakoBuy, USFans, AllChinaBuy, ACBuy, LitBuy, CNFans, MuleBuy i OopBuy.",
    );
  };

  const agents = [
    settings.agent,
    ...AGENT_KEYS.filter((a) => a !== settings.agent),
  ];

  return (
    <div>
      <form onSubmit={convert} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="link" className="sr-only">
          Link do produktu
        </label>
        <input
          id="link"
          type="url"
          inputMode="url"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://weidian.com/item.html?itemID=…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-card-2/60 px-4 py-3 text-white placeholder:text-subtle focus:border-border-strong focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-white px-6 py-3 font-bold text-black transition-colors hover:bg-zinc-100"
        >
          Zamień link
        </button>
      </form>

      {error ? (
        <p role="alert" className="mt-4 max-w-[70ch] text-danger">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-8" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-muted">
              {SHOP[result.platform]}, przedmiot nr{" "}
              <span className="tabular font-semibold text-fg">
                {result.itemId}
              </span>
            </p>
            <Link
              href={`/products?search=${encodeURIComponent(marketplaceUrl(result))}`}
              className="text-small font-semibold underline decoration-accent decoration-2 underline-offset-4"
            >
              Sprawdź, czy mamy go w katalogu
            </Link>
          </div>
          <ul className="rounded-2xl border border-border bg-card mt-3 divide-y divide-border">
            {agents.map((key) => {
              const url = agentUrl(key, result);
              return (
                <li key={key} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 shrink-0 font-semibold">
                    {AGENTS[key].name}
                    {key === settings.agent ? (
                      <span className="block text-meta font-normal text-accent-ink">
                        Twój agent
                      </span>
                    ) : null}
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-small text-muted md:block">
                    {url}
                  </span>
                  <span className="ml-auto flex shrink-0 gap-2">
                    <CopyButton value={url} />
                    <a
                      href={url}
                      target="_blank"
                      rel={OUTBOUND_REL}
                      className="rounded-md bg-fg px-3 py-1.5 text-small font-semibold text-card hover:bg-muted"
                    >
                      Otwórz
                    </a>
                  </span>
                </li>
              );
            })}
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 font-semibold">
                {SHOP[result.platform]}
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-small text-muted md:block">
                {marketplaceUrl(result)}
              </span>
              <span className="ml-auto flex shrink-0 gap-2">
                <CopyButton value={marketplaceUrl(result)} />
                <a
                  href={marketplaceUrl(result)}
                  target="_blank"
                  rel={OUTBOUND_REL}
                  className="rounded-md border border-fg px-3 py-1.5 text-small font-semibold"
                >
                  Otwórz
                </a>
              </span>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
