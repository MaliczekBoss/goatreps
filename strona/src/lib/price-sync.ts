import "server-only";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProduct } from "./catalog";
import { mongo, mongoConfigured } from "./mongo";
import type { Product } from "./types";

/*
 * Synchronizacja cen z agentem / sklepem – port podejścia z xayez reps (src/lib/remote.ts).
 *
 * - Cena młodsza niż 3 dni → z magazynu, bez pytania kogokolwiek.
 * - Starsza → przy wejściu na produkt: USFans → Weidian getItemInfo → Weidian getItemSkuInfo → ostatnia znana cena.
 *   Taobao i 1688 mają tylko USFans (Weidian ich nie zna, KakoBuy wymaga logowania i szyfrowanych zapytań).
 * - Captcha / 403 / 429 albo 3 błędy sieci z rzędu → dane źródło ma godzinę przerwy.
 * - Jedno odświeżanie na produkt naraz, najwyżej 3 jednocześnie, całe odświeżenie max ~6 s.
 * - Adresy źródeł budowane tylko z platform + itemId z katalogu (itemId: same cyfry), stała lista hostów, bez przekierowań.
 */

export type SyncedPrice = { price: number; checkedAt: string; source: string; available: boolean };
export type FreshPrice = SyncedPrice & { changed: boolean };

const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const REFRESH_BUDGET_MS = 6000; // całe odświeżenie: kolejka + wszystkie źródła
const REQUEST_TIMEOUT_MS = 5000; // jedno zapytanie do źródła
const MIN_ATTEMPT_MS = 400; // mniej czasu niż tyle → nie zaczynamy kolejnego źródła
const MAX_CONCURRENT = 3;
const MAX_QUEUE = 200;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PAUSE_MS = 60 * 60 * 1000;
const FAILS_TO_PAUSE = 3;
const MISS_RETRY_MS = 30 * 60 * 1000; // po nieudanym odświeżeniu produkt czeka tyle przed kolejną próbą
const MAX_PRICE = 100_000;
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_MAX_WAIT_MS = 10_000;
const SAVE_RETRY_MS = 30_000;
const MONGO_SYNC_MS = 60_000;

const PRICES_FILE = path.join(process.cwd(), "data", "ceny.json");
// Vercel (i inne środowiska bezserwerowe): dysk tylko do odczytu – ceny trzymamy w pamięci instancji.
const READ_ONLY = Boolean(process.env.VERCEL) || process.env.PRICES_READ_ONLY === "1";
const ITEM_ID = /^\d{5,20}$/;
const SOURCE_NAME = /^[a-z0-9-]{1,32}$/;

// ---------------------------------------------------------------------------------------------------------------
// Magazyn

/**
 * Magazyn zsynchronizowanych cen. `get` jest synchroniczny (czyta z pamięci), `set` zapisuje trwale w tle.
 * Wersja na MongoDB: przy starcie wczytaj kolekcję do Map, `set` = zmiana w Map + upsert (np. zbierane jak tutaj).
 */
export interface PriceStore {
  get(id: number): SyncedPrice | null;
  set(id: number, value: SyncedPrice): void;
  /** Zapisuje od razu to, co czeka na zapis. */
  flush(): Promise<void>;
  /** Zapis synchroniczny przy zamykaniu procesu. */
  flushSync(): void;
}

const isPrice = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n < MAX_PRICE;
const round2 = (n: number) => Math.round(n * 100) / 100;

