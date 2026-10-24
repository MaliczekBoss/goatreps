// Pobiera logo agentów (kolorowe) i konwertuje je do cdn/a.
// Użycie:
//   node logo-agentow.mjs odkryj <katalog-surowy>            -> pobiera HTML stron głównych i wypisuje kandydatów na logo
//   node logo-agentow.mjs pobierz <katalog-surowy> <plik.json> -> pobiera wskazane obrazy ({key: [url, ...]})
// Wszystko, co pobrane, to niezaufane dane - tylko zapis na dysk, bez wykonywania.
import fs from 'node:fs/promises';
import path from 'node:path';

const AGENCI = {
  kakobuy: 'https://www.kakobuy.com',
  usfans: 'https://www.usfans.com',
  allchinabuy: 'https://www.allchinabuy.com',
  acbuy: 'https://www.acbuy.com',
  litbuy: 'https://litbuy.com',
  cnfans: 'https://cnfans.com',
  mulebuy: 'https://mulebuy.com',
  oopbuy: 'https://oopbuy.com',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, accept) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, url: res.url, type: res.headers.get('content-type') || '', buf };
  } catch (e) {
    return { status: 0, url, type: '', buf: Buffer.alloc(0), error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([a-zA-Z_:\-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5];
  }
  return o;
}

function kandydaci(html, base) {
  const out = [];
  const abs = (u) => {
    try {
      return new URL(u, base).href;
    } catch {
      return null;
    }
  };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const rel = (a.rel || '').toLowerCase();
    if (/icon|manifest|mask-icon/.test(rel) && a.href) out.push({ kind: `link:${rel}`, sizes: a.sizes || '', url: abs(a.href) });
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const p = (a.property || a.name || '').toLowerCase();
    if (/og:image|twitter:image|msapplication-tileimage/.test(p) && a.content) out.push({ kind: `meta:${p}`, url: abs(a.content) });
  }
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const s = a.src || a['data-src'] || '';
    const blob = `${s} ${a.alt || ''} ${a.class || ''} ${a.id || ''}`.toLowerCase();
    if (/logo|brand/.test(blob) && s && !s.startsWith('data:')) out.push({ kind: 'img', alt: a.alt || '', cls: a.class || '', url: abs(s) });
  }
  // obrazy z nazwą "logo" w dowolnym miejscu (np. w JS/CSS)
  for (const m of html.matchAll(/["'(]([^"'()\s]*logo[^"'()\s]*\.(?:png|svg|webp|jpg|jpeg|ico))["')]/gi)) {
    out.push({ kind: 'ref', url: abs(m[1]) });
  }
  const seen = new Set();
  return out.filter((c) => c.url && !seen.has(c.url) && seen.add(c.url));
}

async function odkryj(dir) {
  const htmlDir = path.join(dir, 'html');
  await fs.mkdir(htmlDir, { recursive: true });
  const raport = {};
  for (const [key, site] of Object.entries(AGENCI)) {
    const r = await get(site + '/', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    const html = r.buf.toString('utf8');
    await fs.writeFile(path.join(htmlDir, `${key}.html.txt`), html);
    const blocked = /cf-chl|challenge-platform|Just a moment|Attention Required/i.test(html);
    const k = kandydaci(html, r.url || site);
    raport[key] = { status: r.status, finalUrl: r.url, bytes: r.buf.length, blocked, error: r.error, kandydaci: k };
    console.log(`\n== ${key} ${r.status} ${r.url} ${r.buf.length}B blocked=${blocked} ${r.error || ''}`);
    for (const c of k) console.log(`  ${c.kind} ${c.sizes || ''} ${c.alt ? 'alt=' + c.alt : ''} ${c.url}`);
    await sleep(4000);
  }
  await fs.writeFile(path.join(dir, 'odkrycie.json'), JSON.stringify(raport, null, 2));
}

async function pobierz(dir, listaPath) {
  const lista = JSON.parse(await fs.readFile(listaPath, 'utf8'));
  for (const [key, urls] of Object.entries(lista)) {
    const kd = path.join(dir, key);
    await fs.mkdir(kd, { recursive: true });
    for (const u of urls) {
      const r = await get(u, 'image/avif,image/webp,image/apng,image/svg+xml,image/*,application/json,*/*;q=0.8');
      const name = decodeURIComponent(new URL(u).pathname.split('/').pop() || 'index') || 'index';
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
      const out = path.join(kd, `${safe}.bin`);
      if (r.status === 200 && r.buf.length) await fs.writeFile(out, r.buf);
      const head = r.buf.subarray(0, 16).toString('hex');
      console.log(`${key} ${r.status} ${r.type} ${r.buf.length}B head=${head} ${u} ${r.error || ''}`);
      await sleep(2500);
    }
  }
}

// --- dekodowanie: ICO -> największa klatka (PNG albo 32-bit BMP) -> sharp ---
function icoNajwieksza(buf) {
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const n = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16;
    const w = buf[o] || 256;
    const h = buf[o + 1] || 256;
    const bpp = buf.readUInt16LE(o + 6);
    const size = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    if (off + size > buf.length) continue;
    if (!best || w * h > best.w * best.h || (w * h === best.w * best.h && bpp > best.bpp)) best = { w, h, bpp, size, off };
  }
  if (!best) return null;
  const data = buf.subarray(best.off, best.off + best.size);
  if (data.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { png: data };
  // DIB
  const hdr = data.readUInt32LE(0);
  const w = data.readInt32LE(4);
  const h = Math.abs(data.readInt32LE(8)) / 2;
  const bpp = data.readUInt16LE(14);
  if (bpp !== 32) throw new Error(`ICO BMP ${bpp}bpp nieobsługiwane`);
  const px = data.subarray(hdr);
  const raw = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = src + x * 4;
      const d = (y * w + x) * 4;
      raw[d] = px[s + 2];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s];
      raw[d + 3] = px[s + 3];
    }
  }
  return { raw, w, h };
}

