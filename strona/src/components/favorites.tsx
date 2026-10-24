"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ProductCard } from "@/lib/types";
import PulseHeart from "./pulse-heart";

// Ulubione są tylko w przeglądarce (localStorage), nie wysyłamy ich na serwer.
const KEY = "goatreps:ulubione";
const MAX = 200;

type Ctx = {
  items: ProductCard[];
  has: (id: number) => boolean;
  toggle: (p: ProductCard) => void;
  remove: (id: number) => void;
  clear: () => void;
};
const FavoritesContext = createContext<Ctx | null>(null);

const isCard = (x: unknown): x is ProductCard =>
  !!x &&
  typeof x === "object" &&
  Number.isInteger((x as ProductCard).id) &&
  typeof (x as ProductCard).title === "string" &&
  Number.isFinite((x as ProductCard).price);

function parse(raw: string | null): ProductCard[] {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list)
      ? list
          .filter(isCard)
          .slice(0, MAX)
          .map((p) => ({
            ...p,
            title: p.title.slice(0, 200),
            tags: Array.isArray(p.tags) ? p.tags : [],
          }))
      : [];
  } catch {
    return [];
  }
}

// Zewnętrzny magazyn dla useSyncExternalStore: ta sama tablica, dopóki zapis w localStorage się nie zmieni.
const EMPTY: ProductCard[] = [];
const SYNC = "goatreps:ulubione-zmiana";
let cache: { raw: string | null; items: ProductCard[] } = {
  raw: null,
  items: EMPTY,
};

function snapshot() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw !== cache.raw) cache = { raw, items: parse(raw) };
  return cache.items;
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  addEventListener("storage", onStorage);
  addEventListener(SYNC, cb);
  return () => {
    removeEventListener("storage", onStorage);
    removeEventListener(SYNC, cb);
  };
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);

  const save = useCallback((next: ProductCard[]) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    dispatchEvent(new Event(SYNC));
  }, []);

  const value = useMemo<Ctx>(() => {
    const ids = new Set(items.map((p) => p.id));
    return {
      items,
      has: (id) => ids.has(id),
      toggle: (p) =>
        save(
          ids.has(p.id)
            ? items.filter((x) => x.id !== p.id)
            : [p, ...items].slice(0, MAX),
        ),
      remove: (id) => save(items.filter((x) => x.id !== id)),
      clear: () => save([]),
    };
  }, [items, save]);

  return <FavoritesContext value={value}>{children}</FavoritesContext>;
}

export function useFavorites() {
  const ctx = use(FavoritesContext);
  if (!ctx) throw new Error("useFavorites poza FavoritesProvider");
  return ctx;
}

export function HeartIcon({
  filled,
  className = "",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      className={className}
    >
      <path
        d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Serce na karcie produktu. Nie przechodzi do produktu po kliknięciu. */
export function FavoriteButton({
  product,
  className = "",
}: {
  product: ProductCard;
  className?: string;
}) {
  const { has, toggle } = useFavorites();
  const on = has(product.id);
  return (
    <PulseHeart
      liked={on}
      showCount={false}
      size={17}
      corner={999}
      pillColor="rgb(0 0 0 / 0.55)"
      idleColor="#ffffff"
      likedColor="#ff4d6d"
      label={on ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
      // serduszko leży na karcie z linkiem – kliknięcie nie może przenieść do produktu
      // (bez stopPropagation: w fazie przechwytywania zablokowałoby też onClick samego przycisku)
      onClickCapture={(e) => e.preventDefault()}
      onChange={() => toggle(product)}
      className={`backdrop-blur ${className}`}
    />
  );
}