function sanitize(v: unknown): SyncedPrice | null {
  if (!v || typeof v !== "object") return null;
  const { price, checkedAt, source, available } = v as Record<string, unknown>;
  if (!isPrice(price) || typeof checkedAt !== "string" || !Number.isFinite(Date.parse(checkedAt))) return null;
  if (typeof source !== "string" || !SOURCE_NAME.test(source) || typeof available !== "boolean") return null;
  return { price: round2(price), checkedAt: new Date(checkedAt).toISOString(), source, available };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const errCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plik JSON { "<id>": { price, checkedAt, source, available } }, zapis atomowy (plik tymczasowy + rename), zbierany. */
class JsonFileStore implements PriceStore {
  private data = new Map<number, SyncedPrice>();
  private dirty = false;
  private firstDirtyAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> | null = null;

  constructor(private readonly file: string) {
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
          const id = Number(key);
          const entry = sanitize(value);
          if (Number.isSafeInteger(id) && id > 0 && entry) this.data.set(id, entry);
        }
      }
    } catch (e) {
      if (errCode(e) !== "ENOENT") console.warn(`[ceny] nie można wczytać ${path.basename(file)}: ${errMsg(e)}`);
    }
  }

  get(id: number) {
    return this.data.get(id) ?? null;
  }

  set(id: number, value: SyncedPrice) {
    this.data.set(id, value);
    this.dirty = true;
    if (!this.firstDirtyAt) this.firstDirtyAt = Date.now();
    this.schedule(Math.min(SAVE_DEBOUNCE_MS, Math.max(0, this.firstDirtyAt + SAVE_MAX_WAIT_MS - Date.now())));
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
    this.timer.unref?.();
  }

  private serialize() {
    const lines = [...this.data.entries()].sort(([a], [b]) => a - b).map(([id, v]) => `  "${id}": ${JSON.stringify(v)}`);
    return lines.length ? `{\n${lines.join(",\n")}\n}\n` : "{}\n";
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (READ_ONLY) {
      this.dirty = false;
      return;
    }
    while (this.writing) await this.writing;
    if (!this.dirty) return;
    this.dirty = false;
    this.firstDirtyAt = 0;
    const json = this.serialize();
    this.writing = writeAtomic(this.file, json)
      .catch((e) => {
        console.error(`[ceny] zapis ${path.basename(this.file)} nieudany: ${errMsg(e)}`);
        this.dirty = true;
        this.firstDirtyAt ||= Date.now();
        this.schedule(SAVE_RETRY_MS);
      })
      .finally(() => {
        this.writing = null;
      });
    await this.writing;
  }

  flushSync() {
    if (!this.dirty || READ_ONLY) return;
    try {
      const tmp = `${this.file}.${process.pid}.exit.tmp`;
      writeFileSync(tmp, this.serialize(), "utf8");
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.error(`[ceny] zapis przy zamykaniu nieudany: ${errMsg(e)}`);
    }
  }
}

/**
 * MongoDB (Pterodactyl, kilka instancji): kolekcja "prices" { _id: id produktu, price, checkedAt, source, available, updatedAt }.
 * Odczyt dalej synchroniczny z pamięci; zapis to upsert jednego produktu, a co minutę dociągamy zmiany z innych instancji.
 */
class MongoPriceStore implements PriceStore {
  private data = new Map<number, SyncedPrice>();
  private pending = new Set<Promise<unknown>>();
  private since = new Date(0);
  private warnedAt = 0;

  constructor() {
    void this.sync();
    const timer = setInterval(() => void this.sync(), MONGO_SYNC_MS);
    timer.unref?.();
  }

  private warn(what: string, e: unknown) {
    // przy awarii bazy nie zalewamy logów – najwyżej raz na minutę
    if (Date.now() - this.warnedAt < 60_000) return;
    this.warnedAt = Date.now();
    console.error(`[ceny] MongoDB – ${what}: ${errMsg(e)}`);
  }

  /** Wczytuje (przy starcie wszystko, potem tylko zmienione od ostatniego razu). */
  private async sync() {
    try {
      const col = (await mongo()).collection<{ _id: number; updatedAt: Date } & SyncedPrice>("prices");
      const from = this.since;
      const docs = await col.find({ updatedAt: { $gt: from } }).toArray();
      for (const d of docs) {
        const entry = sanitize(d);
        if (Number.isSafeInteger(d._id) && d._id > 0 && entry) this.data.set(d._id, entry);
        if (d.updatedAt > this.since) this.since = d.updatedAt;
      }
    } catch (e) {
      this.warn("odczyt", e);
    }
  }