async function wczytaj(file) {
  const sharp = (await import('sharp')).default;
  const buf = await fs.readFile(file);
  const head = buf.subarray(0, 64).toString('utf8').toLowerCase();
  if (/<!doctype html|<html/.test(head)) throw new Error('to jest HTML, nie obraz');
  if (buf.readUInt32LE(0) === 0x00010000) {
    const f = icoNajwieksza(buf);
    if (!f) throw new Error('zły ICO');
    if (f.png) return sharp(f.png);
    return sharp(f.raw, { raw: { width: f.w, height: f.h, channels: 4 } });
  }
  // SVG/PNG/WebP/JPEG - sharp rasteryzuje SVG (density dla ostrości)
  const isSvg = /<svg|<\?xml/.test(head);
  return sharp(buf, isSvg ? { density: 600 } : {});
}

async function info(dir, outDir) {
  const sharp = (await import('sharp')).default;
  await fs.mkdir(outDir, { recursive: true });
  for (const key of await fs.readdir(dir)) {
    const kd = path.join(dir, key);
    if (!(await fs.stat(kd)).isDirectory() || key === 'html' || key === 'stare') continue;
    for (const f of await fs.readdir(kd)) {
      try {
        const img = await wczytaj(path.join(kd, f));
        const png = await img.png().toBuffer();
        const meta = await sharp(png).metadata();
        const st = await sharp(png).stats();
        console.log(`${key}/${f} ${meta.width}x${meta.height} alpha=${meta.hasAlpha} opaque=${st.isOpaque} dominant=${JSON.stringify(st.dominant)}`);
        // podgląd: na czarnym (#09090b) i białym, max 256px
        const small = await sharp(png).resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        const m = await sharp(small).metadata();
        const tile = (bg) => sharp({ create: { width: m.width + 16, height: m.height + 16, channels: 4, background: bg } }).composite([{ input: small, left: 8, top: 8 }]).png().toBuffer();
        const black = await tile('#09090b');
        const white = await tile('#ffffff');
        await sharp({ create: { width: (m.width + 16) * 2, height: m.height + 16, channels: 4, background: '#808080' } })
          .composite([{ input: black, left: 0, top: 0 }, { input: white, left: m.width + 16, top: 0 }])
          .png()
          .toFile(path.join(outDir, `${key}__${f}.png`));
      } catch (e) {
        console.log(`${key}/${f} BŁĄD ${e.message}`);
      }
    }
  }
}

// wyciąga data: URI przypisane do zmiennej w paczce JS (np. ,br="data:image/png;base64,...")
async function wyciagnij(bundle, outDir, pary) {
  const js = await fs.readFile(bundle, 'utf8');
  await fs.mkdir(outDir, { recursive: true });
  for (const para of pary) {
    const [v, name] = para.split('=');
    const re = new RegExp(`[,; ]${v.replace(/\$/g, '\\$')}="(data:image/[^"]+)"`);
    const m = js.match(re);
    if (!m) {
      console.log(`${v}: brak`);
      continue;
    }
    const uri = m[1];
    const comma = uri.indexOf(',');
    const meta = uri.slice(5, comma);
    const body = uri.slice(comma + 1);
    const buf = meta.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body), 'utf8');
    await fs.writeFile(path.join(outDir, `${name}.bin`), buf);
    console.log(`${v} -> ${name} ${meta} ${buf.length}B`);
  }
}

