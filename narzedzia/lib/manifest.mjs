// Spis plików folderu CDN (manifest.json) + kopia instrukcji wysyłki README-S3.md.
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJson } from "./wspolne.mjs";

const SKIP = new Set(["manifest.json", "README-S3.md"]);
const template = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "szablony", "README-S3.md");

export function writeManifest(cdnDir) {
  const files = {};
  const folders = {};
  let bytes = 0;
  const walk = (dir, rel) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relPath);
      else if (!SKIP.has(relPath) && !entry.name.endsWith(".tmp")) {
        const size = statSync(path.join(dir, entry.name)).size;
        files[relPath] = size;
        bytes += size;
        const top = relPath.includes("/") ? relPath.split("/")[0] : ".";
        folders[top] ??= { files: 0, bytes: 0 };
        folders[top].files++;
        folders[top].bytes += size;
      }
    }
  };
  if (existsSync(cdnDir)) walk(cdnDir, "");
  writeJson(path.join(cdnDir, "manifest.json"), { generatedAt: new Date().toISOString(), totalFiles: Object.keys(files).length, totalBytes: bytes, folders, files });
  if (existsSync(template)) copyFileSync(template, path.join(cdnDir, "README-S3.md"));
  return { count: Object.keys(files).length, bytes, folders };
}

export const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
