// Zbiera stawki wysyłki ze starej strony (GET /api/shipping) i zapisuje statyczną tabelę
// dla kalkulatora nowej strony (nowa strona NIE odpytuje zewnętrznych API w trakcie działania).
//
// Użycie:
//   node wysylka.mjs [--zrodlo <baseUrl>] [--wyjscie <plik>] [--postep <plik>] [--przerwa <ms>] [--od-nowa]
//
//   --zrodlo   adres starej strony (domyślnie https://goatreps.com)
//   --wyjscie  plik wynikowy (domyślnie ../strona/data/shipping.json względem tego skryptu)
//   --postep   plik postępu do wznawiania (domyślnie ./wysylka-postep.json obok skryptu)
//   --przerwa  odstęp między zapytaniami w ms (min. 1000, domyślnie 1000)
//   --od-nowa  ignoruje zapisany postęp i pobiera wszystko od początku
//
// Zapytania idą po kolei, z odstępem >= 1 s. Nieudane zapytanie (błąd sieci, timeout, HTTP 429/5xx,
// zły format) jest ponawiane najwyżej 2 razy z rosnącą przerwą, potem pomijane i zapisywane jako błąd.
// Po każdym punkcie postęp ląduje w pliku postępu – przerwany skrypt uruchomiony ponownie pobiera tylko
// brakujące/nieudane punkty. Plik postępu jest usuwany, gdy wszystkie punkty się udały.
// Kod wyjścia: 0 = komplet, 2 = zapisano z lukami, 1 = błąd krytyczny.
//
// Samodzielny: tylko wbudowane moduły Node (>= 22, testowane na 24).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KATALOG_SKRYPTU = path.dirname(fileURLToPath(import.meta.url));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// Kraje i polskie nazwy – jak w kalkulatorze starej strony (p_shipping-*.js, i18n shipping.countries).
const KRAJE = [
  { code: "PL", name: "Polska" },
  { code: "DE", name: "Niemcy" },
  { code: "FR", name: "Francja" },
  { code: "GB", name: "Wielka Brytania" },
  { code: "CZ", name: "Czechy" },
  { code: "SK", name: "Słowacja" },
  { code: "HU", name: "Węgry" },
  { code: "RO", name: "Rumunia" },
  { code: "US", name: "USA" },
];

// 250, 500, 750, 1000, potem co 500 g do 10 000, plus 12 500, 15 000, 20 000 (razem 25 wag).
const WAGI = [250, 500, 750, 1000];
for (let w = 1500; w <= 10000; w += 500) WAGI.push(w);
WAGI.push(12500, 15000, 20000);

const POZIOMY = ["express", "standard", "economy"];
const MAX_PONOWIEN = 2;
const TIMEOUT_MS = 30_000;
const MAX_ODPOWIEDZ = 1_000_000;

// ---------- argumenty ----------

function pomoc(kod = 0) {
  console.log(
    [
      "Użycie: node wysylka.mjs [--zrodlo <baseUrl>] [--wyjscie <plik>] [--postep <plik>] [--przerwa <ms>] [--od-nowa]",
      "  --zrodlo   adres starej strony (domyślnie https://goatreps.com)",
      "  --wyjscie  plik wynikowy (domyślnie ../strona/data/shipping.json)",
      "  --postep   plik postępu (domyślnie ./wysylka-postep.json)",
      "  --przerwa  odstęp między zapytaniami w ms (min. 1000)",
      "  --od-nowa  ignoruj zapisany postęp",
    ].join("\n"),
  );
  process.exit(kod);
}

function parsujArgumenty(argv) {
  const opcje = {
    zrodlo: "https://goatreps.com",
    wyjscie: path.resolve(KATALOG_SKRYPTU, "..", "strona", "data", "shipping.json"),
    postep: path.resolve(KATALOG_SKRYPTU, "wysylka-postep.json"),
    przerwa: 1000,
    odNowa: false,
  };
  const wartosc = (i, nazwa) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      console.error(`Brak wartości dla --${nazwa}.`);
      pomoc(1);
    }
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--zrodlo") opcje.zrodlo = wartosc(i++, "zrodlo");
    else if (a.startsWith("--zrodlo=")) opcje.zrodlo = a.slice(9);
    else if (a === "--wyjscie") opcje.wyjscie = path.resolve(wartosc(i++, "wyjscie"));
    else if (a === "--postep") opcje.postep = path.resolve(wartosc(i++, "postep"));
    else if (a === "--przerwa") opcje.przerwa = Number(wartosc(i++, "przerwa"));
    else if (a === "--od-nowa") opcje.odNowa = true;
    else if (a === "--pomoc" || a === "--help" || a === "-h") pomoc(0);
    else {
      console.error(`Nieznany argument: ${a}`);
      pomoc(1);
    }
  }
  let url;
  try {
    url = new URL(opcje.zrodlo);
  } catch {
    console.error(`Nieprawidłowy adres --zrodlo: ${opcje.zrodlo}`);
    process.exit(1);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    console.error(`--zrodlo musi być adresem http(s): ${opcje.zrodlo}`);
    process.exit(1);
  }
  opcje.zrodlo = url.origin + url.pathname.replace(/\/+$/, "");
  if (!Number.isFinite(opcje.przerwa)) opcje.przerwa = 1000;
  opcje.przerwa = Math.max(1000, Math.round(opcje.przerwa));
  return opcje;
}

