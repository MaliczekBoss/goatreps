import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { allIds, getCategories } from "@/lib/catalog";
import { getSyncedPrice } from "@/lib/price-sync";
import { qcStats } from "@/lib/qc";
import { StatsDashboard, type CatalogSummary } from "./stats-dashboard";

export const metadata: Metadata = { title: "Statystyki" };

const PRICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function catalogSummary(): CatalogSummary {
  const ids = allIds();
  const now = Date.now();
  let synced = 0;
  let fresh = 0;
  for (const { id } of ids) {
    const price = getSyncedPrice(id);
    if (!price || price.source === "katalog") continue;
    synced++;
    if (now - Date.parse(price.checkedAt) < PRICE_MAX_AGE_MS) fresh++;
  }
  const qc = qcStats();
  return {
    products: ids.length,
    categories: getCategories().length,
    pricesSynced: synced,
    pricesFresh: fresh,
    qcChecked: qc.checked,
    qcWithPhotos: qc.withPhotos,
    qcPhotos: qc.photos,
  };
}

export default async function StatsPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="site-container">
      <StatsDashboard catalog={catalogSummary()} />
    </div>
  );
}
