// Kursy walut KakoBuy → strona/data/kursy.json (strona przelicza po nich ceny z juanów, tak jak kasa KakoBuy).
//
// API KakoBuy jest szyfrowane, ale ich strona po załadowaniu sama zapisuje odszyfrowaną listę kursów
// w localStorage ("currencies_list"). Skrypt otwiera kakobuy.com w ukrytej przeglądarce (Edge/Chrome/Chromium)
// i ją odczytuje – nic nie łamiemy, czytamy to, co widzi każdy odwiedzający.
//
// Użycie:  node kurs-kakobuy.mjs            (przeglądarka: zmienna BROWSER albo znana ścieżka Edge/Chrome/Chromium)
// Na serwerze najlepiej raz dziennie z crona – strona używa kursu do 3 dni, potem NBP z narzutem KakoBuy.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "strona", "data", "kursy.json");
const PAGE = "https://www.kakobuy.com/";
const NBP_URL = "https://api.nbp.pl/api/exchangerates/tables/A/?format=json";
const CODES = ["PLN", "EUR", "USD"];
// rozsądne widełki (ile danej waluty za 1 CNY) – chronią przed zapisaniem śmieci
const RANGE = { PLN: [0.3, 1.2], EUR: [0.06, 0.3], USD: [0.06, 0.3] };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/snap/bin/chromium",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("Nie znaleziono przeglądarki – ustaw zmienną BROWSER na ścieżkę do Chrome/Chromium/Edge.");
  return found;
}

async function readKakobuyRates() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(path.join(tmpdir(), "kurs-kakobuy-"));
  const proc = spawn(findBrowser(), ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], {
    stdio: "ignore",
  });
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      } catch {}
    }
    if (!target) throw new Error("przeglądarka nie wystartowała");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const i = ++id;
        pending.set(i, r);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    await send("Page.enable");
    await send("Page.navigate", { url: PAGE });
    // lista kursów pojawia się w localStorage po kilku sekundach
    let raw = null;
    for (let i = 0; i < 40 && !raw; i++) {
      await sleep(750);
      const r = await send("Runtime.evaluate", { expression: "localStorage.getItem('currencies_list')", returnByValue: true });
      raw = r.result?.result?.value ?? null;
    }
    ws.close();
    if (!raw) throw new Error("KakoBuy nie zapisał listy kursów (zmiana strony albo blokada)");
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error("nieoczekiwany format listy kursów");
    const rates = {};
    for (const code of CODES) {
      const v = Number(list.find((c) => c?.code === code)?.rate);
      const [lo, hi] = RANGE[code];
      if (!(v >= lo && v <= hi)) throw new Error(`podejrzany kurs ${code}: ${v}`);
      rates[code] = v;
    }
    return rates;
  } finally {
    proc.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  }
}

async function readNbp() {
  const res = await fetch(NBP_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`NBP HTTP ${res.status}`);
  const [table] = await res.json();
  const mid = (code) => table.rates.find((r) => r.code === code)?.mid ?? 0;
  const cny = mid("CNY");
  if (!(cny > 0)) throw new Error("NBP: brak kursu CNY");
  return { PLN: cny, EUR: cny / mid("EUR"), USD: cny / mid("USD"), date: table.effectiveDate };
}

const kakobuy = await readKakobuyRates();
const nbp = await readNbp().catch((e) => {
  console.warn("NBP niedostępny – zapisuję bez narzutu:", e.message);
  return null;
});
// narzut KakoBuy względem NBP – strona użyje go, gdy plik się zestarzeje (kurs NBP × narzut)
const markup = nbp ? Object.fromEntries(CODES.map((c) => [c, Math.round((kakobuy[c] / nbp[c]) * 10000) / 10000])) : null;
if (markup && Object.values(markup).some((m) => m < 0.9 || m > 1.4)) throw new Error(`podejrzany narzut względem NBP: ${JSON.stringify(markup)}`);

const out = { source: "KakoBuy", fetchedAt: new Date().toISOString(), rates: kakobuy, nbp, markup };
const tmp = `${OUT}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify(out, null, 2) + "\n");
renameSync(tmp, OUT);
console.log(`Kursy KakoBuy zapisane do ${path.relative(root, OUT)}:`);
for (const c of CODES) console.log(`  1 CNY = ${kakobuy[c]} ${c}${markup ? `  (NBP ${nbp[c].toFixed(4)}, narzut ${((markup[c] - 1) * 100).toFixed(1)}%)` : ""}`);
