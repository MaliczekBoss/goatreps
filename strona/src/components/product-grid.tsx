"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductCard as Card } from "@/lib/types";
import { ProductCard } from "./product-card";

type Props = {
  initial: Card[];
  total: number;
  queryString: string;
  pageSize: number;
};

/** Siatka katalogu: pierwsza strona z serwera, kolejne doładowywane z /api/products przy przewijaniu. */
export function ProductGrid({ initial, total, queryString, pageSize }: Props) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = items.length < total && page * pageSize < total;

  const loadMore = useCallback(async () => {
    if (state === "loading" || !hasMore) return;
    setState("loading");
    try {
      const params = new URLSearchParams(queryString);
      params.set("page", String(page + 1));
      const res = await fetch(`/api/products?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: Card[] };
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...data.items.filter((p) => !seen.has(p.id))];
      });
      setPage((p) => p + 1);
      setState("idle");
    } catch {
      setState("error");
    }
  }, [state, hasMore, queryString, page]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || state !== "idle") return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && loadMore(),
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, state, loadMore]);

  return (
    <>
      <ul className="products-grid">
        {items.map((p, i) => (
          <li key={p.id}>
            <ProductCard product={p} priority={i < 4} />
          </li>
        ))}
      </ul>
      <div
        ref={sentinel}
        className="mt-8 flex flex-col items-center gap-2"
        aria-live="polite"
      >
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={state === "loading"}
            className="rounded-xl border border-border bg-card-2 px-6 py-2.5 text-sm font-semibold text-zinc-200 hover:border-border-strong hover:text-white disabled:opacity-60"
          >
            {state === "loading" ? "Wczytuję…" : "Pokaż więcej"}
          </button>
        ) : items.length ? (
          <p className="text-small text-muted">
            To wszystkie produkty dla tych filtrów.
          </p>
        ) : null}
        {state === "error" ? (
          <p className="text-small text-danger">
            Nie udało się wczytać kolejnych produktów. Kliknij „Pokaż więcej”,
            żeby spróbować ponownie.
          </p>
        ) : null}
      </div>
    </>
  );
}
