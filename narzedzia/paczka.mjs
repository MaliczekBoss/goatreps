// Składa paczkę do wgrania na Pterodactyl w folderze do-wyslania/ (obok strona/):
//   do-wyslania/goatreps/        – strona gotowa do wgrania (bez node_modules, .next, sekretów), z seed/ do MongoDB
//   do-wyslania/goatreps.zip     – to samo spakowane (do wgrania przez menedżer plików panelu i "Unarchive")
//   do-wyslania/cdn.tar          – zdjęcia (i/, t/, q/, p/, c/, a/, b/) bez kompresji – rozpakować obok index.js
//   do-wyslania/PTERODACTYL.md   – instrukcja (kopiowana z narzedzia/szablony/PTERODACTYL.md)
//   do-wyslania/pterodactyl.env  – gotowe ustawienia serwera (trafiają do paczki jako goatreps/.env)
//   do-wyslania/vercel.env       – te same ustawienia do wklejenia w Vercel → Settings → Environment Variables
// Pliki .env powstają raz (nowe hasło i klucz panelu, klucze AI z strona/.env.local); kolejne uruchomienia ich nie ruszają,
// więc to, co w nich dopiszesz (np. MONGODB_URI), zostaje. Nigdy nie trafiają do gita (do-wyslania/ jest w .gitignore).
// Użycie: node paczka.mjs [--bez-zdjec] [--bez-env]   (--bez-env: aktualizacja – paczka bez .env, nie nadpisze ustawień na serwerze)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "strona");
const out = path.join(root, "do-wyslania");
const app = path.join(out, "goatreps");
const withImages = !process.argv.includes("--bez-zdjec");
const withEnv = !process.argv.includes("--bez-env");

// czego nie wysyłamy: zależności i build (serwer robi je sam), sekrety, pliki zapisywane w trakcie działania
const SKIP_ANYWHERE = new Set(["node_modules", ".next"]);
// tylko w głównym folderze strony – np. src/app/cdn/ (trasa podająca zdjęcia) musi trafić do paczki
const SKIP_TOP = new Set([".goatreps", "seed", "cdn", ".vercel", "coverage"]);
const SKIP_FILE = (name) =>
  /^\.env(?!\.example$)/.test(name) ||
  /\.tsbuildinfo$/.test(name) ||
  name === "next-env.d.ts" ||
  /\.tmp$/.test(name) ||
  /^statystyki\.json/.test(name) ||
  name === "ceny.json";

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
function size(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? size(p) : statSync(p).size;
  }
  return total;
}

/** Zmienne z strona/.env.local (klucze AI) – wartości nigdy nie są wypisywane. */
function localEnv() {
  const file = path.join(site, ".env.local");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.trim()]),
  );
}

/** Ustawienia Cloudflare dla serwera (goatreps.com stoi za Cloudflare) – opis w PTERODACTYL.md, „Cloudflare”. */
const CLOUDFLARE_BLOCK =(originSecret) => `# --- Cloudflare (goatreps.com stoi za Cloudflare)
# Serwer przyjmuje tylko ruch z adresów Cloudflare: kto zna IP:port serwera, nie ominie Cloudflare (WAF, DDoS)
# ani nie podrobi adresu odwiedzającego. Do testu przez http://IP:PORT ustaw na chwilę 0.
CLOUDFLARE_ONLY=1
# Prawdziwy adres odwiedzającego (limity zapytań): x-real-ip ustawia sam serwer (od Cloudflare albo z połączenia)
TRUST_PROXY=x-real-ip
# (opcjonalnie, najmocniej) tajny nagłówek od Cloudflare: dodaj regułę z PTERODACTYL.md („Cloudflare”, krok 5),
# potem usuń # z linii niżej i zrestartuj serwer
# CF_ORIGIN_SECRET=${originSecret}
# Tylko na czas bez domeny (http://IP:PORT, CLOUDFLARE_ONLY=0): panel po zwykłym http – hasło idzie nieszyfrowane
# ADMIN_ALLOW_HTTP=1

# --- Zdjęcia w S3 (np. Garage na serwerze) – opcjonalnie: przy starcie serwer wgrywa brakujące zdjęcia z cdn/
# do bucketu, a strona podaje je pod /cdn/… (najpierw z dysku, potem z bucketu). Region dobiera się sam.
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=`;