// wyciąga wszystkie data:image (base64) z paczki, które mają >= min px, do outDir
async function wszystkieData(bundle, outDir, min = 100) {
  const sharp = (await import('sharp')).default;
  const js = await fs.readFile(bundle, 'utf8');
  await fs.mkdir(outDir, { recursive: true });
  let i = 0;
  for (const m of js.matchAll(/(.{0,40})"data:image\/(png|webp|jpeg|svg\+xml);base64,([A-Za-z0-9+/=]+)"/g)) {
    i++;
    const buf = Buffer.from(m[3], 'base64');
    try {
      const meta = await sharp(buf).metadata();
      if (Math.max(meta.width, meta.height) < min) continue;
      const name = `data-${String(i).padStart(3, '0')}.${m[2].replace('+xml', '')}`;
      await fs.writeFile(path.join(outDir, `${name}.bin`), buf);
      console.log(`${name} ${meta.width}x${meta.height} ${buf.length}B ctx=${m[1].replace(/\s+/g, ' ')}`);
    } catch {}
  }
}

// konwersja wg pliku JSON:
// { "<key>": { "znak": {"src": "...", "trim": true, "pad": 0.06, "tlo": null|"#fff", "zaokr": 0.22},
//              "logo": {"src": "...", "trim": true} } }
async function konwertuj(cfgPath, cdnA) {
  const sharp = (await import('sharp')).default;
  const cfg = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
  for (const [key, c] of Object.entries(cfg)) {
    if (c.znak) {
      const z = c.znak;
      let png = await (await wczytaj(z.src)).png().toBuffer();
      if (z.trim) png = await sharp(png).trim({ threshold: 1 }).png().toBuffer();
      const S = 128;
      const pad = Math.round(S * (z.pad ?? 0));
      const inner = S - 2 * pad;
      const mark = await sharp(png)
        .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
        .png()
        .toBuffer();
      const layers = [];
      let base = sharp({ create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
      if (z.tlo) {
        const r = Math.round(S * (z.zaokr ?? 0.22));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" rx="${r}" ry="${r}" fill="${z.tlo}"/></svg>`;
        layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
      }
      layers.push({ input: mark, left: pad, top: pad });
      const out = path.join(cdnA, `${key}.webp`);
      await base.composite(layers).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);
      const m = await sharp(out).metadata();
      console.log(`${key}.webp ${m.width}x${m.height} alpha=${m.hasAlpha} ${(await fs.stat(out)).size}B`);
    }
    if (c.logo) {
      const l = c.logo;
      let png = await (await wczytaj(l.src)).png().toBuffer();
      if (l.trim) png = await sharp(png).trim({ threshold: 1 }).png().toBuffer();
      const out = path.join(cdnA, `${key}-logo.webp`);
      await sharp(png).resize({ height: 64, kernel: 'lanczos3' }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);
      const m = await sharp(out).metadata();
      console.log(`${key}-logo.webp ${m.width}x${m.height} alpha=${m.hasAlpha} ${(await fs.stat(out)).size}B`);
    }
  }
}

// podgląd wyników: każdy plik z cdn/a na tle #09090b w 32px, 20px i 128px
async function podglad(cdnA, outFile, klucze) {
  const sharp = (await import('sharp')).default;
  const rows = [];
  for (const k of klucze.split(',')) {
    for (const f of [`${k}.webp`, `${k}-logo.webp`]) {
      const p = path.join(cdnA, f);
      try {
        await fs.access(p);
      } catch {
        continue;
      }
      const m = await sharp(p).metadata();
      const at = async (h) => sharp(p).resize({ height: h }).png().toBuffer();
      const big = await at(Math.min(128, m.height));
      const b32 = await at(32);
      const b20 = await at(20);
      const W = 560;
      const H = 140;
      const bm = await sharp(big).metadata();
      const m32 = await sharp(b32).metadata();
      rows.push(
        await sharp({ create: { width: W, height: H, channels: 4, background: '#09090b' } })
          .composite([
            { input: big, left: 6, top: 6 },
            { input: b32, left: bm.width + 30, top: 50 },
            { input: b20, left: bm.width + m32.width + 60, top: 56 },
          ])
          .png()
          .toBuffer(),
      );
    }
  }
  await sharp({ create: { width: 560, height: rows.length * 144, channels: 4, background: '#555' } })
    .composite(rows.map((r, i) => ({ input: r, left: 0, top: i * 144 })))
    .png()
    .toFile(outFile);
}

const [, , cmd, dir, arg, ...rest] = process.argv;
if (cmd === 'konwertuj') {
  await konwertuj(dir, arg);
  process.exit(0);
}
if (cmd === 'podglad') {
  await podglad(dir, arg, rest[0]);
  process.exit(0);
}
if (cmd === 'wszystkie-data') {
  await wszystkieData(dir, arg, Number(rest[0] || 100));
  process.exit(0);
}
if (cmd === 'wyciagnij') {
  await wyciagnij(dir, arg, rest);
  process.exit(0);
}
if (cmd === 'odkryj') await odkryj(dir);
else if (cmd === 'pobierz') await pobierz(dir, arg);
else if (cmd === 'info') await info(dir, arg);
else console.log('użycie: odkryj <dir> | pobierz <dir> <lista.json> | info <dir> <podglad-dir>');
