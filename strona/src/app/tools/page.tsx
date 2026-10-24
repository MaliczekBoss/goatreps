import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { TOOLS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Narzędzia",
  description: "Wyszukiwanie po zdjęciu z AI, zdjęcia QC, konwerter linków między agentami, śledzenie przesyłek i kalkulator wysyłki z Chin.",
};

export default function ToolsPage() {
  return (
    <div className="site-container pt-6">
      <h1 className="text-4xl leading-tight font-bold text-white md:text-5xl">
        <span className="reveal-line">Narzędzia</span>
        <span className="reveal-line text-zinc-500" style={{ "--d": 1 } as React.CSSProperties}>
          Eksploruj narzędzia
        </span>
      </h1>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t, i) => (
          <li key={t.href}>
            <Reveal delay={i} className="h-full">
              <Link
                href={t.href}
                className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-white/40 hover:bg-neutral-900/90 hover:shadow-[0_0_28px_rgba(255,255,255,0.1)]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card-2 text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                    <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h2 className="mt-5 text-xl font-bold text-white">{t.name}</h2>
                <p className="mt-2 flex-1 text-sm text-zinc-400">{t.description}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-white">
                  Eksploruj narzędzia
                  <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
