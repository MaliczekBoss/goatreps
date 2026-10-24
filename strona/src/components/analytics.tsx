"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AGENT_HOSTS, classifySource, PROMO_HOST, type SourceId } from "@/lib/analytics/shared";

// Własne statystyki (port z xayez reps): bez cookies, bez zewnętrznych skryptów, sesja tylko w localStorage.
// Pomijane: /admin, przeglądarki sterowane automatycznie (navigator.webdriver) i wyłączone ręcznie (gr-notrack = "1").

const SESSION_KEY = "gr-session-v1";
export const NO_TRACK_KEY = "gr-notrack";
const IDLE_MS = 30 * 60 * 1000;
const SEARCH_SETTLE_MS = 1500;

type Session = { id: string; last: number; src: SourceId; n: number };

function skip(pathname: string) {
  try {
    if (localStorage.getItem(NO_TRACK_KEY) === "1") return true;
  } catch {}
  return pathname.startsWith("/admin") || navigator.webdriver;
}

function send(data: Record<string, unknown>) {
  const body = JSON.stringify(data);
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "text/plain" }))) return;
  } catch {}
  fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
}

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return s && typeof s.id === "string" && typeof s.last === "number" && typeof s.n === "number" ? s : null;
  } catch {
    return null;
  }
}

function touchSession(): { session: Session; isNew: boolean } {
  const now = Date.now();
  const saved = readSession();
  const isNew = !saved || now - saved.last > IDLE_MS;
  const session: Session = isNew
    ? {
        id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => (b % 36).toString(36)).join(""),
        last: now,
        src: classifySource(document.referrer, new URLSearchParams(location.search).get("utm_source"), location.hostname),
        n: 0,
      }
    : { ...saved!, last: now };
  session.n += 1;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
  return { session, isNew };
}

type Active = { since: number; pending: number };

function takeDuration(a: Active) {
  const now = Date.now();
  if (a.since) a.pending += now - a.since;
  a.since = document.visibilityState === "visible" ? now : 0;
  const seconds = Math.round(a.pending / 1000);
  a.pending = 0;
  return seconds;
}

function Tracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  // na /products liczymy też frazę wyszukiwania (parametr ?search=); serwer ją normalizuje albo odrzuca
  const search = pathname === "/products" ? (params.get("search") ?? "").trim().slice(0, 100) : "";
  const lastPath = useRef<string | null>(null);
  const lastSearch = useRef("");
  const active = useRef<Active>({ since: 0, pending: 0 });

  useEffect(() => {
    if (skip(pathname)) return;
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      lastSearch.current = search;
      const { session, isNew } = touchSession();
      const dur = takeDuration(active.current);
      send({ t: "pv", p: pathname, sid: session.id, src: session.src, new: isNew, n: session.n, dur: isNew ? 0 : dur, ...(search ? { q: search } : {}) });
      return;
    }
    if (search === lastSearch.current) return;
    // wyszukiwanie zmienione na tej samej stronie – czekamy, aż użytkownik skończy pisać
    const timer = setTimeout(() => {
      lastSearch.current = search;
      const s = readSession();
      if (search && s) send({ t: "search", sid: s.id, src: s.src, q: search });
    }, SEARCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pathname, search]);

  useEffect(() => {
    const a = active.current;
    a.since = document.visibilityState === "visible" ? Date.now() : 0;

    const onVisibility = () => {
      if (skip(location.pathname)) return;
      if (document.visibilityState === "hidden") {
        const s = readSession();
        const dur = takeDuration(a);
        if (s && dur > 0) send({ t: "ping", sid: s.id, src: s.src, dur });
      } else {
        a.since = Date.now();
      }
    };

    const onClick = (e: MouseEvent) => {
      if (e.type === "auxclick" && e.button !== 1) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || skip(location.pathname)) return;
      let host = "";
      try {
        host = new URL(link.href, location.href).hostname.toLowerCase();
      } catch {
        return;
      }
      const s = readSession();
      if (!s) return;
      if (PROMO_HOST.test(host)) {
        send({ t: "promo", sid: s.id, src: s.src });
        return;
      }
      const agent = AGENT_HOSTS.find(([, re]) => re.test(host))?.[0];
      if (agent) send({ t: "out", sid: s.id, src: s.src, a: agent });
    };

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  return null;
}

/** Licznik odwiedzin. Wstaw raz w layoucie (useSearchParams jest już w środku owinięty w Suspense). */
export function Analytics() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
