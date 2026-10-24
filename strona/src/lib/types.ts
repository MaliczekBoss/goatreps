export const AGENT_KEYS = ["kakobuy", "usfans", "allchinabuy", "acbuy", "litbuy", "cnfans", "mulebuy", "oopbuy"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];
export type LinkKey = AgentKey | "default";

export const TAGS = ["bestbatch", "budgetbatch", "random"] as const;
export type Tag = (typeof TAGS)[number];

export type Product = {
  id: number;
  title: string;
  price: number; // CNY
  category: string;
  quality: number;
  tags: Tag[];
  image: string | null; // "i/<hash>.webp"
  thumb: string | null; // "t/<hash>.webp"
  gallery: string[]; // ["q/<hash>.webp"]
  platform: "weidian" | "taobao" | "1688" | null;
  itemId: string | null;
  links: Partial<Record<LinkKey, string>>;
  createdAt: string;
  updatedAt: string;
};

export type Category = { slug: string; name: string; count: number; image: string | null };

/** Tylko to, co potrzebne do kafelka – tyle trafia do przeglądarki przy przewijaniu katalogu. */
export type ProductCard = Pick<Product, "id" | "title" | "price" | "category" | "quality" | "tags" | "thumb">;

export const SORTS = ["random", "newest", "oldest", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export type Query = {
  category: string | null;
  search: string;
  sort: Sort;
  /** Ziarno losowej kolejności – ta sama kolejność na kolejnych stronach przy przewijaniu. */
  seed: number | null;
  tag: Tag | null;
  minQuality: number | null;
  minPrice: number | null; // CNY
  maxPrice: number | null; // CNY
};
