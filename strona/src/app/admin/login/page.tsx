import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
import { totpEnabled } from "@/lib/admin/auth-token";
import { FluxFill } from "@/components/flux-fill";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin/stats");

  return (
    <div className="site-container grid place-items-center pt-6 pb-10 sm:pt-12">
      <div className="w-full max-w-[25rem]">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-neutral-950/80 shadow-[0_40px_100px_-30px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.05)] backdrop-blur-xl">
          {/* nagłówek z płynącymi liniami jak w tle strony */}
          <div className="relative overflow-hidden border-b border-white/[0.08] px-6 pt-6 pb-7 sm:px-7">
            <FluxFill opacity={0.6} density={2.4} className="flux-fade-left" />
            <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-white opacity-[0.06] blur-3xl" aria-hidden />
            <div className="relative flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-[14px] border border-white/10 bg-neutral-900 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-zinc-300">Goat Reps</span>
            </div>
            <h1 className="relative mt-6 text-[2rem] leading-[1.05] font-bold tracking-[-0.03em] text-white">Panel admina</h1>
            <p className="relative mt-2 text-sm text-zinc-400">Zaloguj się, żeby zobaczyć statystyki strony.</p>
          </div>
          <div className="px-6 pt-1 pb-6 sm:px-7 sm:pb-7">
            <LoginForm twoFactor={totpEnabled()} />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-500">
          <Link href="/" className="transition-colors hover:text-white">
            Wróć na stronę główną
          </Link>
        </p>
      </div>
    </div>
  );
}
