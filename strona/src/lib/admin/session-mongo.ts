import "server-only";
import { MongoServerError, type Db, type Document } from "mongodb";
import { mongo } from "../mongo";
import type { Hit } from "../rate-limit";

/*
 * Sesje admina i limity logowania w MongoDB – wspólne dla wszystkich instancji strony.
 *
 * admin_sessions  _id = sha256(sid), exp (TTL) – "Wyloguj wszędzie" usuwa wszystkie
 * rate_limits     _id = "nazwa:kto:okno", n ($inc), exp (TTL = koniec okna)
 * admin_totp      _id "last", step – ostatnio użyty krok 2FA; nowy kod musi mieć nowszy krok (atomowo, bez powtórek)
 *
 * Błędy bazy są przekazywane dalej – wywołujący odmawia logowania (nigdy "bez limitu").
 */

/** Dokument z _id tekstowym / liczbowym (domyślnie sterownik zakłada ObjectId). */
type Str = Document & { _id: string };

const C = { sessions: "admin_sessions", limits: "rate_limits", totp: "admin_totp" } as const;

type Mem = { indexes?: Promise<void> };
const g = globalThis as typeof globalThis & { __grAdminMongo?: Mem };
const mem: Mem = (g.__grAdminMongo ??= {});

/** Indeksy TTL – raz na proces (createIndex jest idempotentne). */
export function ensureAdminIndexes(db: Db) {
  mem.indexes ??= (async () => {
    await Promise.all([
      db.collection<Str>(C.sessions).createIndex({ exp: 1 }, { expireAfterSeconds: 0, name: "wygasa" }),
      db.collection<Str>(C.sessions).createIndex({ at: -1 }, { name: "od-najnowszej" }),
      db.collection<Str>(C.limits).createIndex({ exp: 1 }, { expireAfterSeconds: 0, name: "wygasa" }),
    ]);
  })().catch((e) => {
    mem.indexes = undefined;
    throw e;
  });
  return mem.indexes;
}

async function db() {
  const d = await mongo();
  await ensureAdminIndexes(d);
  return d;
}

const isDuplicate = (e: unknown) => e instanceof MongoServerError && e.code === 11000;

/** Upsert dwóch instancji naraz na nowe _id może dać duplikat – wtedy jeszcze raz (dokument już jest). */
async function retryDuplicate<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isDuplicate(e)) throw e;
    return run();
  }
}

export async function createSessionMongo(key: string, expires: number, max: number) {
  const sessions = (await db()).collection<Str>(C.sessions);
  await sessions.insertOne({ _id: key, exp: new Date(expires), at: new Date() });
  // najwyżej `max` sesji naraz – najstarsze wylatują
  const extra = await sessions.find({}, { projection: { _id: 1 } }).sort({ at: -1 }).skip(max).toArray();
  if (extra.length) await sessions.deleteMany({ _id: { $in: extra.map((x) => x._id) } });
}

export async function sessionExistsMongo(key: string, now: number) {
  const doc = await (await db()).collection<Str>(C.sessions).findOne({ _id: key, exp: { $gt: new Date(now) } }, { projection: { _id: 1 } });
  return doc !== null;
}

export async function deleteSessionMongo(key: string) {
  await (await db()).collection<Str>(C.sessions).deleteOne({ _id: key });
}

export async function deleteAllSessionsMongo() {
  await (await db()).collection<Str>(C.sessions).deleteMany({});
}

/** Wspólny licznik w stałym oknie – jak hit() z rate-limit.ts, ale dla wszystkich instancji. */
export async function hitMongo(name: string, id: string, limit: number, windowMs: number, by = 1): Promise<Hit> {
  const now = Date.now();
  const slot = Math.floor(now / windowMs);
  const until = (slot + 1) * windowMs;
  const retryAfter = Math.max(1, Math.ceil((until - now) / 1000));
  const _id = `${name}:${id}:${slot}`;
  const limits = (await db()).collection<Str>(C.limits);
  if (by <= 0) {
    await limits.updateOne({ _id: _id, n: { $gte: -by } }, { $inc: { n: by } });
    return { ok: true, count: 0, retryAfter };
  }
  const doc = await retryDuplicate(() =>
    limits.findOneAndUpdate(
      { _id: _id },
      { $inc: { n: by }, $setOnInsert: { exp: new Date(until + 60_000) } },
      { upsert: true, returnDocument: "after", projection: { n: 1 } },
    ),
  );
  const n = typeof doc?.n === "number" ? doc.n : limit + 1;
  return { ok: n <= limit, count: n, retryAfter };
}

/** Zajmuje krok 2FA: true tylko, gdy jest nowszy niż ostatnio użyty (na dowolnej instancji). */
export async function claimTotpStepMongo(step: number): Promise<boolean> {
  const totp = (await db()).collection<Str>(C.totp);
  try {
    const r = await totp.updateOne({ _id: "last", step: { $lt: step } }, { $set: { step, at: new Date() } }, { upsert: true });
    return r.modifiedCount + r.upsertedCount > 0;
  } catch (e) {
    // dokument jest, ale z tym samym albo nowszym krokiem → upsert próbuje wstawić drugi "last" → duplikat = kod zużyty
    if (isDuplicate(e)) return false;
    throw e;
  }
}
