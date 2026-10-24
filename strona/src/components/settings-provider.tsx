"use client";

import { createContext, use, useCallback, useMemo, useState } from "react";
import type { Rates } from "@/lib/money";
import {
  SETTINGS_COOKIE,
  serializeSettings,
  type Settings,
} from "@/lib/settings";

type Ctx = {
  settings: Settings;
  rates: Rates;
  update: (patch: Partial<Settings>) => void;
};
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({
  initial,
  rates,
  children,
}: {
  initial: Settings;
  rates: Rates;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState(initial);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${SETTINGS_COOKIE}=${serializeSettings(next)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, rates, update }),
    [settings, rates, update],
  );
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

export function useSettings() {
  const ctx = use(SettingsContext);
  if (!ctx) throw new Error("useSettings poza SettingsProvider");
  return ctx;
}
