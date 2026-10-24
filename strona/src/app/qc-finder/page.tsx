import type { Metadata } from "next";
import Form from "next/form";
import { ToolHeader } from "@/components/tool-header";
import { ProductCard } from "@/components/product-card";
import { QcGrid } from "@/components/qc-grid";
import { agentUrl, parseLink } from "@/lib/agent-links";
import { findByItemId, toCard } from "@/lib/catalog";
import { getQc } from "@/lib/qc";
import { OUTBOUND_REL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Zdjęcia QC",
  description: "Wklej link z Weidiana, Taobao albo od agenta i zobacz zdjęcia QC z magazynu dla tego produktu.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function QcFinderPage({ searchParams }: Props) {
  const raw = (await searchParams).url;
  const input = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 2000) ?? "";
  const parsed = input ? parseLink(input) : null;
  const matches = parsed ? findByItemId(parsed.itemId) : [];
  const qc = parsed ? getQc(parsed.itemId) : null;

  return (
    <div className="site-container max-w-6xl pt-6">
      <ToolHeader title="QC" accent="Finder" description="Wklej link do produktu z Weidiana, Taobao, 1688 albo od agenta. Pokażemy zdjęcia QC z magazynu, które mamy u siebie, i ten przedmiot w naszym katalogu." />

      <Form action="/qc-finder" className="mt-8 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="qc-url" className="sr-only">
          Link do produktu
        </label>
        <input
          id="qc-url"
          name="url"
          type="url"
          required
          maxLength={2000}
          defaultValue={input}
          autoComplete="off"
          spellCheck={false}
          placeholder="https://weidian.com/item.html?itemID=…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-card-2/60 px-4 py-3 text-white placeholder:text-subtle focus:border-border-strong focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-white px-6 py-3 font-bold text-black transition-colors hover:bg-zinc-100">
          Pokaż zdjęcia
        </button>
      </Form>

      {input && !parsed ? (
        <p role="alert" className="mt-4 text-danger">
          To nie wygląda na link do produktu. Wklej link z Weidiana, Taobao, 1688 albo od agenta (np. KakoBuy).
        </p>
      ) : null}

      {parsed ? (
        <div className="mt-10 space-y-8">
          <section aria-labelledby="qc-wyniki">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="qc-wyniki" className="flex items-center gap-2.5 text-2xl font-bold text-white">
                  Zdjęcia QC z magazynu
                  {qc?.photos.length ? <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold text-zinc-300 tabular">{qc.photos.length}</span> : null}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {qc?.photos.length
                    ? "Prawdziwe zdjęcia z zamówień – trzymamy je na naszym serwerze."
                    : "Nie mamy jeszcze zdjęć QC tego przedmiotu. Zobacz QC innych kupujących u agenta albo zapytaj na Discordzie."}
                </p>
              </div>
              <a
                href={agentUrl("kakobuy", parsed)}
                target="_blank"
                rel={OUTBOUND_REL}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-neutral-600 hover:text-white"
              >
                Zobacz QC na KakoBuy
              </a>
            </div>
            {qc?.photos.length ? <QcGrid photos={qc.photos} title={matches[0]?.title ?? "Produkt"} /> : null}
          </section>

          {matches.length ? (
            <section aria-label="Ten produkt w katalogu">
              <h2 className="mb-4 text-lg font-semibold text-white">Ten przedmiot w naszym katalogu</h2>
              <ul className="products-grid">
                {matches.slice(0, 10).map((p) => (
                  <li key={p.id}>
                    <ProductCard product={toCard(p)} named={false} />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-zinc-500">Tego przedmiotu nie ma jeszcze w katalogu Goat Reps.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