/** Gotowe pliki ustawień – tworzone tylko, gdy ich jeszcze nie ma. */
function prepareEnv() {
  const local = localEnv();
  // hasło łatwe do przepisania (bez 0/O, 1/l/I), klucz sesji długi i losowy
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const password = [...randomBytes(22)].map((b) => alphabet[b % alphabet.length]).join("");
  const secret = randomBytes(36).toString("base64url");
  const ai = (k) => local[k] ?? "";
  const common = (proxy, cdnNote) => `# Panel /admin – hasło do logowania i klucz podpisujący sesje (zmiana klucza wylogowuje wszystkich)
ADMIN_PASSWORD=${password}
ADMIN_SECRET=${secret}

# Wyszukiwanie po zdjęciu (/photo-search) – klucze zostają na serwerze, nie trafiają do przeglądarki
OPENAI_BASE_URL=${ai("OPENAI_BASE_URL")}
OPENAI_API_KEY=${ai("OPENAI_API_KEY")}
GEMINI_API_KEY=${ai("GEMINI_API_KEY")}

NEXT_PUBLIC_SITE_URL=https://goatreps.com
${cdnNote}
${proxy}
`;
  const files = {
    "pterodactyl.env": `# goatreps.com – ustawienia serwera Pterodactyl (plik .env obok index.js). Wygenerowane przez narzedzia/paczka.mjs.
# Trzymaj tylko na serwerze i u siebie – nie wrzucaj do gita ani na Discorda. Opis zmiennych: PTERODACTYL.md.

# --- MongoDB: wpisz adres bazy, np. mongodb://UŻYTKOWNIK:HASŁO@HOST:27017/?authSource=admin
# Puste = strona działa bez bazy (statystyki i ceny w plikach w data/, sesje panelu w pamięci).
MONGODB_URI=
MONGODB_DB=goatreps

${common(
  CLOUDFLARE_BLOCK(randomBytes(32).toString("base64url")),
  "# Zdjęcia z folderu cdn/ obok index.js (rozpakowany cdn.tar) pod https://goatreps.com/cdn/… – Cloudflare trzyma je\n# w swoim cache (nagłówek na rok). Adres S3/R2 wpisz tylko, gdy zdjęcia są tam.\nNEXT_PUBLIC_CDN_URL=",
)}
# Kurs KakoBuy: serwer co 6 h pobiera plik odświeżany raz w tygodniu przez GitHub Actions (off = wyłączone)
# KURSY_URL=
`,
    "vercel.env": `# goatreps.com – ustawienia dla Vercela: Project → Settings → Environment Variables → wklej całą zawartość pliku.
# Wygenerowane przez narzedzia/paczka.mjs. Kurs KakoBuy na Vercelu odświeża się sam (co tydzień commit z GitHub Actions).

# --- MongoDB (opcjonalnie): bez bazy statystyki i ceny na Vercelu są tylko w pamięci i znikają przy nowej wersji.
MONGODB_URI=
MONGODB_DB=goatreps

${common(
  "# Prawdziwy adres odwiedzającego (limity zapytań, kraj w statystykach) – na Vercelu w tym nagłówku\nTRUST_PROXY=x-real-ip",
  "# WYMAGANE na Vercelu: adres S3/R2 z wgranym folderem cdn/ (zdjęć nie ma w repo), bez ukośnika na końcu\nNEXT_PUBLIC_CDN_URL=",
)}`,
  };
  // plik z wcześniejszej wersji paczki: dopisujemy ustawienia Cloudflare, reszta (hasła, MONGODB_URI) zostaje
  const ptero = path.join(out, "pterodactyl.env");
  if (existsSync(ptero) && !/^CLOUDFLARE_ONLY=/m.test(readFileSync(ptero, "utf8"))) {
    const old = readFileSync(ptero, "utf8");
    const block = CLOUDFLARE_BLOCK(randomBytes(32).toString("base64url"));
    const next = /^# Prawdziwy adres[^\n]*\nTRUST_PROXY=[^\n]*$/m.test(old)
      ? old.replace(/^# Prawdziwy adres[^\n]*\nTRUST_PROXY=[^\n]*$/m, block)
      : old.replace(/^TRUST_PROXY=.*$/m, "").trimEnd() + "\n\n" + block + "\n";
    writeFileSync(ptero, next);
    console.log("Dopisano ustawienia Cloudflare do do-wyslania/pterodactyl.env (hasła i MONGODB_URI bez zmian).");
  }
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(out, name);
    if (existsSync(file)) continue;
    writeFileSync(file, text);
    console.log(`Utworzono do-wyslania/${name} (nowe hasło i klucz panelu${ai("OPENAI_API_KEY") || ai("GEMINI_API_KEY") ? ", klucze AI" : ""}).`);
  }
}

