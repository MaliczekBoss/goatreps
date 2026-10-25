// Start goatreps na Pterodactyl (albo dowolnym serwerze z Node 22/24) – jednym plikiem, bez komend npm:
//  1. instaluje paczki (npm ci), gdy zmienił się package-lock.json,
//  2. przy pierwszym starcie wgrywa dane z seed/ do pustej bazy MongoDB,
//  3. buduje stronę, gdy zmieniły się jej pliki albo .env,
//  4. uruchamia stronę na porcie z SERVER_PORT (server/serve.mjs: Next.js za blokadą ruchu spoza Cloudflare),
//  5. co 6 h sprawdza nowy kurs KakoBuy (server/kursy.mjs – plik odświeżany raz w tygodniu przez GitHub Actions).
// Kilka instancji (HA) na wspólnym dysku: blokady w .goatreps/ – buduje jedna, reszta czeka na gotową wersję.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const log = (message) => console.log(`[goatreps] ${new Date().toISOString().slice(0, 19).replace("T", " ")} ${message}`);
const port = String(process.env.SERVER_PORT || process.env.PORT || 3000);
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const stateDir = path.join(root, ".goatreps");
mkdirSync(stateDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readState = (name) => {
  try {
    return readFileSync(path.join(stateDir, name), "utf8").trim();
  } catch {
    return "";
  }
};
const writeState = (name, value) => writeFileSync(path.join(stateDir, name), value);

/** Blokada na plik – przy wspólnym dysku kilku instancji tylko jedna instaluje albo buduje. */
async function withLock(name, done, work) {
  const lock = path.join(stateDir, `${name}.lock`);
  for (;;) {
    if (done()) return;
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      const age = existsSync(lock) ? Date.now() - statSync(lock).mtimeMs : 0;
      if (age > 30 * 60_000) rmSync(lock, { force: true });
      else {
        log(`Czekam, aż inna kopia skończy: ${name}…`);
        await sleep(5000);
      }
    }
  }
  try {
    if (!done()) await work();
  } finally {
    rmSync(lock, { force: true });
  }
}

/** Suma kontrolna plików i folderów – zmiana = trzeba przebudować / doinstalować. */
function hashOf(entries) {
  const hash = createHash("sha256");
  const walk = (full) => {
    if (!existsSync(full)) return;
    if (statSync(full).isDirectory()) {
      for (const name of readdirSync(full).sort()) walk(path.join(full, name));
      return;
    }
    hash.update(path.relative(root, full).replaceAll("\\", "/"));
    hash.update(readFileSync(full));
  };
  for (const entry of entries) walk(path.join(root, entry));
  return hash.digest("hex");
}

function npm(args) {
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, NODE_ENV: "development" } });
  return result.status === 0;
}

async function ensureDependencies() {
  const lock = hashOf(["package.json", "package-lock.json"]);
  const ready = () => existsSync(nextBin) && existsSync(path.join(root, "node_modules", "typescript")) && readState("dependencies") === lock;
  await withLock("install", ready, async () => {
    log("Instaluję zależności (npm ci)…");
    if (npm(["ci", "--include=dev", "--no-audit", "--no-fund"]) || npm(["install", "--include=dev", "--no-audit", "--no-fund"])) {
      writeState("dependencies", lock);
      return;
    }
    if (!existsSync(nextBin)) {
      log("Nie udało się zainstalować zależności – sprawdź, czy serwer ma dostęp do internetu (registry.npmjs.org).");
      process.exit(1);
    }
    log("Instalacja się nie udała, używam zależności, które już są.");
  });
}

function loadEnv() {
  const require = createRequire(path.join(root, "package.json"));
  require("@next/env").loadEnvConfig(root, false);
}

// Pliki, od których zależy zbudowana strona (dane z data/ są czytane w trakcie działania, ale część trafia do builda).
const SOURCES = [
  "src",
  "public",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "data/products.json",
  "data/categories.json",
  "data/shipping.json",
  "data/qc.json",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

/** To samo na każdej instancji: identyfikator wersji i klucz szyfrowania akcji serwera (logowanie do panelu). */
function sharedBuildEnv(source) {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "";
  return {
    GOATREPS_DEPLOYMENT_ID: source.slice(0, 16),
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:
      process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || createHash("sha256").update(`goatreps-server-actions|${secret}|${source}`).digest("base64"),
  };
}

async function ensureBuild(source, env) {
  const ready = () => existsSync(path.join(root, ".next", "BUILD_ID")) && readState("build") === source;
  await withLock("build", ready, async () => {
    log("Buduję stronę (pierwszy start albo nowa wersja plików) – to potrwa kilka minut…");
    const result = spawnSync(process.execPath, [nextBin, "build"], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    });
    if (result.status !== 0) {
      log("Build się nie udał – szczegóły wyżej (najczęściej za mało RAM: na pierwszy start daj min. 2 GB).");
      process.exit(1);
    }
    writeState("build", source);
  });
}

const mongoReady = () => /^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI ?? "");

async function seedDatabase() {
  if (!mongoReady()) {
    log("Brak MONGODB_URI – strona działa bez bazy (statystyki i ceny w plikach w data/).");
    return;
  }
  try {
    const { seed } = await import("./mongo-seed.mjs");
    await seed(root, log);
  } catch (error) {
    log(`Wgrywanie danych do MongoDB nie powiodło się: ${error.message} – strona startuje mimo to.`);
  }
}

function cdnInfo() {
  if (process.env.NEXT_PUBLIC_CDN_URL) return log(`Zdjęcia z CDN: ${process.env.NEXT_PUBLIC_CDN_URL}`);
  const dir = process.env.CDN_DIR ? path.resolve(process.env.CDN_DIR) : path.join(root, "cdn");
  if (existsSync(path.join(dir, "i"))) log(`Zdjęcia z dysku: ${dir}`);
  else log(`UWAGA: nie ma folderu ze zdjęciami (${dir}) ani NEXT_PUBLIC_CDN_URL – strona będzie bez zdjęć. Wgraj cdn/ obok index.js.`);
}

await ensureDependencies();
loadEnv();
cdnInfo();
await seedDatabase();
const source = hashOf(SOURCES);
const shared = sharedBuildEnv(source);
await ensureBuild(source, shared);

log(`Uruchamiam serwer na porcie ${port}…`);
const server = spawn(process.execPath, [path.join(root, "server", "serve.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ...shared, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 1));

const { scheduleRates } = await import("./kursy.mjs");
scheduleRates(root, log);
