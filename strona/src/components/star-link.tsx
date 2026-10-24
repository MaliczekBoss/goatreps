"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import StarBorder, { type StarBorderProps } from "./star-border";

/** StarBorder jako link Next.js – komponent kliencki, bo samego `Link` nie da się przekazać z serwera jako propa. */
export function StarLink(props: Omit<StarBorderProps<typeof Link>, "as"> & Pick<ComponentProps<typeof Link>, "href">) {
  return <StarBorder as={Link} {...props} />;
}
