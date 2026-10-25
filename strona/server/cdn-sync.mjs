// Wgranie zdjęć z folderu cdn/ do bucketu S3 (Garage) – w tle po starcie strony (server/start.mjs), tylko brakujące pliki.
// Po wgraniu strona podaje zdjęcia z bucketu (trasa /cdn/…), a folder cdn/ na serwerze można usunąć.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { listKeys, putObject, s3Config } from "../src/lib/s3.mjs";

const DIRS = ["i", "t", "q", "p", "c", "a", "b"];
const FILE = /^[a-z0-9_-]{1,64}\.(webp|png)$/;
const PARALLEL = 8;

/** Folder ze zdjęciami jak w src/lib/cdn-dir.ts: CDN_DIR, cdn/ obok strony albo ../cdn. */
function cdnDir(root) {
  if (process.env.CDN_DIR) return path.resolve(process.env.CDN_DIR);
  const inside = path.join(root, "cdn");
  return existsSync(inside) ? inside : path.resolve(root, "..", "cdn");
}

export async function syncCdn(root, log) {
  const cfg = s3Config(process.env);
  if (!cfg) return;
  const dir = cdnDir(root);
  if (!existsSync(path.join(dir, "i"))) {
    log(`Zdjęcia z S3 (${cfg.endpoint}/${cfg.bucket}) – brak folderu cdn/ do wgrania.`);
    return;
  }
  const local = DIRS.flatMap((d) => (existsSync(path.join(dir, d)) ? readdirSync(path.join(dir, d)).filter((f) => FILE.test(f)).map((f) => `${d}/${f}`) : []));
  let remote;
  try {
    remote = await listKeys(cfg);
  } catch (error) {
    log(`S3 niedostępne (${cfg.endpoint}/${cfg.bucket}): ${error.message} – zdjęcia idą z dysku.`);
    return;
  }
  const missing = local.filter((key) => !remote.has(key));
  if (!missing.length) {
    log(`Zdjęcia w S3: komplet (${local.length} plików w ${cfg.bucket}). Folder cdn/ na serwerze nie jest już potrzebny.`);
    return;
  }
  log(`Wgrywam ${missing.length} zdjęć do S3 (${cfg.bucket}; już jest ${local.length - missing.length})…`);
  let done = 0;
  let failed = 0;
  let lastError = "";
  const step = Math.max(500, Math.ceil(missing.length / 10));
  let next = 0;
  let aborted = false;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (!aborted && next < missing.length) {
        const key = missing[next++];
        try {
          await putObject(cfg, key, readFileSync(path.join(dir, key)), key.endsWith(".png") ? "image/png" : "image/webp");
          done++;
        } catch (error) {
          failed++;
          lastError = error.message;
          // nic nie przechodzi (brak prawa zapisu, zły klucz) – nie ma sensu próbować tysięcy plików
          if (failed >= 20 && done === 0) aborted = true;
        }
        if ((done + failed) % step === 0) log(`S3: ${done + failed}/${missing.length}…`);
      }
    }),
  );
  if (aborted) {
    log(`Wgrywanie zdjęć do S3 przerwane – zapis nie działa: ${lastError}. Zdjęcia idą z dysku.`);
    return;
  }
  log(
    failed
      ? `S3: wgrano ${done}, nie udało się ${failed} (np. ${lastError}) – przy następnym starcie spróbuję ponownie.`
      : `S3: wgrano ${done} zdjęć. Strona bierze je teraz z bucketu ${cfg.bucket} – folder cdn/ na serwerze można usunąć.`,
  );
}
