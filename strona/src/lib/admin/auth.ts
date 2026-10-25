import "server-only";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { adminConfigured, sessionCookieFor } from "./auth-token";
import { verifySession } from "./session";

/** Czy to żądanie ma ważną sesję admina. Używaj w każdej stronie, akcji i API panelu. */
export async function isAdmin() {
  await connection();
  if (!adminConfigured()) return false;
  const cookie = sessionCookieFor(await headers());
  if (!cookie.usable) return false;
  return verifySession((await cookies()).get(cookie.name)?.value);
}
