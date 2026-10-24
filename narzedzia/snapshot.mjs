// Pobiera aktualną listę produktów z publicznego API starej strony (tylko GET, po kolei, z przerwą).
// Użycie: node snapshot.mjs <folder-zrodla>   ->   <folder-zrodla>/live/products.json
import path from "node:path";
import { STARA_STRONA, UA, arg, sleep, writeJson } from "./lib/wspolne.mjs";

const zrodla = arg(0, undefined, "Użycie: node snapshot.mjs <folder-zrodla>");
const out = path.join(zrodla, "live", "products.json");
const COUNT = 100;
const PAUSE = 300;

async function page(n) {
  const url = `${STARA_STRONA}/api/products?page=${n}&count=${COUNT}&sort=newest`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length > 50_000_000) throw new Error("za duża odpowiedź");
      const body = JSON.parse(text);
      if (!body || !Array.isArray(body.products) || typeof body.total !== "number") throw new Error("nieoczekiwany format odpowiedzi");
      return body;
    } catch (error) {
      if (attempt >= 5) throw new Error(`Strona ${n}: ${error.message}`);
      console.log(`Strona ${n}: ${error.message} – ponawiam (${attempt}/4)`);
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

const byId = new Map();
let total = 0;
let duplicates = 0;
for (let n = 1; ; n++) {
  const body = await page(n);
  total = body.total;
  for (const p of body.products) {
    if (typeof p?.id !== "number") continue;
    if (byId.has(p.id)) duplicates++;
    byId.set(p.id, p);
  }
  console.log(`Strona ${n}: +${body.products.length} (razem ${byId.size}/${total})`);
  if (body.products.length < COUNT || byId.size >= total || n > Math.ceil(total / COUNT) + 5) break;
  await sleep(PAUSE);
}

const products = [...byId.values()];
writeJson(out, { fetchedAt: new Date().toISOString(), source: `${STARA_STRONA}/api/products`, total, products });
console.log(`Zapisano ${products.length} produktów (API podaje total=${total}) do ${out}`);
if (duplicates) console.log(`Uwaga: ${duplicates} powtórzeń między stronami (lista zmieniała się w trakcie pobierania?)`);
if (products.length !== total) console.log(`Uwaga: liczba pobranych (${products.length}) różni się od total (${total}) – uruchom ponownie.`);
