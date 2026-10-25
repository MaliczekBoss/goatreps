// Jednorazowe wgranie obecnych danych do pustej bazy MongoDB (wywoływane przez server/start.mjs przed startem strony).
//  - seed/ceny.json (albo data/ceny.json)        → kolekcja "prices"
//  - seed/statystyki.json (albo data/statystyki.json) → kolekcje statystyk (server/seed-stats.mjs)
// Każda część wgrywa się tylko raz (znacznik w kolekcji "meta") i tylko do pustej kolekcji – restarty niczego nie nadpisują.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MongoBulkWriteError, MongoClient } from "mongodb";

function database(client) {
  if (process.env.MONGODB_DB) return client.db(process.env.MONGODB_DB);
  const named = client.db().databaseName;
  return client.db(named && named !== "test" ? named : "goatreps");
}

/** Pierwszy istniejący plik: najpierw seed/ (paczka do wgrania), potem data/ (lokalny serwer). */
const firstFile = (root, name) => [path.join(root, "seed", name), path.join(root, "data", name)].find((f) => existsSync(f)) ?? null;

/** Znacznik "ta część już była" – działa też przy kilku instancjach startujących naraz (unikalne _id). */
async function claim(db, id) {
  try {
    await db.collection("meta").insertOne({ _id: id, started: new Date(), host: process.env.HOSTNAME ?? "" });
    return true;
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

async function insertAll(collection, docs, size = 500) {
  let inserted = 0;
  for (let i = 0; i < docs.length; i += size) {
    try {
      inserted += (await collection.insertMany(docs.slice(i, i + size), { ordered: false })).insertedCount;
    } catch (error) {
      if (!(error instanceof MongoBulkWriteError)) throw error;
      inserted += error.insertedCount;
    }
  }
  return inserted;
}

const SOURCE = /^[a-z0-9-]{1,32}$/;

async function seedPrices(db, root, log) {
  const file = firstFile(root, "ceny.json");
  if (!file || !(await claim(db, "seed-prices"))) return;
  const prices = db.collection("prices");
  if ((await prices.estimatedDocumentCount()) > 0) {
    log("Ceny są już w bazie – pomijam ceny.json.");
    return;
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const now = new Date();
  const docs = Object.entries(raw)
    .map(([id, v]) => ({ _id: Number(id), ...v }))
    .filter(
      (d) =>
        Number.isSafeInteger(d._id) &&
        d._id > 0 &&
        typeof d.price === "number" &&
        d.price > 0 &&
        typeof d.checkedAt === "string" &&
        typeof d.source === "string" &&
        SOURCE.test(d.source) &&
        typeof d.available === "boolean",
    )
    .map((d) => ({ _id: d._id, price: d.price, checkedAt: d.checkedAt, source: d.source, available: d.available, updatedAt: now }));
  const n = await insertAll(prices, docs);
  await db.collection("meta").updateOne({ _id: "seed-prices" }, { $set: { done: new Date(), count: n } });
  log(`Ceny wgrane do MongoDB: ${n} (z ${path.relative(root, file)}).`);
}

async function seedStatistics(db, root, log) {
  const file = firstFile(root, "statystyki.json");
  const seeder = path.join(root, "server", "seed-stats.mjs");
  if (!file || !existsSync(seeder)) return;
  const { seedStats } = await import("./seed-stats.mjs");
  await seedStats(db, file, log);
}

const authFailed = (error) => error?.code === 18 || /authentication failed/i.test(String(error?.message));

/** Połączenie jak w src/lib/mongo.ts: gdy logowanie się nie uda, a adres nie ma authSource – druga próba z authSource=admin. */
async function connect(uri, log) {
  const open = async (u) => {
    const client = new MongoClient(u, { serverSelectionTimeoutMS: 15000, appName: "goatreps-seed" });
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    }
  };
  try {
    return await open(uri);
  } catch (error) {
    if (!authFailed(error) || /[?&]authSource=/i.test(uri)) throw error;
    const client = await open(`${uri}${uri.includes("?") ? "&" : "?"}authSource=admin`);
    log("MongoDB: użytkownik jest w bazie „admin” – logowanie z authSource=admin (możesz dopisać to do MONGODB_URI).");
    return client;
  }
}

export async function seed(root, log) {
  const client = await connect(process.env.MONGODB_URI, log);
  try {
    const db = database(client);
    log(`MongoDB: baza „${db.databaseName}”`);
    await seedPrices(db, root, log);
    await seedStatistics(db, root, log);
  } finally {
    await client.close();
  }
}