  get(id: number) {
    return this.data.get(id) ?? null;
  }

  set(id: number, value: SyncedPrice) {
    this.data.set(id, value);
    const write = mongo()
      .then((db) =>
        db
          .collection<{ _id: number }>("prices")
          .updateOne({ _id: id }, { $set: { ...value, updatedAt: new Date() } }, { upsert: true }),
      )
      .catch((e) => this.warn("zapis", e))
      .finally(() => this.pending.delete(write));
    this.pending.add(write);
  }

  async flush() {
    await Promise.all([...this.pending]);
  }

  flushSync() {
    // zapisy idą od razu do bazy – nic nie czeka w pamięci
  }
}

async function writeAtomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  await writeFile(tmp, content, "utf8");
  // Windows: rename potrafi chwilowo dostać EPERM/EBUSY, gdy ktoś (antywirus, edytor) trzyma plik.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (e) {
      if (attempt >= 4 || !["EPERM", "EBUSY", "EACCES"].includes(errCode(e))) {
        await unlink(tmp).catch(() => {});
        throw e;
      }
      await sleep(100 * (attempt + 1));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stan procesu (w globalThis, żeby przeładowanie modułu w trybie dev nie dublowało kolejek i liczników)

type UpstreamName = "usfans" | "weidian-info" | "weidian-sku";
type Breaker = { fails: number; pausedUntil: number };
type Waiter = { grant: () => void };
type State = {
  store: PriceStore;
  inFlight: Map<number, Promise<FreshPrice>>;
  misses: Map<number, number>;
  breakers: Map<UpstreamName, Breaker>;
  active: number;
  queue: Waiter[];
  /** Globalny budżet odświeżeń: ile nowych zapytań do sklepów w bieżącej minucie. */
  budget: { count: number; reset: number };
};

// Najwyżej tyle nowych odświeżeń na minutę dla całej strony – chroni źródła (i IP serwera) przed masowym wywoływaniem
// /api/price dla wszystkich produktów naraz. Ponad limit strona podaje ostatnią znaną cenę.
const REFRESH_PER_MINUTE = 40;

function takeBudget(s: State) {
  const now = Date.now();
  if (s.budget.reset <= now) s.budget = { count: 0, reset: now + 60_000 };
  if (s.budget.count >= REFRESH_PER_MINUTE) return false;
  s.budget.count++;
  return true;
}

const g = globalThis as typeof globalThis & { __grCeny?: State };

function state(): State {
  if (!g.__grCeny) {
    g.__grCeny = { store: mongoConfigured() ? new MongoPriceStore() : new JsonFileStore(PRICES_FILE), inFlight: new Map(), misses: new Map(), breakers: new Map(), active: 0, queue: [], budget: { count: 0, reset: 0 } };
    process.once("exit", () => g.__grCeny?.store.flushSync());
  }
  return g.__grCeny;
}

// ---------------------------------------------------------------------------------------------------------------
// Źródła

type Platform = NonNullable<Product["platform"]>;
type Source = { platform: Platform; itemId: string };
type Variant = { price: number; stock: number | null };
type Result =
  | { kind: "ok"; price: number }
  | { kind: "gone" } // usunięty / zdjęty ze sprzedaży
  | { kind: "soldout" } // wszystko wyprzedane
  | { kind: "fail"; reason: string; block?: boolean; flaky?: boolean };

type Upstream = {
  name: UpstreamName;
  label: string;
  url: (s: Source) => string;
  headers: Record<string, string>;
  parse: (body: unknown) => Result;
};

