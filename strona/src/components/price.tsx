"use client";

import { formatPrice } from "@/lib/money";
import { useSettings } from "./settings-provider";

/** Cena w walucie wybranej przez użytkownika (dane są w CNY). */
export function Price({ cny, className }: { cny: number; className?: string }) {
  const { settings, rates } = useSettings();
  return (
    <span className={className}>
      {formatPrice(cny, settings.currency, rates)}
    </span>
  );
}