// ---------- pomocnicze ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function zapiszAtomowo(plik, tekst) {
  mkdirSync(path.dirname(plik), { recursive: true });
  writeFileSync(`${plik}.tmp`, tekst);
  renameSync(`${plik}.tmp`, plik);
}

const klucz = (kraj, waga) => `${kraj}:${waga}`;

function wczytajPostep(opcje) {
  const pusty = { wersja: 1, zrodlo: opcje.zrodlo, punkty: {}, bledy: {} };
  if (opcje.odNowa || !existsSync(opcje.postep)) return pusty;
  try {
    const p = JSON.parse(readFileSync(opcje.postep, "utf8"));
    if (p?.wersja !== 1 || typeof p.punkty !== "object" || p.punkty === null) throw new Error("nieznany format");
    if (p.zrodlo !== opcje.zrodlo) {
      console.log(`Plik postępu dotyczy innego źródła (${p.zrodlo}) – zaczynam od nowa.`);
      return pusty;
    }
    p.bledy = p.bledy && typeof p.bledy === "object" ? p.bledy : {};
    return p;
  } catch (e) {
    console.log(`Nie udało się odczytać pliku postępu (${e.message}) – zaczynam od nowa.`);
    return pusty;
  }
}

// Spłaszcza express/standard/economy do listy opcji: deduplikacja po nazwie (zostaje najtańsza),
// sortowanie po cenie rosnąco. Cena = originalPrice (liczba), a gdy jej brak – price. Waluta: USD.
function splaszcz(odp) {
  const najtansze = new Map();
  for (const poziom of POZIOMY) {
    const e = odp?.[poziom];
    if (!e || typeof e !== "object") continue;
    const name = typeof e.name === "string" ? e.name.replace(/\s+/g, " ").trim() : "";
    if (!name) continue;
    let price = Number.parseFloat(e.originalPrice);
    if (!Number.isFinite(price) || price <= 0) price = Number(e.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    price = Math.round(price * 100) / 100;
    const days = typeof e.days === "string" ? e.days.trim() : e.days == null ? "" : String(e.days);
    const dotychczas = najtansze.get(name);
    if (!dotychczas || price < dotychczas.price) najtansze.set(name, { name, price, days });
  }
  return [...najtansze.values()].sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

class BladZapytania extends Error {
  constructor(message, { status = null, ponawiaj = true, czekaj = 0 } = {}) {
    super(message);
    this.status = status;
    this.ponawiaj = ponawiaj;
    this.czekaj = czekaj;
  }
}

async function pobierzRaz(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const powod = e?.name === "TimeoutError" ? `przekroczono czas ${TIMEOUT_MS / 1000} s` : e?.cause?.code || e?.message || String(e);
    throw new BladZapytania(`błąd sieci: ${powod}`);
  }
  const tekst = await res.text().catch(() => "");
  if (!res.ok) {
    let opis = "";
    try {
      opis = JSON.parse(tekst)?.error ?? "";
    } catch {}
    const ponawiaj = res.status === 429 || res.status >= 500;
    let czekaj = 0;
    if (res.status === 429) {
      const ra = Number(res.headers.get("retry-after"));
      czekaj = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 60_000) : 10_000;
    }
    throw new BladZapytania(`HTTP ${res.status}${opis ? ` (${String(opis).slice(0, 120)})` : ""}`, { status: res.status, ponawiaj, czekaj });
  }
  if (tekst.length > MAX_ODPOWIEDZ) throw new BladZapytania("za duża odpowiedź", { status: res.status });
  let body;
  try {
    body = JSON.parse(tekst);
  } catch {
    throw new BladZapytania("odpowiedź nie jest poprawnym JSON-em", { status: res.status });
  }
  const options = splaszcz(body);
  if (!options.length) throw new BladZapytania("brak opcji wysyłki w odpowiedzi", { status: res.status });
  return options;
}

// ---------- główna pętla ----------

const opcje = parsujArgumenty(process.argv.slice(2));
const postep = wczytajPostep(opcje);
const zapiszPostep = () => zapiszAtomowo(opcje.postep, JSON.stringify(postep, null, 2) + "\n");

const wszystkie = KRAJE.flatMap((k) => WAGI.map((w) => ({ kraj: k.code, waga: w })));
const doPobrania = wszystkie.filter(({ kraj, waga }) => !postep.punkty[klucz(kraj, waga)]);