const ALLOWED_HOSTS = new Set(["www.usfans.com", "thor.weidian.com"]);
const USER_AGENT = "Mozilla/5.0 (compatible; goatreps.com; +https://goatreps.com)";
const USFANS_CHANNEL: Record<Platform, number> = { "1688": 1, taobao: 2, weidian: 3 };
const BLOCK_TEXT = /captcha|verify|challenge|just a moment|cf-chl|滑块|验证|频繁|punish|risk|too many|rate.?limit|登录/i;

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const amount = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const stockOf = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Reguła z xayez: najniższa cena wariantu (discountPrice, a gdy brak – price).
 * Doprecyzowanie: liczą się warianty, które są na stanie; gdy stanów brak – wszystkie.
 */
function pickPrice(variants: Variant[], itemStock: number | null, base: number): Result {
  const priced = variants.filter((v) => v.price > 0);
  if (itemStock === 0 || (priced.length > 0 && priced.every((v) => v.stock === 0))) return { kind: "soldout" };
  const inStock = priced.filter((v) => v.stock === null || v.stock > 0);
  const pool = inStock.length ? inStock : priced;
  const price = pool.length ? Math.min(...pool.map((v) => v.price)) : base;
  return isPrice(price) ? { kind: "ok", price: round2(price) } : { kind: "fail", reason: "zla-cena" };
}

function weidianStatus(body: unknown): Result | null {
  const status = obj(obj(body)?.status);
  const code = status?.code;
  if (code === 0) return null;
  if (typeof code !== "number") return { kind: "fail", reason: "zla-odpowiedz" };
  if (code === 831013) return { kind: "gone" }; // 商品不存在
  const message = `${text(status?.message)} ${text(status?.description)}`;
  return BLOCK_TEXT.test(message) ? { kind: "fail", reason: `kod-${code}`, block: true } : { kind: "fail", reason: `kod-${code}` };
}

const UPSTREAMS: Record<UpstreamName, Upstream> = {
  usfans: {
    name: "usfans",
    label: "USFans",
    url: (s) =>
      `https://www.usfans.com/api/goods/info?channel=${USFANS_CHANNEL[s.platform]}&goodsId=${s.itemId}&refresh=false&queryDelivery=false&activityId=`,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    parse(body) {
      const root = obj(body);
      const code = root?.code;
      if (typeof code !== "number") return { kind: "fail", reason: "zla-odpowiedz" };
      if (code === 90000) return { kind: "fail", reason: "captcha", block: true };
      if (code !== 200) return { kind: "fail", reason: `kod-${code}` };
      const d = obj(root?.data);
      if (!d) return { kind: "fail", reason: "brak-danych" }; // tak odpowiada m.in. na Taobao
      const skus = list(d.skuList).map(obj).filter((s): s is Record<string, unknown> => s !== null);
      const itemStock = stockOf(d.stock);
      // Usunięty albo nieistniejący produkt: pusty tytuł, bez wariantów, stan 0.
      if (!text(d.title) && !text(d.titleEn) && skus.length === 0 && !amount(d.price)) return { kind: "gone" };
      const variants = skus.map((s) => ({ price: amount(s.discountPrice) || amount(s.price), stock: stockOf(s.stock) }));
      return pickPrice(variants, itemStock, amount(d.price));
    },
  },
  "weidian-info": {
    name: "weidian-info",
    label: "Weidian (getItemInfo)",
    url: (s) => `https://thor.weidian.com/detail/getItemInfo/1.0?param=${encodeURIComponent(JSON.stringify({ vItemId: s.itemId }))}`,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: "https://weidian.com/" },
    parse(body) {
      const status = weidianStatus(body);
      if (status) return status;
      const model = obj(obj(obj(body)?.result)?.default_model);
      const item = obj(model?.item_info);
      if (!item) return { kind: "fail", reason: "brak-danych" };
      const flag = obj(item.flag) ?? {};
      if (flag.is_status_deleted === true || flag.is_status_off_shelve === true) return { kind: "gone" };
      if (item.itemSellable === false) return { kind: "soldout" };
      const skus = Object.values(obj(obj(model?.sku_properties)?.sku) ?? {}).map(obj);
      const variants = skus.filter((s): s is Record<string, unknown> => s !== null).map((s) => ({ price: amount(s.price), stock: stockOf(s.stock) }));
      return pickPrice(variants, stockOf(item.stock), amount(item.itemLowPrice) / 100);
    },
  },
  "weidian-sku": {
    name: "weidian-sku",
    label: "Weidian (getItemSkuInfo)",
    url: (s) => `https://thor.weidian.com/detail/getItemSkuInfo/1.0?param=${encodeURIComponent(JSON.stringify({ itemId: s.itemId }))}`,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", Referer: "https://weidian.com/" },
    parse(body) {
      const status = weidianStatus(body);
      if (status) return status;
      const r = obj(obj(body)?.result);
      if (!r || !text(r.itemTitle)) return { kind: "fail", reason: "brak-danych" };
      if (r.offlineItem === true) return { kind: "gone" };
      const variants = list(r.skuInfos).map((s) => {
        const info = obj(obj(s)?.skuInfo);
        return { price: (amount(info?.discountPrice) || amount(info?.originalPrice)) / 100, stock: stockOf(info?.stock) };
      });
      return pickPrice(variants, stockOf(r.itemStock), (amount(r.itemDiscountLowPrice) || amount(r.itemOriginalLowPrice)) / 100);
    },
  },
};

