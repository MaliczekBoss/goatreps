// Test synchronizacji cen: node ceny-test.mjs [adres-strony] [id ...]
// Domyślnie http://localhost:3100 i kilka produktów z ../strona/data/products.json.
// Pokazuje: cenę z katalogu → cenę z /api/price/{id}, źródło, dostępność, czas odpowiedzi.
// Drugie wywołanie tego samego id powinno przyjść z magazynu (szybko, changed: false).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const base = (args[0] && /^https?:\/\//.test(args[0]) ? args.shift() : "http://localhost:3100").replace(/\/$/, "");
const products = JSON.parse(readFileSync(path.join(here, "..", "strona", "data", "products.json"), "utf8"));
const byId = new Map(products.map((p) => [p.id, p]));

const DEFAULT_IDS = [3286, 3285, 3283, 2551, 3093, 1718, 3217];
const ids = args.length ? args.map(Number).filter(Number.isInteger) : DEFAULT_IDS;

async function call(id) {
  const t = performance.now();
  const res = await fetch(`${base}/api/price/${id}`, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  return { status: res.status, ms: Math.round(performance.now() - t), body };
}

const row = (id, r) => {
  const p = byId.get(id);
  const b = r.body ?? {};
  const shop = p ? `${p.platform}:${p.itemId}` : "?";
  if (r.status !== 200) return `#${id} ${shop}  HTTP ${r.status} ${JSON.stringify(b)}  ${r.ms} ms`;
  return `#${id} ${shop}  katalog ${p?.price} → ${b.price} ${b.currency}  źródło=${b.source}  dostępny=${b.available}  changed=${b.changed}  sprawdzono=${b.checkedAt}  ${r.ms} ms`;
};

console.log(`== ${base} – pierwsze wywołanie (odświeża, jeśli cena starsza niż 3 dni)`);
for (const id of ids) console.log(row(id, await call(id)));

console.log("\n== drugie wywołanie (powinno być z magazynu)");
for (const id of ids) console.log(row(id, await call(id)));

console.log("\n== równoległe zapytania o ten sam produkt (jedno odświeżenie)");
const same = ids[0];
const parallel = await Promise.all(Array.from({ length: 5 }, () => call(same)));
console.log(parallel.map((r) => `${r.status}/${r.body?.price}/${r.body?.source}/${r.ms}ms`).join("  "));

console.log("\n== błędne id");
for (const bad of ["0", "abc", "99999999", "-1", "1e3"]) {
  const res = await fetch(`${base}/api/price/${bad}`);
  console.log(`${bad} → HTTP ${res.status} ${await res.text()}`);
}
