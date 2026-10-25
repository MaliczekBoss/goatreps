import "server-only";
import { MongoClient, type Db } from "mongodb";

// Wspólne połączenie z MongoDB (jedno na proces). Gdy MONGODB_URI nie jest ustawione, strona działa bez bazy:
// statystyki i ceny w plikach w data/, sesje admina w pamięci – tak jak lokalnie.
//
// Na Pterodactylu: MONGODB_URI=mongodb://użytkownik:hasło@host:27017/?authSource=admin, MONGODB_DB=goatreps.
// Kilka instancji strony (HA) może korzystać z tej samej bazy – wszystko, co wspólne, jest w kolekcjach.

const URI = (process.env.MONGODB_URI ?? "").trim();

export const mongoConfigured = () => /^mongodb(\+srv)?:\/\//.test(URI);

/** Nazwa bazy: MONGODB_DB albo z adresu; gdy w adresie jej nie ma ("test") – "goatreps". */
function dbName(client: MongoClient) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  const named = client.db().databaseName;
  return named && named !== "test" ? named : "goatreps";
}

type Cache = { client?: MongoClient; db?: Promise<Db>; warned?: boolean };
const g = globalThis as typeof globalThis & { __grMongo?: Cache };
const cache: Cache = (g.__grMongo ??= {});

/** Baza danych (połączenie nawiązywane leniwie i współdzielone). Rzuca, gdy Mongo nie jest skonfigurowane. */
export function mongo(): Promise<Db> {
  if (!mongoConfigured()) return Promise.reject(new Error("MongoDB nie jest skonfigurowane (brak MONGODB_URI)"));
  cache.db ??= (async () => {
    const client = new MongoClient(URI, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
      appName: "goatreps",
    });
    try {
      await client.connect();
    } catch (error) {
      // nieudane połączenie: zamykamy klienta, żeby nie zostawiać otwartych gniazd przy kolejnych próbach
      await client.close().catch(() => {});
      throw error;
    }
    cache.client = client;
    return client.db(dbName(client));
  })().catch((error) => {
    // następna próba przy kolejnym wywołaniu (np. baza chwilowo niedostępna przy starcie)
    cache.db = undefined;
    if (!cache.warned) {
      cache.warned = true;
      console.error("[mongo] brak połączenia:", error instanceof Error ? error.message : error);
    }
    throw error;
  });
  return cache.db;
}

/** Klucze map zapisywane jako pola dokumentu: bez "." i "$" na początku (Mongo ich nie przyjmuje). */
export const encodeField = (field: string) => field.replace(/[%.]/g, (c) => (c === "%" ? "%25" : "%2E")).replace(/^\$/, "%24");
export const decodeField = (field: string) => field.replace(/%24|%2E|%25/g, (c) => (c === "%24" ? "$" : c === "%2E" ? "." : "%"));
