"use client";

import { useLayoutEffect, useRef, useState } from "react";
import StickerPeel from "./sticker-peel";

const DESKTOP = "(min-width: 1024px)";

/**
 * Naklejka z kozłem przyklejona obok nagłówka w hero (tylko duże ekrany). Można ją odkleić i przenieść w obrębie hero.
 * `anchor` to selektor elementu, przy którego prawym górnym rogu ląduje naklejka na starcie.
 */
export function HeroSticker({ anchor }: { anchor: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const media = window.matchMedia(DESKTOP);
    const place = () => {
      const el = box.current;
      const target = el?.parentElement?.querySelector(anchor);
      // na telefonie nie tworzymy kontekstu WebGL wcale
      if (!media.matches || !el || !target) return setStart(null);
      const area = el.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      // StickerPeel liczy pozycję od środka kontenera
      setStart({
        x: rect.right + 78 - (area.left + area.width / 2),
        y: rect.top + rect.height * 0.35 - (area.top + area.height / 2),
      });
    };
    place();
    media.addEventListener("change", place);
    return () => media.removeEventListener("change", place);
  }, [anchor]);

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-20 hidden lg:block" aria-hidden>
      {start && (
        <StickerPeel
          imageSrc="/goat-sticker.png"
          width={124}
          rotate={-12}
          peelDirection={-35}
          peelBackHoverPct={22}
          peelBackActivePct={42}
          curlRadius={14}
          finish="gloss"
          backColor="#e4e4e7"
          lightingIntensity={0.55}
          shadowIntensity={0.7}
          initialPosition={start}
        />
      )}
    </div>
  );
}
