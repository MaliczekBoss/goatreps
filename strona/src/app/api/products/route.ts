import { query } from "@/lib/catalog";
import { newSeed, PAGE_SIZE, parseQuery } from "@/lib/query";
import { rateLimit, tooMany } from "@/lib/rate-limit";

// Kolejne strony katalogu przy przewijaniu i podpowiedzi w wyszukiwarce. Zwraca tylko dane kafelków.
export function GET(request: Request) {
  const limit = rateLimit(request, "products", 240, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const url = new URL(request.url);
  if (url.search.length > 600) return Response.json({ error: "Zbyt długie zapytanie." }, { status: 414 });

  const page = Number(url.searchParams.get("page") ?? "1");
  const count = Number(url.searchParams.get("count") ?? PAGE_SIZE);
  if (!Number.isInteger(page) || page < 1 || page > 400) return Response.json({ error: "Nieprawidłowa strona." }, { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > PAGE_SIZE) return Response.json({ error: "Nieprawidłowa liczba wyników." }, { status: 400 });

  const q = parseQuery(url.searchParams);
  if (q.sort === "random" && !q.seed) q.seed = newSeed();
  const { total, items } = query(q, (page - 1) * count, count);
  return Response.json({ total, page, items });
}
