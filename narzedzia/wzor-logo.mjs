// Wzór z logo kozła do okładek produktów (maska folii holograficznej w HoloCard).
// Kafelek powtarzalny: dwa kozły po przekątnej, kanał alfa = jasne linie logo (rogi, pysk), więc folia
// prześwituje przez rysunek kozła, a nie przez cały kształt serca.
// Wejście: zrodla/orig/static/goat.png, wyjście: strona/public/goat-pattern.png
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "zrodla/orig/static/goat.png");
const output = path.join(root, "strona/public/goat-pattern.png");

const TILE = 360;
const LOGO = 132;

// alfa = jasność logo × jego własna alfa, z podbitym kontrastem
const { data, info } = await sharp(input).resize(LOGO, LOGO, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const [r, g, b, a] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const v = Math.max(0, Math.min(1, (lum - 0.12) * 1.5)) * (a / 255);
  mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = 255;
  mask[i * 4 + 3] = Math.round(v * 255);
}
const logo = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 4 } })
  .rotate(-12, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const meta = await sharp(logo).metadata();
const at = (c) => Math.round(c - meta.width / 2);

await sharp({ create: { width: TILE, height: TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([
    { input: logo, left: at(TILE / 4), top: at(TILE / 4) },
    { input: logo, left: at((TILE * 3) / 4), top: at((TILE * 3) / 4) },
  ])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`zapisano ${path.relative(root, output)}`);
