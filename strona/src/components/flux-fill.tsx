"use client";

import { useEffect, useRef, useState } from "react";
import FluxLines from "./flux-lines";

// skala tła strony (layout.tsx) – odnosi się do wysokości okna
const BG_SCALE = 1.7;

/**
 * Płynące linie FluxLines jako tło karty – w tej samej wielkości co linie w tle strony.
 * Shader skaluje wzór do wysokości swojego canvasu, więc w niskiej karcie skala rośnie w tej samej proporcji.
 */
export function FluxFill({ opacity = 0.5, density = 1.4, className = "" }: { opacity?: number; density?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h) setScale(Math.round(((BG_SCALE * window.innerHeight) / h / density) * 100) / 100);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [density]);

  return (
    <div ref={box} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      {scale ? (
        <FluxLines
          colors={["#ffffff", "#d4d4d8", "#a1a1aa"]}
          speed={0.22}
          scale={scale}
          turbulence={0.9}
          glow={1.6}
          rimWidth={0.18}
          lineWidth={1}
          shimmer={1.2}
          opacity={opacity}
          flowDirection="down"
          mouseStrength={0.8}
          mouseRadius={0.6}
          dpr={1.5}
        />
      ) : null}
    </div>
  );
}
