// Składa paczkę do wgrania na Pterodactyl w folderze do-wyslania/ (obok strona/):
//   do-wyslania/goatreps/        – strona gotowa do wgrania (bez node_modules, .next, sekretów), z seed/ do MongoDB
//   do-wyslania/goatreps.zip     – to samo spakowane (do wgrania przez menedżer plików panelu i "Unarchive")
//   do-wyslania/cdn.tar          – zdjęcia (i/, t/, q/, p/, c/, a/, b/) bez kompresji – rozpakować obok index.js
//   do-wyslania/PTERODACTYL.md   – instrukcja (kopiowana z narzedzia/szablony/PTERODACTYL.md)
// Użycie: node paczka.mjs [--bez-zdjec]
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "strona");
const out = path.join(root, "do-wyslania");
const app = path.join(out, "goatreps");
const withImages = !process.argv.includes("--bez-zdjec");

// czego nie wysyłamy: zależności i build (serwer robi je sam), sekrety, pliki zapisywane w trakcie działania
const SKIP_DIRS = new Set(["node_modules", ".next", ".goatreps", "seed", "cdn", ".vercel", "coverage"]);
const SKIP_FILE = (name) =>
  /^\.env(?!\.example$)/.test(name) ||
  /\.tsbuildinfo$/.test(name) ||
  name === "next-env.d.ts" ||
  /\.tmp$/.test(name) ||
  /^statystyki\.json/.test(name) ||
  name === "ceny.json" ||
  name === "kursy.json";

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
function size(dir) {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? size(p) : statSync(p).size;
  }
  return total;
}

console.log("Składam paczkę w do-wyslania/ …");
rmSync(app, { recursive: true, force: true });
rmSync(path.join(out, "goatreps.zip"), { force: true });
mkdirSync(app, { recursive: true });

cpSync(site, app, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(site, src);
    if (!rel) return true;
    const parts = rel.split(path.sep);
    if (parts.some((p) => SKIP_DIRS.has(p))) return false;
    return !SKIP_FILE(path.basename(src));
  },
});

// obecne dane do pierwszego wgrania do MongoDB (ceny i statystyki z lokalnego serwera)
mkdirSync(path.join(app, "seed"), { recursive: true });
for (const name of ["ceny.json", "statystyki.json"]) {
  const from = path.join(site, "data", name);
  if (existsSync(from)) copyFileSync(from, path.join(app, "seed", name));
}

copyFileSync(path.join(root, "narzedzia", "szablony", "PTERODACTYL.md"), path.join(out, "PTERODACTYL.md"));

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
