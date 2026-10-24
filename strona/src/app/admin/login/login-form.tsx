"use client";

import { useActionState, useRef, useState } from "react";
import CodeSlots from "@/components/code-slots";
import { login, type FormState } from "../actions";

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LOCK = "M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z";
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z";
const EYE_OFF = "M3 3l18 18M10.6 5.1A10 10 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2";
const ARROW = "M5 12h14M13 6l6 6-6 6";
const BACK = "M19 12H5M11 6l-6 6 6 6";

/** Logowanie w dwóch krokach: hasło, potem (gdy 2FA jest włączone) 6-cyfrowy kod w polach CodeSlots – wysyła się sam. */
export function LoginForm({ twoFactor = false }: { twoFactor?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  const [step, setStep] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  // błąd z serwera "zużywa się", gdy ktoś zacznie wpisywać od nowa
  const [seen, setSeen] = useState<FormState | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const fresh = state !== seen && Boolean(state.error);

  const next = () => {
    if (!password) return;
    setSeen(state);
    setStep("code");
  };

  return (
    <form ref={form} action={action} className="relative mt-6">
      {twoFactor ? (
        <ol className="mb-5 grid grid-cols-2 gap-2 text-xs" aria-label="Kroki logowania">
          {(["Hasło", "Kod z aplikacji"] as const).map((label, i) => {
            const done = i === 0 ? step === "code" : false;
            const current = (i === 0 && step === "password") || (i === 1 && step === "code");
            return (
              <li key={label} aria-current={current ? "step" : undefined} className={current || done ? "text-zinc-200" : "text-zinc-600"}>
                <span className="block h-1 overflow-hidden rounded-full bg-white/10">
                  <span className={`block h-full rounded-full bg-white transition-[width] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${current || done ? "w-full" : "w-0"}`} />
                </span>
                <span className="mt-2 block">
                  {i + 1}. {label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* hasło jest w formularzu także na kroku z kodem */}
      <input type="hidden" name="password" value={password} />
      <input type="hidden" name="code" value={code} />

      {step === "password" ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="text-sm font-medium text-zinc-200">
              Hasło
            </label>
            <div className="mt-2 flex h-12 items-center gap-2.5 rounded-[14px] border border-white/10 bg-neutral-900/60 px-4 transition-colors focus-within:border-white/30">
              <Icon d={LOCK} className="h-4 w-4 text-zinc-500" />
              <input
                id="password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, 200))}
                onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
                onKeyDown={(e) => {
                  if (twoFactor && e.key === "Enter") {
                    e.preventDefault();
                    next();
                  }
                }}
                required
                maxLength={200}
                autoComplete="current-password"
                autoFocus
                spellCheck={false}
                aria-invalid={fresh || undefined}
                aria-describedby={fresh ? "login-error" : undefined}
                className="h-full w-full bg-transparent text-white outline-none placeholder:text-zinc-600"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="grid h-8 w-8 place-items-center rounded-[10px] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <Icon d={show ? EYE_OFF : EYE} className="h-[17px] w-[17px]" />
                <span className="sr-only">{show ? "Ukryj hasło" : "Pokaż hasło"}</span>
              </button>
            </div>
            {caps ? <p className="mt-2 text-xs text-amber-300/90">Caps Lock jest włączony.</p> : null}
          </div>

          {fresh && !twoFactor ? (
            <p id="login-error" role="alert" className="rounded-[14px] border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
              {state.error}
            </p>
          ) : null}

          <button
            type={twoFactor ? "button" : "submit"}
            onClick={twoFactor ? next : undefined}
            disabled={pending || !password}
            className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-white font-bold text-black transition-[background-color,scale,opacity] hover:bg-zinc-200 active:scale-[0.98] disabled:opacity-50"
          >
            {pending ? "Logowanie…" : twoFactor ? "Dalej" : "Zaloguj się"}
            {pending ? null : <Icon d={ARROW} className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-zinc-400">Wpisz 6-cyfrowy kod z aplikacji do logowania dwuetapowego.</p>
          <div className="mt-5 flex justify-center">
            <CodeSlots
              length={6}
              autoFocus
              disabled={pending}
              status={fresh ? "error" : "idle"}
              onChange={(c) => {
                setCode(c);
                if (c) setSeen(state);
              }}
              onComplete={(c) => {
                setCode(c);
                setSeen(state);
                // hidden input musi mieć już kod – wysyłamy po zatwierdzeniu stanu
                requestAnimationFrame(() => form.current?.requestSubmit());
              }}
              accentColor="#fafafa"
              inkColor="#fafafa"
              slotColor="#1c1c1f"
              digitColor="#0a0a0a"
              dangerColor="#ef4444"
              slotSize={46}
              gap={8}
              radius={12}
              ariaLabel="Kod z aplikacji"
            />
          </div>
          <div className="mt-4 min-h-6 text-center text-sm" aria-live="polite">
            {pending ? (
              <span className="text-zinc-400">Sprawdzam…</span>
            ) : fresh ? (
              <span id="login-error" role="alert" className="text-red-300">
                {state.error}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setCode("");
            }}
            className="mx-auto mt-3 flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <Icon d={BACK} className="h-3.5 w-3.5" />
            Zmień hasło
          </button>
        </div>
      )}
    </form>
  );
}
