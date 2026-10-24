import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentRow } from "@/components/agent-row";
import { BuyBox, ExternalIcon } from "@/components/buy-box";
import CountUp from "@/components/count-up";
import { Gallery } from "@/components/gallery";
import { LivePrice } from "@/components/live-price";
import { ProductCard } from "@/components/product-card";
import { QcGrid } from "@/components/qc-grid";
import { TAG_LABELS, TagStamp } from "@/components/tag-stamp";
import { agentUrl } from "@/lib/agent-links";
import { getProduct, similar } from "@/lib/catalog";
import { categoryName } from "@/lib/category-names";
import { cdn } from "@/lib/images";
import { agentLinks, OUTBOUND_REL, safeLink } from "@/lib/links";
import { getSyncedPrice } from "@/lib/price-sync";
import { productViews } from "@/lib/analytics/store";
import { rateNote } from "@/lib/money";
import { getQc } from "@/lib/qc";
import { getRates } from "@/lib/rates";

type Props = { params: Promise<{ id: string }> };

const SHOPS = { weidian: "Weidian", taobao: "Taobao", "1688": "1688" } as const;
const QUALITY_WORDS: Record<number, string> = { 10: "Najwyższa jakość", 9: "Bardzo dobra", 8: "Dobra", 7: "Przyzwoita" };

function load(id: string) {
  if (!/^\d{1,7}$/.test(id)) return null;
  return getProduct(Number(id));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = load((await params).id);
  if (!product) return { title: "Produkt nie znaleziony", robots: { index: false } };
  const image = cdn(product.image) ?? undefined;
  return {
    title: product.title,
    description: `${product.title} – ¥${Math.round(product.price)} CNY, jakość ${product.quality}/10. Kup przez KakoBuy, USFans, AllChinaBuy i innych agentów.`,
    alternates: { canonical: `/item/details/${product.id}` },
    openGraph: { title: product.title, images: image ? [{ url: image, width: 1400, height: 1400 }] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const product = load((await params).id);
  if (!product) notFound();

  const synced = getSyncedPrice(product.id);
  const rates = await getRates();
  const qc = getQc(product.itemId);
  const agents = agentLinks(product);
  const source = safeLink(product.links.default);
  const shop = product.platform ? SHOPS[product.platform] : null;
  const agentQcUrl = product.platform && product.itemId ? agentUrl("kakobuy", { itemId: product.itemId, platform: product.platform }) : null;
  const more = similar(product, 5);
  const qcCount = qc?.photos.length ?? 0;
  // prawdziwe wyświetlenia ze statystyk (jedna osoba raz na dobę) – bez zmyślonych "X osób ogląda teraz"
  const views = productViews(product.id);
  const viewsForm = new Intl.PluralRules("pl-PL").select(views);
  const viewsText = viewsForm === "one" ? "osoba obejrzała" : viewsForm === "few" ? "osoby obejrzały" : "osób obejrzało";

  return (
    <div className="site-container pt-4 pb-28 lg:pb-0">
      <nav aria-label="Okruszki" className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/products" className="group inline-flex items-center gap-1.5 transition-colors hover:text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Produkty
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="transition-colors hover:text-white">
          {categoryName(product.category)}
        </Link>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-10">
        <Gallery productId={product.id} title={product.title} image={product.image} gallery={product.gallery} />

        <aside className="self-start lg:sticky lg:top-24 lg:pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-500">
            <TagStamp tags={product.tags} />
            <span>
              {categoryName(product.category)}
              {shop ? ` z ${shop === "Weidian" ? "Weidiana" : shop}` : ""}
            </span>
          </div>
          <h1 className="mt-3 text-[2rem] leading-[1.08] font-bold tracking-[-0.03em] text-white sm:text-[2.5rem]">{product.title}</h1>
          {views > 0 ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-neutral-900/60 py-1.5 pr-3.5 pl-2.5 text-sm text-zinc-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-300" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              <span>
                <CountUp to={views} duration={1.4} separator={" "} className="font-semibold text-white tabular-nums" /> {viewsText} ten produkt
              </span>
            </p>
          ) : null}

          <div className="mt-8 flex items-end justify-between gap-6 border-b border-neutral-800 pb-7">
            <LivePrice id={product.id} cny={synced?.price ?? product.price} checkedAt={synced?.checkedAt ?? null} />
            <div className="shrink-0 text-right">
              <p className="text-xs text-zinc-500">Ocena QC</p>
              <p className="mt-1 text-5xl leading-none font-bold tracking-tight text-white tabular">
                {product.quality}
                <span className="text-2xl text-zinc-600">/10</span>
              </p>
              <p className="mt-2 text-xs font-medium text-green-400">{QUALITY_WORDS[product.quality] ?? ""}</p>
            </div>
          </div>

          <dl className="divide-y divide-neutral-800/70 border-b border-neutral-800 text-sm">
            {[
              ["Batch", product.tags.filter((t) => t !== "random").map((t) => TAG_LABELS[t]).join(", ") || "Standard"],
              ["Sklep", shop],
              ["Nr przedmiotu", product.itemId],
              ["Waga z magazynu", qc?.weight ? `${qc.weight} g` : null],
              ["Wymiary paczki", qc?.dims ? `${qc.dims.l} × ${qc.dims.w} × ${qc.dims.h} cm` : null],
              ["Dojazd do magazynu", qc?.arrivalDays ? `${qc.arrivalDays} dni` : null],
            ]
              .filter((row): row is [string, string] => !!row[1])
              .map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-zinc-500">{label}</dt>
                  <dd className="truncate font-medium text-white tabular">{value}</dd>
                </div>
              ))}
          </dl>

          <div className="mt-7">
            <AgentRow />
          </div>
          <div className="mt-6">
            <BuyBox agents={agents} source={source} />
          </div>

          <p className="mt-6 text-xs leading-relaxed text-zinc-600">
            Cena w złotówkach jest przeliczona z juanów {rateNote(rates)} i nie zawiera wysyłki z Chin ani prowizji agenta.
          </p>
        </aside>
      </div>

      <section aria-labelledby="qc" className="mt-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="qc" className="flex items-center gap-2.5 text-2xl font-bold text-white">
              Zdjęcia QC
              {qcCount ? <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-sm font-semibold text-zinc-300 tabular">{qcCount}</span> : null}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {qcCount ? "Zdjęcia z magazynu agenta z prawdziwych zamówień – sprawdź szwy, logo i metki." : "Nie mamy jeszcze zdjęć z magazynu dla tego produktu."}
            </p>
          </div>
          {agentQcUrl ? (
            <a
              href={agentQcUrl}
              target="_blank"
              rel={OUTBOUND_REL}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-neutral-600 hover:text-white"
            >
              <ExternalIcon />
              {qcCount ? "Więcej QC na KakoBuy" : "Zobacz QC na KakoBuy"}
            </a>
          ) : null}
        </div>
        {qcCount ? <QcGrid photos={qc!.photos} title={product.title} /> : null}
      </section>

      {more.length ? (
        <section aria-labelledby="podobne" className="mt-16">
          <h2 id="podobne" className="mb-6 text-2xl font-bold text-white">
            Podobne produkty
          </h2>
          <ul className="products-grid">
            {more.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* przyklejony pasek zakupu na telefonie */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-[rgb(10_10_10/0.92)] p-3 backdrop-blur-xl lg:hidden">
        <BuyBox agents={agents} source={source} sticky />
      </div>
    </div>
  );
}
