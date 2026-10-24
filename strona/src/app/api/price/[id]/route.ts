import { getProduct } from "@/lib/catalog";
import { getFreshPrice } from "@/lib/price-sync";
import { rateLimit, tooMany } from "@/lib/rate-limit";

// Aktualna cena produktu (CNY). Świeża (< 3 dni) od razu z magazynu, starsza – odświeżana u agenta/sklepu (max ~6 s).
// Problemy po stronie źródeł nigdy nie dają 5xx: wtedy wraca ostatnia znana cena z `changed: false`.
export async function GET(request: Request, ctx: RouteContext<"/api/price/[id]">) {
  const limit = rateLimit(request, "price", 60, 60_000);
  if (!limit.ok) return tooMany(limit.retryAfter);

  const { id: raw } = await ctx.params;
  const id = /^\d{1,7}$/.test(raw) ? Number(raw) : 0;
  const product = id > 0 ? getProduct(id) : null;
  if (!product) return Response.json({ error: "Nie ma takiego produktu." }, { status: 404 });

  let result = null;
  try {
    result = await getFreshPrice(id);
  } catch (error) {
    console.error(`[ceny] #${id}: ${error instanceof Error ? error.message : error}`);
  }
  const { price, checkedAt, source, available, changed } = result ?? {
    price: product.price,
    checkedAt: product.updatedAt,
    source: "katalog",
    available: true,
    changed: false,
  };
  return Response.json({ id, price, currency: "CNY", checkedAt, source, available, changed });
}
