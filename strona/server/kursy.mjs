// Kurs KakoBuy na serwerze (Pterodactyl): co 6 h sprawdzamy plik z kursami na GitHubie i zapisujemy nowszy do data/kursy.json –
// strona wczytuje go sama, bez restartu. Plik raz w tygodniu odświeża GitHub Actions (.github/workflows/kurs-kakobuy.yml)
// skryptem narzedzia/kurs-kakobuy.mjs: KakoBuy pokazuje kursy tylko w przeglądarce, a w kontenerze jej nie ma.
// KURSY_URL=off wyłącza pobieranie (strona liczy wtedy po pliku z paczki, a gdy się zestarzeje – NBP z narzutem KakoBuy).
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_URL = "https://raw.githubusercontent.com/MaliczekBoss/goatreps/main/strona/data/kursy.json";
const EVERY_MS = 6 * 60 * 60 * 1000;
const MAX_BYTES = 20_000;
// te same widełki co w src/lib/rates.ts (ile danej waluty za 1 CNY)
const RANGE = { PLN: [0.3, 1.2], EUR: [0.06, 0.3], USD: [0.06, 0.3] };

const timeOf = (data) => Date.parse(String(data?.fetchedAt));
const valid = (data) =>
  Number.isFinite(timeOf(data)) &&
  timeOf(data) <= Date.now() + 60 * 60 * 1000 &&
  Object.entries(RANGE).every(([code, [lo, hi]]) => typeof data?.rates?.[code] === "number" && data.rates[code] >= lo && data.rates[code] <= hi);

/** { PLN, EUR, USD } z samych liczb dodatnich albo null. */
function numbers(obj) {
  if (!obj || typeof obj !== "object") return null;
  const out = {};
  for (const code of Object.keys(RANGE)) {
    const v = obj[code];
    if (typeof v !== "number" || !(v > 0) || !Number.isFinite(v)) return null;
    out[code] = v;
  }
  return out;
}

function readLocal(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function updateRates(root, log) {
  const url = (process.env.KURSY_URL ?? "").trim() || DEFAULT_URL;
  if (url === "off") return;
  const file = path.join(root, "data", "kursy.json");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "application/json" }, redirect: "error" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error("plik jest za duży");
    const data = JSON.parse(text);
    if (!valid(data)) throw new Error("niepoprawne kursy w pliku");
    const current = readLocal(file);
    if (valid(current) && timeOf(current) >= timeOf(data)) return;
    // zapisujemy tylko znane pola – plik z sieci nie wstawi niczego innego
    const out = {
      source: "KakoBuy",
      fetchedAt: new Date(timeOf(data)).toISOString(),
      rates: { PLN: data.rates.PLN, EUR: data.rates.EUR, USD: data.rates.USD },
      nbp: numbers(data.nbp),
      markup: numbers(data.markup),
    };
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out, null, 2) + "\n");
    renameSync(tmp, file);
    log(`Kurs KakoBuy z ${out.fetchedAt.slice(0, 10)}: 1 CNY = ${out.rates.PLN} zł / ${out.rates.EUR} € / ${out.rates.USD} $`);
  } catch (error) {
    const host = URL.canParse(url) ? new URL(url).host : url;
    log(`Nie udało się pobrać kursu KakoBuy (${host}): ${error.message} – strona liczy dalej po ostatnim kursie.`);
  }
}

/** Od razu przy starcie, potem co 6 h. */
export function scheduleRates(root, log) {
  const run = () => updateRates(root, log);
  run();
  setInterval(run, EVERY_MS).unref();
}
