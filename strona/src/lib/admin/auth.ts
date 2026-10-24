import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { adminConfigured, SESSION_COOKIE } from "./auth-token";
import { verifySession } from "./session";

/** Czy to żądanie ma ważną sesję admina. Używaj w każdej stronie, akcji i API panelu. */
export async function isAdmin() {
  await connection();
  if (!adminConfigured()) return false;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}