console.log("Składam paczkę w do-wyslania/ …");
rmSync(app, { recursive: true, force: true });
rmSync(path.join(out, "goatreps.zip"), { force: true });
mkdirSync(app, { recursive: true });
prepareEnv();

cpSync(site, app, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(site, src);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    if (SKIP_TOP.has(parts[0]) || parts.some((p) => SKIP_ANYWHERE.has(p))) return false;
    return !SKIP_FILE(path.basename(src));
  },
});

// obecne dane do pierwszego wgrania do MongoDB (ceny i statystyki z lokalnego serwera)
mkdirSync(path.join(app, "seed"), { recursive: true });
for (const name of ["ceny.json", "statystyki.json"]) {
  const from = path.join(site, "data", name);
  if (existsSync(from)) copyFileSync(from, path.join(app, "seed", name));
}

// instrukcja z adresem serwera z pterodactyl.env (w repo jest tylko IP_SERWERA – adres serwera nie trafia do gita)
const serverHost = (() => {
  const env = existsSync(path.join(out, "pterodactyl.env")) ? readFileSync(path.join(out, "pterodactyl.env"), "utf8") : "";
  const url = /^S3_ENDPOINT=(\S+)/m.exec(env)?.[1] ?? /^MONGODB_URI=mongodb:\/\/(?:[^@\s]*@)?([^:/,\s]+)/m.exec(env)?.[1] ?? "";
  try {
    return url.includes("://") ? new URL(url).hostname : url;
  } catch {
    return "";
  }
})();
const guide = readFileSync(path.join(root, "narzedzia", "szablony", "PTERODACTYL.md"), "utf8");
writeFileSync(path.join(out, "PTERODACTYL.md"), serverHost ? guide.replaceAll("IP_SERWERA", serverHost) : guide);
// gotowe ustawienia w paczce – wgrywasz i startujesz (przy aktualizacji: --bez-env, żeby nie nadpisać .env na serwerze)
if (withEnv) copyFileSync(path.join(out, "pterodactyl.env"), path.join(app, ".env"));

// zip strony – tar.exe z Windows (bsdtar) umie zip; na Linuksie/macOS – zip
const zip = path.join(out, "goatreps.zip");
const winTar = "C:\\Windows\\System32\\tar.exe";
const zipped =
  process.platform === "win32" && existsSync(winTar)
    ? spawnSync(winTar, ["-a", "-c", "-f", zip, "goatreps"], { cwd: out, stdio: "inherit" })
    : spawnSync("zip", ["-qr", zip, "goatreps"], { cwd: out, stdio: "inherit" });
if (zipped.status !== 0) console.warn("Nie udało się spakować goatreps.zip – wgraj folder do-wyslania/goatreps/ przez SFTP.");

if (withImages) {
  const cdn = path.join(root, "cdn");
  const tarFile = path.join(out, "cdn.tar");
  rmSync(tarFile, { force: true });
  console.log(`Pakuję zdjęcia (${mb(size(cdn))}) do cdn.tar – bez kompresji, WebP i tak się nie kompresuje…`);
  const tar = spawnSync(process.platform === "win32" && existsSync(winTar) ? winTar : "tar", ["-c", "-f", tarFile, "cdn"], { cwd: root, stdio: "inherit" });
  if (tar.status !== 0) console.warn("Nie udało się spakować cdn.tar – wgraj folder cdn/ przez SFTP.");
}

console.log("\nGotowe:");
for (const name of readdirSync(out)) {
  const p = path.join(out, name);
  console.log(`  do-wyslania/${name}${statSync(p).isDirectory() ? "/" : ""}  ${mb(statSync(p).isDirectory() ? size(p) : statSync(p).size)}`);
}
