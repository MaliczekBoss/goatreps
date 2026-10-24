// Robi naklejkę z logo kozła (biała obwódka po kształcie) do efektu StickerPeel w hero.
// Wejście: zrodla/orig/static/goat.png (128 px), wyjście: strona/public/goat-sticker.png (512 px).
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "zrodla/orig/static/goat.png");
const output = path.join(root, "strona/public/goat-sticker.png");

const SIZE = 512;
const ART = 400; // logo w środku, reszta to obwódka i margines
const BORDER = 30; // zasięg białej obwódki w px

const art = await sharp(input)
  .resize(ART, ART, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const offset = (SIZE - ART) / 2;
const placed = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: art, left: offset, top: offset }])
  .png()
  .toBuffer();

// obwódka: kanał alfa rozmyty i progowany = kształt powiększony o BORDER
// (osobne przebiegi – sharp wykonuje operacje w stałej kolejności i trzyma jedno blur na potok)
const spread = await sharp(placed).extractChannel(3).blur(BORDER / 2).png().toBuffer();
const grown = await sharp(spread).threshold(3).png().toBuffer();
const alpha = await sharp(grown).blur(1.2).png().toBuffer();
const white = await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: { r: 250, g: 250, b: 250 } } })
  .joinChannel(alpha)
  .png()
  .toBuffer();

await sharp(white)
  .composite([{ input: placed }])
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`zapisano ${path.relative(root, output)}`);
