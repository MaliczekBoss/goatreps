import "server-only";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseLink } from "./agent-links";
import { normalize } from "./search";
import type { Category, Product, ProductCard, Query } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const CHECK_EVERY_MS = 60_000;

type Indexed = Product & { _text: string; _time: number };
type Store = {
  mtime: number;
  checkedAt: number;
  products: Indexed[];
  byId: Map<number, Indexed>;
  byItemId: Map<string, Indexed[]>;
  categories: Category[];
};

const g = globalThis as typeof globalThis & { __grCatalog?: Store };

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    console.error(`[katalog] nie można wczytać ${path.basename(file)}:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

function load(mtime: number): Store {
  const raw = readJson<Product[]>(PRODUCTS_FILE, []);
  const categories = readJson<Category[]>(CATEGORIES_FILE, []);
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const products: Indexed[] = raw.map((p) => ({
    ...p,
    // brak zdjęcia głównego, ale są zdjęcia w galerii – pierwsze z nich staje się główne
    ...(!p.image && p.gallery.length ? { image: p.gallery[0], thumb: p.gallery[0].replace(/^q\//, "p/"), gallery: p.gallery.slice(1) } : {}),
    _text: normalize(`${p.title} ${names.get(p.category) ?? p.category}`),
    _time: Date.parse(p.createdAt) || 0,
  }));
  const byItemId = new Map<string, Indexed[]>();
  for (const p of products) {
    if (!p.itemId) continue;
    const list = byItemId.get(p.itemId);
    if (list) list.push(p);
    else byItemId.set(p.itemId, [p]);
  }
  return { mtime, checkedAt: Date.now(), products, byId: new Map(products.map((p) => [p.id, p])), byItemId, categories };
}

/** Dane są w pamięci; po podmianie data/products.json wczytują się same (sprawdzane co minutę). */
function store(): Store {
  const now = Date.now();
  const current = g.__grCatalog;
  if (current && now - current.checkedAt < CHECK_EVERY_MS) return current;
  let mtime = 0;
  try {
    mtime = statSync(PRODUCTS_FILE).mtimeMs;
  } catch {}
  if (current && current.mtime === mtime) {
    current.checkedAt = now;
    return current;
  }
  g.__grCatalog = load(mtime);
  return g.__grCatalog;
}

/** Deterministyczny "rzut kostką" dla produktu: ten sam seed = ta sama kolejność (mulberry32). */
function shuffleKey(id: number, seed: number) {
  let t = (id * 2654435761 + seed) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const toCard = ({ id, title, price, category, quality, tags, thumb }: Product): ProductCard => ({
  id,
  title,
  price,
  category,
  quality,
  tags,
  thumb,
});

export const getCategories = () => store().categories;
export const getCategory = (slug: string) => store().categories.find((c) => c.slug === slug) ?? null;
export const getProduct = (id: number) => store().byId.get(id) ?? null;
export const countProducts = () => store().products.length;
export const findByItemId = (itemId: string): Product[] => store().byItemId.get(itemId) ?? [];

export function query(q: Query, offset: number, limit: number) {
  const s = store();
  let list: Indexed[] = s.products;

  const fromLink = q.search ? (parseLink(q.search)?.itemId ?? null) : null;
  if (fromLink) {
    list = s.byItemId.get(fromLink) ?? [];
  } else if (q.search) {
    const words = normalize(q.search).split(" ").filter(Boolean).slice(0, 8);
    if (words.length) list = list.filter((p) => words.every((w) => p._text.includes(w)));
  }
  if (q.category) list = list.filter((p) => p.category === q.category);
  if (q.tag) list = list.filter((p) => p.tags.includes(q.tag!));
  if (q.minQuality) list = list.filter((p) => p.quality >= q.minQuality!);
  if (q.minPrice != null) list = list.filter((p) => p.price >= q.minPrice!);
  if (q.maxPrice != null) list = list.filter((p) => p.price <= q.maxPrice!);

  const sorted = [...list];
  switch (q.sort) {
    case "random": {
      const seed = q.seed ?? 1;
      const key = new Map(sorted.map((p) => [p.id, shuffleKey(p.id, seed)]));
      sorted.sort((a, b) => key.get(a.id)! - key.get(b.id)!);
      break;
    }
    case "oldest":
      sorted.sort((a, b) => a._time - b._time);
      break;
    case "price_asc":
      sorted.sort((a, b) => a.price - b.price || b._time - a._time);
      break;
    case "price_desc":
      sorted.sort((a, b) => b.price - a.price || b._time - a._time);
      break;
    default:
      sorted.sort((a, b) => b._time - a._time);
  }
  // produkty bez zdjęcia na koniec listy – nie zaczynamy katalogu od pustych kafelków
  const ordered = [...sorted.filter((p) => p.thumb), ...sorted.filter((p) => !p.thumb)];
  return { total: ordered.length, items: ordered.slice(offset, offset + limit).map(toCard) };
}

export function newest(limit: number, exclude = new Set<number>()) {
  return store()
    .products.filter((p) => p.thumb && !exclude.has(p.id))
    .slice()
    .sort((a, b) => b._time - a._time)
    .slice(0, limit)
    .map(toCard);
}

export function newestInCategory(slug: string, limit: number) {
  return store()
    .products.filter((p) => p.category === slug && p.thumb)
    .sort((a, b) => b._time - a._time)
    .slice(0, limit)
    .map(toCard);
}

/** Najlepsze batche: tag bestbatch, najwyższa jakość, najnowsze najpierw. */
export function bestBatch(limit: number, exclude = new Set<number>()) {
  return store()
    .products.filter((p) => p.thumb && p.tags.includes("bestbatch") && !exclude.has(p.id))
    .slice()
    .sort((a, b) => b.quality - a.quality || b._time - a._time)
    .slice(0, limit)
    .map(toCard);
}

/** Podobne: ta sama kategoria, najbliższa cena. */
export function similar(product: Product, limit: number) {
  return store()
    .products.filter((p) => p.id !== product.id && p.category === product.category && p.thumb)
    .map((p) => ({ p, d: Math.abs(Math.log((p.price + 1) / (product.price + 1))) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ p }) => toCard(p));
}

export function priceBounds() {
  let max = 0;
  for (const p of store().products) if (p.price > max) max = p.price;
  return { min: 0, max: Math.ceil(max / 10) * 10 };
}

export function allIds() {
  return store().products.map((p) => ({ id: p.id, updatedAt: p.updatedAt }));
}

/**
 * Kandydaci do wyszukiwania po zdjęciu: kilka fraz (od najbardziej konkretnej), punkty za trafione słowa.
 * Produkt, który ma wszystkie słowa frazy, liczy się w pełni; częściowe trafienie (co najmniej połowa słów) – słabiej.
 */
export function searchCandidates(phrases: string[], category: string | null, limit: number) {
  const scores = new Map<number, { p: Indexed; score: number }>();
  phrases.forEach((phrase, i) => {
    const words = [...new Set(normalize(phrase).split(" ").filter((w) => w.length > 1))].slice(0, 8);
    if (!words.length) return;
    const weight = 1 / (1 + i * 0.25);
    for (const p of store().products) {
      if (!p.thumb) continue;
      const hits = words.filter((w) => p._text.includes(w)).length;
      if (!hits || hits / words.length < 0.5) continue;
      const full = hits === words.length ? 1 : 0.35 * (hits / words.length);
      const bonus = category && p.category === category ? 1.25 : 1;
      const prev = scores.get(p.id) ?? { p, score: 0 };
      prev.score += weight * full * bonus * (1 + p.quality / 40);
      scores.set(p.id, prev);
    }
  });
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || b.p._time - a.p._time)
    .slice(0, limit)
    .map((s) => s.p);
}

/** Najlepiej oceniane (potem najnowsze) produkty z kategorii – "popularne w kategorii" pod wynikami. */
export function topInCategory(slug: string, limit: number, exclude = new Set<number>()) {
  return store()
    .products.filter((p) => p.category === slug && p.thumb && !exclude.has(p.id))
    .sort((a, b) => b.quality - a.quality || b._time - a._time)
    .slice(0, limit)
    .map(toCard);
}
