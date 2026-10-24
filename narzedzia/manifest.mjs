// Odświeża <cdn>/manifest.json (spis plików z rozmiarami) i <cdn>/README-S3.md.
// Użycie: node manifest.mjs <folder-cdn>
import { mb, writeManifest } from "./lib/manifest.mjs";
import { arg } from "./lib/wspolne.mjs";

const cdn = arg(0, undefined, "Użycie: node manifest.mjs <folder-cdn>");
const m = writeManifest(cdn);
console.log(`manifest.json: ${m.count} plików, ${mb(m.bytes)} – ${Object.entries(m.folders).map(([f, s]) => `${f}/ ${s.files} (${mb(s.bytes)})`).join(", ")}`);
