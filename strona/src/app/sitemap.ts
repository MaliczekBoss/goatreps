import type { MetadataRoute } from "next";
import { allIds, getCategories } from "@/lib/catalog";
import { TOOLS } from "@/lib/tools";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://goatreps.com";

export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/products`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/tools`, changeFrequency: "monthly", priority: 0.5 },
    ...TOOLS.map((t) => ({ url: `${SITE_URL}${t.href}`, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...getCategories().map((c) => ({ url: `${SITE_URL}/products?category=${c.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...allIds().map((p) => ({ url: `${SITE_URL}/item/details/${p.id}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
