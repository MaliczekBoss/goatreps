import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { CatalogControls } from "@/components/catalog-controls";
import { ProductGrid } from "@/components/product-grid";
import { getCategory, query } from "@/lib/catalog";
import { CATEGORY_NAMES } from "@/lib/category-names";
import { newSeed, PAGE_SIZE, parseQuery, queryToParams } from "@/lib/query";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Kolejność chipów jak na starej stronie.
const CHIPS = ["buty", "koszulki", "bluzy", "swetry", "kurtki", "sety", "spodnie", "spodenki", "longsleeve", "nakrycie_glowy", "okulary", "torby_i_plecaki", "paski", "elektronika", "akcesoria", "inne"];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = parseQuery(await searchParams);
  const category = q.category ? getCategory(q.category) : null;
  const title = q.search ? `Wyniki dla „${q.search.slice(0, 60)}”` : category ? category.name : "Produkty";
  return {
    title,
    alternates: { canonical: category && !q.search ? `/products?category=${category.slug}` : "/products" },
    robots: q.search ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: Props) {
  const q = parseQuery(await searchParams);
  // domyślnie losowa kolejność – nowa przy każdym wejściu, ale stała przy przewijaniu (ziarno idzie do kolejnych stron)
  if (q.sort === "random" && !q.seed) q.seed = newSeed();
  const { total, items } = query(q, 0, PAGE_SIZE);
  const qs = queryToParams(q).toString();
  const chips = CHIPS.map((slug) => ({ slug, name: CATEGORY_NAMES[slug] ?? slug }));

  return (
    <div className="site-container pt-4">
      <h1 className="sr-only">{q.category ? (CATEGORY_NAMES[q.category] ?? "Produkty") : "Produkty"}</h1>
      <CatalogControls key={`${q.category}|${q.sort}|${q.tag}|${q.minPrice}|${q.maxPrice}`} query={q} categories={chips} />

      <p className="mt-5 mb-4 text-sm text-subtle" aria-live="polite">
        {q.search ? (
          <>
            Wyniki dla „<span className="text-zinc-300">{q.search.length > 60 ? `${q.search.slice(0, 60)}…` : q.search}</span>”:{" "}
          </>
        ) : null}
        {new Intl.NumberFormat("pl-PL").format(total)} {plural(total)}
      </p>

      <ViewTransition key={qs} enter="fade-in" exit="fade-out" default="none">
        <div>
          {items.length ? (
            <ProductGrid initial={items} total={total} queryString={qs} pageSize={PAGE_SIZE} />
          ) : (
            <div className="flex flex-col items-center py-20 text-center">
              <p className="text-lg font-semibold text-white">Nie znaleziono produktów</p>
              <p className="mt-1 max-w-md text-sm text-subtle">
                Spróbuj zmienić filtry albo wpisz samą markę. Jeśli wklejasz link, którego u nas nie ma, otwórz go u swojego agenta w konwerterze
                linków.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link href="/products" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-100">
                  Wyczyść filtry
                </Link>
                <Link href="/link-converter" className="rounded-xl border border-border px-4 py-2 text-sm text-zinc-300 hover:border-border-strong hover:text-white">
                  Konwerter linków
                </Link>
              </div>
            </div>
          )}
        </div>
      </ViewTransition>
    </div>
  );
}

function plural(n: number) {
  if (n === 1) return "produkt";
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? "produkty" : "produktów";
}
