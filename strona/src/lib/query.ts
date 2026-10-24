import { SORTS, TAGS, type Query, type Sort, type Tag } from "./types";

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

const first = (params: Params, key: string) => {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

const num = (v: string, max: number) => {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n >= 0 && n <= max ? n : null;
};

/** Parametry z adresu → bezpieczne, ograniczone wartości. Nieznane albo zbyt długie są pomijane. */
export function parseQuery(params: Params): Query {
  const category = first(params, "category");
  const sort = first(params, "sort");
  const tag = first(params, "tag");
  const quality = num(first(params, "quality"), 10);
  return {
    category: /^[a-z0-9_]{1,40}$/.test(category) ? category : null,
    search: first(params, "search").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 300),
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : "random",
    seed: /^\d{1,9}$/.test(first(params, "seed")) ? Number(first(params, "seed")) : null,
    tag: (TAGS as readonly string[]).includes(tag) ? (tag as Tag) : null,
    minQuality: quality && quality >= 7 ? Math.floor(quality) : null,
    minPrice: num(first(params, "minPrice"), 1_000_000),
    maxPrice: num(first(params, "maxPrice"), 1_000_000),
  };
}

/** Query → parametry adresu (bez wartości domyślnych). */
export function queryToParams(q: Partial<Query>) {
  const p = new URLSearchParams();
  if (q.category) p.set("category", q.category);
  if (q.search) p.set("search", q.search);
  if (q.sort && q.sort !== "random") p.set("sort", q.sort);
  if ((!q.sort || q.sort === "random") && q.seed) p.set("seed", String(q.seed));
  if (q.tag) p.set("tag", q.tag);
  if (q.minQuality) p.set("quality", String(q.minQuality));
  if (q.minPrice != null) p.set("minPrice", String(q.minPrice));
  if (q.maxPrice != null) p.set("maxPrice", String(q.maxPrice));
  return p;
}

export const PAGE_SIZE = 24;

export const newSeed = () => 1 + Math.floor(Math.random() * 999_999_998);
