// Logo KakoBuy z napisem (ze starej strony): przycięte marginesy, rozjaśnione na ciemne tło, 128×128 z małym marginesem.
import sharp from "sharp";
const [src, out] = process.argv.slice(2);
const trimmed = await sharp(src).trim({ threshold: 10 }).toBuffer();
const lighter = await sharp(trimmed).modulate({ brightness: 1.55 }).toBuffer();
const meta = await sharp(lighter).metadata();
console.log("po przycięciu:", meta.width, "x", meta.height);
await sharp(lighter)
  .resize({ width: 112, height: 112, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 92 })
  .toFile(out);
console.log("zapisano", out);