const CHAIN: Record<Platform, UpstreamName[]> = {
  weidian: ["usfans", "weidian-info", "weidian-sku"],
  taobao: ["usfans"],
  "1688": ["usfans"],
};

class TooLarge extends Error {}

async function readCapped(res: Response, max: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (declared > max) {
    await res.body?.cancel().catch(() => {});
    throw new TooLarge();
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw new TooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function breaker(name: UpstreamName): Breaker {
  const breakers = state().breakers;
  let b = breakers.get(name);
  if (!b) breakers.set(name, (b = { fails: 0, pausedUntil: 0 }));
  if (b.pausedUntil && b.pausedUntil <= Date.now()) b.pausedUntil = b.fails = 0;
  return b;
}

function pause(up: Upstream, reason: string) {
  const b = breaker(up.name);
  if (b.pausedUntil > Date.now()) return;
  b.pausedUntil = Date.now() + PAUSE_MS;
  b.fails = 0;
  console.warn(`[ceny] ${up.label} blokuje albo nie odpowiada (${reason}) – przerwa na 1 h`);
}

async function ask(up: Upstream, source: Source, timeoutMs: number): Promise<Result> {
  let result: Result;
  try {
    const url = new URL(up.url(source));
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return { kind: "fail", reason: "host-spoza-listy" };
    const res = await fetch(url, { headers: up.headers, signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
    if (res.status === 403 || res.status === 429) {
      await res.body?.cancel().catch(() => {});
      result = { kind: "fail", reason: `http-${res.status}`, block: true };
    } else if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      result = { kind: "fail", reason: `http-${res.status}`, flaky: res.status >= 500 };
    } else {
      const raw = await readCapped(res, MAX_BODY_BYTES);
      const json = /json/i.test(res.headers.get("content-type") ?? "") || /^\s*[{[]/.test(raw);
      if (!json) {
        result = BLOCK_TEXT.test(raw.slice(0, 4000)) ? { kind: "fail", reason: "captcha", block: true } : { kind: "fail", reason: "nie-json" };
      } else {
        let body: unknown;
        try {
          body = JSON.parse(raw);
          result = up.parse(body);
        } catch {
          result = { kind: "fail", reason: "zly-json" };
        }
      }
    }
  } catch (e) {
    if (e instanceof TooLarge) result = { kind: "fail", reason: "za-duza-odpowiedz" };
    else if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) result = { kind: "fail", reason: "timeout", flaky: true };
    else result = { kind: "fail", reason: "siec", flaky: true };
  }

  const b = breaker(up.name);
  if (result.kind !== "fail") b.fails = 0;
  else if (result.block) pause(up, result.reason);
  else if (result.flaky && ++b.fails >= FAILS_TO_PAUSE) pause(up, `${FAILS_TO_PAUSE}× ${result.reason}`);
  return result;
}

type ChainOutcome = { kind: "ok"; price: number; source: UpstreamName } | { kind: "gone" | "soldout"; source: UpstreamName } | { kind: "fail"; detail: string };

async function runChain(source: Source, deadline: number): Promise<ChainOutcome> {
  const tried: string[] = [];
  // USFans potrafi trzymać stare dane – „usunięty/wyprzedany” potwierdzamy jeszcze w getItemInfo.
  // getItemSkuInfo nie zna usuniętych produktów (zwraca stare warianty), więc wtedy go pomijamy.
  let unconfirmed: { kind: "gone" | "soldout"; source: UpstreamName } | null = null;
  for (const name of CHAIN[source.platform]) {
    if (unconfirmed && name !== "weidian-info") continue;
    const up = UPSTREAMS[name];
    if (breaker(name).pausedUntil > Date.now()) {
      tried.push(`${name}:przerwa`);
      continue;
    }
    const left = deadline - Date.now();
    if (left < MIN_ATTEMPT_MS) {
      tried.push(`${name}:brak-czasu`);
      break;
    }
    const r = await ask(up, source, Math.min(REQUEST_TIMEOUT_MS, left));
    if (r.kind === "ok") return { kind: "ok", price: r.price, source: name };
    if (r.kind === "gone" || r.kind === "soldout") {
      if (name === "usfans" && source.platform === "weidian") {
        unconfirmed = { kind: r.kind, source: name };
        continue;
      }
      return { kind: r.kind, source: name };
    }
    tried.push(`${name}:${r.reason}`);
  }
  return unconfirmed ?? { kind: "fail", detail: tried.join(", ") || "brak-zrodel" };
}

// ---------------------------------------------------------------------------------------------------------------
// Kolejka (najwyżej MAX_CONCURRENT odświeżeń naraz)

function acquire(timeoutMs: number): Promise<(() => void) | null> {
  const s = state();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    s.active--;
    s.queue.shift()?.grant();
  };
  if (s.active < MAX_CONCURRENT) {
    s.active++;
    return Promise.resolve(release);
  }
  if (s.queue.length >= MAX_QUEUE || timeoutMs <= 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    const waiter: Waiter = {
      grant: () => {
        clearTimeout(timer);
        s.active++;
        resolve(release);
      },
    };
    const timer = setTimeout(() => {
      const i = s.queue.indexOf(waiter);
      if (i >= 0) s.queue.splice(i, 1);
      resolve(null);
    }, timeoutMs);
    s.queue.push(waiter);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// API modułu

const catalogNewer = (product: Product, entry: SyncedPrice) => {
  const edited = Date.parse(product.updatedAt);
  return Number.isFinite(edited) && edited > Date.parse(entry.checkedAt);
};

function sourceOf(product: Product): Source | null {
  const { platform, itemId } = product;
  if (!platform || !Object.hasOwn(CHAIN, platform) || !itemId || !ITEM_ID.test(itemId)) return null;
  return { platform, itemId };
}

/** Ostatnia znana cena: zapisana (o ile katalogu nie edytowano po sprawdzeniu) albo z katalogu. */
function lastKnown(product: Product): SyncedPrice {
  const stored = state().store.get(product.id);
  if (stored && !catalogNewer(product, stored)) return stored;
  return { price: product.price, checkedAt: product.updatedAt, source: "katalog", available: true };
}

function isFresh(product: Product, entry: SyncedPrice | null): entry is SyncedPrice {
  if (!entry || catalogNewer(product, entry)) return false;
  const age = Date.now() - Date.parse(entry.checkedAt);
  return age >= -60_000 && age < MAX_AGE_MS;
}

/**
 * Ostatnia zapisana cena produktu (synchronicznie, z pamięci) – do renderowania strony od razu.
 * `null`, gdy cena nie była jeszcze sprawdzana albo produkt w katalogu edytowano po sprawdzeniu (wtedy wygrywa katalog).
 */
export function getSyncedPrice(id: number): SyncedPrice | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const stored = state().store.get(id);
  if (!stored) return null;
  const product = getProduct(id);
  if (product && catalogNewer(product, stored)) return null;
  return { ...stored };
}

async function refresh(product: Product, source: Source, prev: SyncedPrice): Promise<FreshPrice> {
  const s = state();
  const deadline = Date.now() + REFRESH_BUDGET_MS;
  const release = await acquire(deadline - Date.now() - MIN_ATTEMPT_MS);
  if (!release) return { ...prev, changed: false }; // zbyt duży ruch – spróbuje następny odwiedzający
  let outcome: ChainOutcome;
  try {
    outcome = await runChain(source, deadline);
  } finally {
    release();
  }

  if (outcome.kind === "fail") {
    s.misses.set(product.id, Date.now() + MISS_RETRY_MS);
    if (s.misses.size > 20_000) for (const [id, until] of s.misses) if (until <= Date.now()) s.misses.delete(id);
    console.warn(`[ceny] #${product.id}: brak aktualnej ceny (${outcome.detail}) – zostaje ${prev.price} ¥ (${prev.source})`);
    return { ...prev, changed: false };
  }

  const available = outcome.kind === "ok";
  const next: SyncedPrice = {
    price: outcome.kind === "ok" ? outcome.price : prev.price,
    checkedAt: new Date().toISOString(),
    source: outcome.source,
    available,
  };
  if (!isPrice(next.price)) return { ...prev, changed: false };
  s.store.set(product.id, next);
  s.misses.delete(product.id);

  const changed = next.price !== prev.price || next.available !== prev.available;
  if (next.price !== prev.price) console.info(`[ceny] #${product.id}: ${prev.price} → ${next.price} ¥ (${next.source})`);
  if (!available && prev.available) {
    console.info(`[ceny] #${product.id}: ${outcome.kind === "gone" ? "usunięty u sprzedawcy" : "wyprzedany"} (${next.source})`);
  }
  return { ...next, changed };
}

/**
 * Cena do pokazania na stronie produktu. Młodsza niż 3 dni → od razu z magazynu.
 * Starsza → odświeża (max ~6 s, jedno odświeżenie na produkt naraz), zapisuje i zwraca.
 * Gdy źródła zawiodą → ostatnia znana cena, `changed: false`. `null` tylko dla nieznanego produktu.
 */
export async function getFreshPrice(id: number): Promise<FreshPrice | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const product = getProduct(id);
  if (!product) return null;
  const s = state();
  const stored = s.store.get(id);
  if (isFresh(product, stored)) return { ...stored, changed: false };

  const prev = lastKnown(product);
  const source = sourceOf(product);
  if (!source || (s.misses.get(id) ?? 0) > Date.now()) return { ...prev, changed: false };

  let task = s.inFlight.get(id);
  if (!task) {
    if (!takeBudget(s)) return { ...prev, changed: false };
    task = refresh(product, source, prev).catch((e): FreshPrice => {
      console.error(`[ceny] #${id}: błąd odświeżania: ${errMsg(e)}`);
      return { ...prev, changed: false };
    });
    const running = task;
    s.inFlight.set(id, running);
    void running.finally(() => {
      if (s.inFlight.get(id) === running) s.inFlight.delete(id);
    });
  }

  // Bezpiecznik: odświeżanie samo kończy się po ~6 s, tu czekamy najwyżej chwilę dłużej.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), REFRESH_BUDGET_MS + 1000)));
  const result = await Promise.race([task, late]);
  clearTimeout(timer);
  return result ?? { ...prev, changed: false };
}

/** Do testów / zamykania: zapisuje od razu oczekujące zmiany. */
export const flushPrices = () => state().store.flush();
