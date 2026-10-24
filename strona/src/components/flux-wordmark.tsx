"use client";

import { useEffect, useRef, useState } from "react";
import FluxLines from "./flux-lines";

// te same ustawienia co tło w layout.tsx – skala tła odnosi się do wysokości okna
const BG_SCALE = 1.7;
// w literach linie są ~2× gęstsze niż w tle, żeby napis był wyraźnie wypełniony
const DENSITY = 2.1;

/**
 * Wielki napis w stopce wypełniony tymi samymi płynącymi liniami co tło strony (FluxLines).
 * Kształt liter to maska rysowana na canvasie tym samym fontem, co niewidoczny tekst, który ustala rozmiar.
 */
export function FluxWordmark({ text, className }: { text: string; className: string }) {
  const source = useRef<HTMLParagraphElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  // shader skaluje wzór do wysokości swojego canvasu – napis jest niski, więc skala rośnie w tej samej proporcji
  const [scale, setScale] = useState(BG_SCALE * 4);

  useEffect(() => {
    const p = source.current;
    const target = fill.current;
    if (!p || !target) return;
    let url = "";
    let cancelled = false;

    const draw = () => {
      const rect = p.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setScale(Math.round(((BG_SCALE * window.innerHeight) / rect.height / DENSITY) * 100) / 100);
      const css = getComputedStyle(p);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const spacing = parseFloat(css.letterSpacing);
      if ("letterSpacing" in ctx && Number.isFinite(spacing)) ctx.letterSpacing = `${spacing}px`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const m = ctx.measureText(text);
      // linia bazowa jak w przeglądarce: połowa interlinii nad i pod wysokością fontu
      const baseline = (rect.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      // wygaszenie ku dołowi (jak wcześniej przy poziomicach)
      const fade = ctx.createLinearGradient(0, 0, 0, rect.height);
      fade.addColorStop(0, "#fff");
      fade.addColorStop(0.5, "#fff");
      fade.addColorStop(1, "rgb(255 255 255 / 0.25)");
      ctx.fillStyle = fade;
      ctx.fillText(text, rect.width / 2, baseline);
      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob);
        target.style.height = `${rect.height}px`;
        target.style.maskImage = `url("${url}")`;
        target.style.setProperty("-webkit-mask-image", `url("${url}")`);
      });
    };

    const ro = new ResizeObserver(draw);
    ro.observe(p);
    // font Inter dochodzi asynchronicznie – maska rysowana jeszcze raz, gdy jest gotowy
    document.fonts?.ready.then(() => !cancelled && draw());
    return () => {
      cancelled = true;
      ro.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [text]);

  return (
    <>
      <p ref={source} className={`${className} text-transparent`}>
        {text}
      </p>
      <div className="flux-wordmark absolute inset-x-0 top-0">
        <div ref={fill} className="flux-wordmark-fill relative">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(255_255_255/0.2),rgb(255_255_255/0.04))]" />
          <FluxLines
            colors={["#ffffff", "#d4d4d8", "#a1a1aa"]}
            speed={0.22}
            scale={scale}
            turbulence={0.9}
            glow={1.9}
            rimWidth={0.18}
            lineWidth={1.2}
            shimmer={0.55}
            flowDirection="down"
            mouseStrength={0.8}
            mouseRadius={0.6}
            dpr={1.5}
            className="absolute inset-0"
          />
        </div>
      </div>
    </>
  );
}
