"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { adminConfigured, checkPassword, SESSION_COOKIE, sessionCookie, totpEnabled, totpState } from "@/lib/admin/auth-token";
import {
  consumeTotp,
  createSession,
  destroyAllSessions,
  destroySession,
  ipKey,
  ipTag,
  releaseLoginAttempt,
  reserveLoginAttempt,
  STATELESS_SESSIONS,
} from "@/lib/admin/session";
import { clientIpFrom } from "@/lib/rate-limit";

export type FormState = { error?: string };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const field = (formData: FormData, name: string) => {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
};

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!adminConfigured()) {
    if (totpState() === "invalid") {
      return { error: "ADMIN_TOTP_SECRET jest nieprawidłowy. Wygeneruj nowy klucz (node narzedzia/admin-2fa.mjs) albo usuń tę zmienną z .env na serwerze i uruchom stronę ponownie." };
    }
    return {
      error:
        "Panel nie jest skonfigurowany. Na serwerze dopisz do pliku .env zmienne ADMIN_PASSWORD (min. 8 znaków) i ADMIN_SECRET (min. 12 znaków, inny niż hasło), a potem uruchom stronę ponownie.",
    };
  }

  const key = ipKey(clientIpFrom(await headers()));
  const tag = ipTag(key);

  const allowed = reserveLoginAttempt(key);
  if (!allowed.ok) {
    console.warn(`[admin] logowanie zablokowane limitem (${tag})`);
    return { error: `Za dużo nieudanych prób. Spróbuj za ${Math.max(1, Math.ceil(allowed.retryAfter / 60))} min.` };
  }

  const password = field(formData, "password");
  const code = field(formData, "code").replace(/\s/g, "");
  const ok = checkPassword(password) && (!totpEnabled() || consumeTotp(code));
  if (!ok) {
    console.warn(`[admin] nieudane logowanie (${tag})`);
    await pause(500 + Math.random() * 500);
    return { error: totpEnabled() ? "Nieprawidłowe hasło albo kod z aplikacji." : "Nieprawidłowe hasło." };
  }

  releaseLoginAttempt(key);
  const jar = await cookies();
  destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, createSession(), sessionCookie);
  console.info(`[admin] zalogowano (${tag})`);
  redirect("/admin/stats");
}

export async function logout() {
  const jar = await cookies();
  destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 });
  redirect("/admin/login");
}

export async function logoutEverywhere() {
  if (!(await isAdmin())) redirect("/admin/login");
  destroyAllSessions();
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 });
  // na Vercelu sesje nie są nigdzie zapisane – inne urządzenia wyloguje dopiero zmiana ADMIN_SECRET
  console.info(STATELESS_SESSIONS ? "[admin] wylogowano tutaj; na Vercelu inne urządzenia wyloguje zmiana ADMIN_SECRET" : "[admin] unieważniono wszystkie sesje");
  redirect("/admin/login");
}
