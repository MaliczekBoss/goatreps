"use client";

// Silnik i efekty karty z ProfileCard z React Bits (https://reactbits.dev), przeniesione do TypeScriptu:
// karta przechyla się do kursora, światło idzie za nim, a folia holograficzna prześwituje przez wzór z logo kozła.
// Bez ikon z @hugeicons i bez stopki profilu – treść karty (okładka produktu) przychodzi jako children.

import { useEffect, useRef, type ReactNode } from "react";
import "./holo-card.css";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Axis = { p: number; v: number; target: number };

export function HoloCard({
  children,
  className = "",
  bodyClassName = "",
  tiltStrength = 9,
  parallax = 5,
  holo = 0.7,
  glare = 0.45,
}: {
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Największy przechył w stopniach. */
  tiltStrength?: number;
  /** O ile px przesuwa się zdjęcie przy przechyle (głębia). */
  parallax?: number;
  /** Siła folii holograficznej 0–1. */
  holo?: number;
  /** Siła odblasku 0–1. */
  glare?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef({ tiltStrength, parallax });

  useEffect(() => {
    settingsRef.current = { tiltStrength, parallax };
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = { width: root.offsetWidth, height: root.offsetHeight };
    const x: Axis = { p: 0, v: 0, target: 0 };
    const y: Axis = { p: 0, v: 0, target: 0 };
    const light = { p: 0, target: 0 };
    let raf = 0;
    let last = 0;

    const write = () => {
      const { tiltStrength: strength, parallax: depth } = settingsRef.current;
      const angle = reduced ? 0 : strength;
      const tilt = Math.min(1, Math.hypot(x.p, y.p));
      const style = root.style;
      style.setProperty("--hc-light-x", `${((x.p + 1) * 0.5 * size.width).toFixed(1)}px`);
      style.setProperty("--hc-light-y", `${((y.p + 1) * 0.5 * size.height).toFixed(1)}px`);
      style.setProperty("--hc-pointer-x", `${((x.p + 1) * 50).toFixed(2)}%`);
      style.setProperty("--hc-pointer-y", `${((y.p + 1) * 50).toFixed(2)}%`);
      style.setProperty("--hc-band-x", `${(50 + x.p * 15).toFixed(2)}%`);
      style.setProperty("--hc-band-y", `${(50 + y.p * 15).toFixed(2)}%`);
      style.setProperty("--hc-rotate-x", `${(y.p * angle).toFixed(3)}deg`);
      style.setProperty("--hc-rotate-y", `${(-x.p * angle).toFixed(3)}deg`);
      style.setProperty("--hc-shift-x", `${(x.p * (reduced ? 0 : depth)).toFixed(2)}px`);
      style.setProperty("--hc-shift-y", `${(y.p * (reduced ? 0 : depth)).toFixed(2)}px`);
      style.setProperty("--hc-reach", tilt.toFixed(4));
      style.setProperty("--hc-tilt", (tilt * light.p).toFixed(4));
      style.setProperty("--hc-active", light.p.toFixed(4));
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        for (const axis of [x, y]) {
          axis.v += (120 * (axis.target - axis.p) - 16 * axis.v) * h;
          axis.p += axis.v * h;
        }
      }
      const tau = light.target > light.p ? 0.18 : 0.45;
      light.p += (light.target - light.p) * (1 - Math.exp(-dt / tau));
      write();
      const moving =
        Math.abs(x.target - x.p) > 0.0005 ||
        Math.abs(y.target - y.p) > 0.0005 ||
        Math.abs(x.v) > 0.0005 ||
        Math.abs(y.v) > 0.0005 ||
        Math.abs(light.target - light.p) > 0.002;
      if (moving) {
        raf = requestAnimationFrame(frame);
      } else {
        x.p = x.target;
        y.p = y.target;
        light.p = light.target;
        write();
        raf = 0;
      }
    };

    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const aim = (nx: number, ny: number, on = true) => {
      x.target = clamp(nx, -1, 1);
      y.target = clamp(ny, -1, 1);
      light.target = on ? 1 : 0;
      wake();
    };

    const aimAt = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      aim(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
    };

    // tylko mysz – na telefonie karta w siatce nie może przechwytywać przewijania
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") aimAt(event);
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") aim(0, 0, false);
    };
    const onFocusIn = () => aim(0.35, -0.45);
    const onFocusOut = () => aim(0, 0, false);

    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const observer = new ResizeObserver(() => {
      size.width = root.offsetWidth;
      size.height = root.offsetHeight;
      write();
    });
    observer.observe(root);
    write();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`holo-card ${className}`.trim()}
      style={{ "--hc-holo": clamp(holo, 0, 1), "--hc-glare": clamp(glare, 0, 1), "--hc-parallax": `${Math.max(0, parallax)}px` } as React.CSSProperties}
    >
      <div className={`holo-card__body ${bodyClassName}`.trim()}>
        {children}
        <span className="holo-card__glare" aria-hidden />
        <span className="holo-card__shade" aria-hidden />
        <span className="holo-card__rim" aria-hidden />
      </div>
    </div>
  );
}

/** Tło okładki: ciemny kafelek z folią holograficzną prześwitującą przez wzór z logo kozła. */
export function HoloBackdrop() {
  return (
    <>
      <span className="holo-card__sheen" aria-hidden />
      <span className="holo-card__logo" aria-hidden />
      <span className="holo-card__holo" aria-hidden>
        <span className="holo-card__holo-glow" />
        <span className="holo-card__holo-shift" />
      </span>
    </>
  );
}
