"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Link do produktu, który pobiera stronę dopiero po najechaniu / dotknięciu, a nie gdy kafelek wjedzie w ekran.
 * Na liście 48 produktów oszczędza to 48 zapytań do serwera przy każdym przewinięciu.
 */
export function HoverLink(props: React.ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);
  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(e) => {
        setActive(true);
        props.onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        setActive(true);
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        setActive(true);
        props.onFocus?.(e);
      }}
    />
  );
}