console.log(`Źródło: ${opcje.zrodlo}/api/shipping`);
console.log(`Punkty: ${wszystkie.length} (${KRAJE.length} krajów × ${WAGI.length} wag), do pobrania: ${doPobrania.length}, przerwa: ${opcje.przerwa} ms`);
if (doPobrania.length < wszystkie.length) console.log(`Wznawiam – ${wszystkie.length - doPobrania.length} punktów jest już w ${opcje.postep}`);

let przerwano = false;
process.on("SIGINT", () => {
  if (przerwano) process.exit(130);
  przerwano = true;
  console.log("\nPrzerywam po bieżącym zapytaniu… (postęp jest zapisany, uruchom ponownie, aby wznowić)");
});

const start = Date.now();
let ostatnieZapytanie = 0;
let nr = 0;
for (const { kraj, waga } of doPobrania) {
  if (przerwano) break;
  nr++;
  const url = `${opcje.zrodlo}/api/shipping?country=${kraj}&weight=${waga}&agent=kakobuy`;
  const k = klucz(kraj, waga);
  let wynik = null;
  let ostatniBlad = null;
  for (let proba = 0; proba <= MAX_PONOWIEN; proba++) {
    const odczekaj = ostatnieZapytanie + opcje.przerwa - Date.now();
    if (odczekaj > 0) await sleep(odczekaj);
    try {
      wynik = await pobierzRaz(url);
      ostatnieZapytanie = Date.now();
      break;
    } catch (e) {
      ostatnieZapytanie = Date.now();
      ostatniBlad = e;
      if (!e.ponawiaj || proba === MAX_PONOWIEN || przerwano) break;
      const backoff = Math.max(e.czekaj, 2000 * 2 ** proba); // 2 s, 4 s (dla 429 co najmniej Retry-After / 10 s)
      console.log(`  ${kraj} ${waga} g: ${e.message} – ponawiam za ${Math.round(backoff / 1000)} s (${proba + 1}/${MAX_PONOWIEN})`);
      await sleep(backoff);
    }
  }
  const eta = Math.round(((Date.now() - start) / nr) * (doPobrania.length - nr) / 1000);
  if (wynik) {
    postep.punkty[k] = { weight: waga, options: wynik, pobrano: new Date().toISOString() };
    delete postep.bledy[k];
    const najtansza = wynik[0];
    console.log(
      `[${nr}/${doPobrania.length}] ${kraj} ${String(waga).padStart(5)} g: ${wynik.length} opcje, od ${najtansza.price} USD (${najtansza.name}) – zostało ok. ${Math.floor(eta / 60)} min ${eta % 60} s`,
    );
  } else {
    postep.bledy[k] = { kraj, waga, status: ostatniBlad?.status ?? null, blad: ostatniBlad?.message ?? "nieznany błąd", czas: new Date().toISOString() };
    console.log(`[${nr}/${doPobrania.length}] ${kraj} ${String(waga).padStart(5)} g: POMINIĘTO – ${postep.bledy[k].blad}`);
  }
  zapiszPostep();
}

// ---------- wynik ----------

if (przerwano) {
  const ile = Object.keys(postep.punkty).length;
  console.log(`Przerwano: ${ile}/${wszystkie.length} punktów w ${opcje.postep}. Plik wynikowy nie został zmieniony – uruchom ponownie, aby dokończyć.`);
  process.exit(130);
}

const rates = {};
let zebrane = 0;
for (const { code } of KRAJE) {
  rates[code] = WAGI.filter((w) => postep.punkty[klucz(code, w)]).map((w) => {
    const p = postep.punkty[klucz(code, w)];
    return { weight: p.weight, options: p.options.map(({ name, price, days }) => ({ name, price, days })) };
  });
  zebrane += rates[code].length;
}

if (zebrane === 0) {
  console.error("Nie zebrano żadnego punktu – nie nadpisuję pliku wynikowego.");
  process.exit(1);
}

const wynik = { updatedAt: new Date().toISOString(), currency: "USD", countries: KRAJE, rates };
zapiszAtomowo(opcje.wyjscie, JSON.stringify(wynik, null, 2) + "\n");

console.log(`\nZapisano ${opcje.wyjscie}`);
for (const { code, name } of KRAJE) {
  const braki = WAGI.filter((w) => !postep.punkty[klucz(code, w)]);
  console.log(`  ${code} ${name}: ${rates[code].length}/${WAGI.length} punktów${braki.length ? ` – brak: ${braki.join(", ")} g` : ""}`);
}

const bledy = Object.values(postep.bledy);
const brakujace = wszystkie.length - zebrane;
if (brakujace === 0) {
  rmSync(opcje.postep, { force: true });
  console.log(`Komplet: ${zebrane}/${wszystkie.length} punktów. Plik postępu usunięty.`);
  process.exit(0);
}
console.log(`\nLuki: ${brakujace} z ${wszystkie.length} punktów. Błędy zapisane w ${opcje.postep}:`);
for (const b of bledy) console.log(`  ${b.kraj} ${b.waga} g: ${b.blad}`);
console.log("Uruchom skrypt ponownie, aby spróbować pobrać brakujące punkty.");
process.exit(2);
