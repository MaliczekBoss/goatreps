import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Folder ze zdjęciami (i/, t/, q/, p/, …), gdy nie ma osobnego CDN (NEXT_PUBLIC_CDN_URL):
 * CDN_DIR z .env, albo cdn/ w katalogu strony (Pterodactyl – wgrany obok index.js), albo ../cdn (układ repozytorium).
 */
export const CDN_DIR = (() => {
  if (process.env.CDN_DIR) return path.resolve(/*turbopackIgnore: true*/ process.env.CDN_DIR);
  const inside = path.join(/*turbopackIgnore: true*/ process.cwd(), "cdn");
  return existsSync(inside) ? inside : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "..", "cdn");
})();
