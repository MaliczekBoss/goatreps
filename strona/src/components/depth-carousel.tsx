"use client";

// DepthCarousel z React Bits (https://reactbits.dev), przeniesiony do TypeScriptu.
// Zmiany względem oryginału: animacja przez `motion` zamiast gsap (ta sama krzywa power3.out),
// sterowany indeks (`index`), klik w przednią kartę woła `onActiveClick` (u nas: powiększenie),
// kółko myszy przewija karty tylko w poziomie – pionowe przewija stronę jak zwykle.

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, ViewTransition } from "react";
import "./depth-carousel.css";

const POWER3_OUT: [number, number, number, number] = [0.215, 0.61, 0.355, 1];

export type DepthCarouselItem = string | { image: string; alt?: string };

export type DepthCarouselProps = {
  items: DepthCarouselItem[];
  cardWidth?: number;
  cardHeight?: number;
  radius?: number;
  tint?: string;
  depth?: number;
  spread?: number;
  tilt?: number;
  tiltDirection?: "left" | "right";
  perspective?: number;
  visibleCards?: number;
  falloff?: number;
  blur?: number;
  duration?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
  loop?: boolean;
  showControls?: boolean;
  showIndicators?: boolean;
  /** Sterowany indeks – zmiana z zewnątrz (np. miniatury) przewija karuzelę. */
  index?: number;
  onChange?: (index: number) => void;
  /** Klik w kartę, która już jest na przodzie. */
  onActiveClick?: (index: number) => void;
  /** Nazwa ViewTransition dla pierwszego zdjęcia (płynne przejście z karty produktu). */
  transitionName?: string;
  /**
   * Dopasowanie do kontenera z takim marginesem (px): karta + wystający stos mieszczą się w szerokości i wysokości,
   * a całość jest wyśrodkowana. Bez tego – skalowanie jak w oryginale (tylko po szerokości, stała rezerwa na boki).
   */
  fit?: number;
  label?: string;
  className?: string;
};

type Drag = { x: number; startPos: number; lastX: number; lastT: number; v: number; moved: boolean; id: number };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const normalizeItem = (it: DepthCarouselItem) => (typeof it === "string" ? { image: it, alt: "" } : it);

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d={dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DepthCarousel({
  items,
  cardWidth = 300,
  cardHeight = 380,
  radius = 18,
  tint = "#05060a",
  depth = 220,
  spread = 90,
  tilt = 22,
  tiltDirection = "right",
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 6,
  duration = 700,
  autoplay = false,
  autoplayDelay = 3200,
  loop = true,
  showControls = true,
  showIndicators = true,
  index,
  onChange,
  onActiveClick,
  transitionName,
  fit,
  label = "Zdjęcia",
  className = "",
}: DepthCarouselProps) {
  const data = useMemo(() => (Array.isArray(items) ? items : []).map(normalizeItem), [items]);
  const count = data.length;

  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overlayRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const posRef = useRef(0);
  const focusRef = useRef(0);
  const tweenRef = useRef<AnimationPlaybackControls | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef(0);
  const cfgRef = useRef({ count, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, loop, cardWidth, cardHeight, perspective, fit, autoplayDelay });
  const onChangeRef = useRef(onChange);
  const onActiveClickRef = useRef(onActiveClick);

  const dragRef = useRef<Drag | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedRef = useRef(false);

  const [active, setActive] = useState(0);

  // w oryginale przypisywane w trakcie renderu – tu w efekcie, przed efektami, które z nich korzystają
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onActiveClickRef.current = onActiveClick;
    cfgRef.current = { count, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, duration, loop, cardWidth, cardHeight, perspective, fit, autoplayDelay };
  });

  const layout = useCallback((pos: number) => {
    const cfg = cfgRef.current;
    const n = cfg.count;
    if (!n) return;
    const dir = cfg.tiltDirection === "left" ? -1 : 1;
    const sc = scaleRef.current;
    const off = offsetRef.current;

    for (let i = 0; i < n; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;

      let d = i - pos;
      if (cfg.loop && n > 1) {
        d = ((d % n) + n) % n;
        if (d > n / 2) d -= n;
      }

      const back = Math.max(0, d);
      const az = Math.abs(d);
      const shown = az <= cfg.visibleCards + 0.5;

      const tz = -cfg.depth * d;
      const tx = dir * cfg.spread * d;
      const ry = dir * cfg.tilt * clamp(d, 0, 1);

      let opacity = d < 0 ? Math.max(0, 1 + d) : 1;
      if (!shown) opacity = 0;

      const brightness = Math.max(0.15, 1 - back * cfg.falloff);
      const blurPx = cfg.blur > 0 ? Math.min(cfg.blur, (back / Math.max(1, cfg.visibleCards)) * cfg.blur) : 0;
      const zi = Math.round(2000 - d * 20);

      el.style.transform = `translate(-50%, -50%) translateX(${off.toFixed(2)}px) scale(${sc}) translateX(${tx.toFixed(2)}px) translateZ(${tz.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`;
      el.style.zIndex = String(zi);
      el.style.pointerEvents = shown && opacity > 0.05 ? "auto" : "none";

      const ov = overlayRefs.current[i];
      if (ov) ov.style.opacity = clamp(back * cfg.falloff * 1.25, 0, 0.86).toFixed(3);
    }
  }, []);

  const notify = useCallback((idx: number) => {
    setActive(idx);
    onChangeRef.current?.(idx);
  }, []);

  const tweenTo = useCallback(
    (target: number, withAnimation: boolean) => {
      tweenRef.current?.stop();
      const cfg = cfgRef.current;
      const settle = () => {
        const n = cfg.count;
        if (n > 0) posRef.current = ((posRef.current % n) + n) % n;
        layout(posRef.current);
      };
      const seconds = withAnimation && !reducedRef.current ? cfg.duration / 1000 : 0;
      if (!seconds) {
        posRef.current = target;
        settle();
        return;
      }
      tweenRef.current = animate(posRef.current, target, {
        duration: seconds,
        ease: POWER3_OUT,
        onUpdate: (p) => {
          posRef.current = p;
          layout(p);
        },
        onComplete: settle,
      });
    },
    [layout],
  );

  const setFocus = useCallback(
    (rawIndex: number, withAnimation = true) => {
      const cfg = cfgRef.current;
      const n = cfg.count;
      if (!n) return;
      const idx = cfg.loop ? ((rawIndex % n) + n) % n : clamp(rawIndex, 0, n - 1);
      let delta = idx - posRef.current;
      if (cfg.loop && n > 1) {
        delta = ((delta % n) + n) % n;
        if (delta > n / 2) delta -= n;
      }
      tweenTo(posRef.current + delta, withAnimation);
      if (idx !== focusRef.current) {
        focusRef.current = idx;
        notify(idx);
      }
    },
    [tweenTo, notify],
  );

  const navigateBy = useCallback((step: number) => setFocus(focusRef.current + step, true), [setFocus]);

  // indeks sterowany z zewnątrz (miniatury, podgląd)
  useEffect(() => {
    if (index === undefined || index === focusRef.current) return;
    setFocus(index, true);
  }, [index, setFocus]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      const cfg = cfgRef.current;
      if (cfg.fit === undefined) {
        const needed = cfg.cardWidth + Math.abs(cfg.spread) * 2 + 120;
        scaleRef.current = clamp(w / needed, 0.4, 1);
        offsetRef.current = 0;
      } else {
        // o ile najdalsza widoczna karta wystaje zza przedniej (z perspektywą: dalsze karty są mniejsze)
        let behind = 0;
        for (let d = 1; d <= Math.min(cfg.visibleCards, cfg.count - 1); d++) {
          const f = cfg.perspective / (cfg.perspective + cfg.depth * d);
          behind = Math.max(behind, Math.abs(cfg.spread) * d * f - ((1 - f) * cfg.cardWidth) / 2);
        }
        const sc = Math.min(1, (w - cfg.fit * 2) / (cfg.cardWidth + behind), (h - cfg.fit * 2) / cfg.cardHeight);
        scaleRef.current = Math.max(0.2, sc);
        // stos wystaje w jedną stronę – przesuwamy całość o połowę, żeby grupa była na środku
        offsetRef.current = ((behind * scaleRef.current) / 2) * (cfg.tiltDirection === "left" ? 1 : -1);
      }
      layout(posRef.current);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const cfg = cfgRef.current;
      if (cfg.count < 2) return;
      // tylko gest poziomy (gładzik, shift + kółko) – pionowe kółko zostaje dla przewijania strony
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!horizontal) return;
      e.preventDefault();
      tweenRef.current?.stop();
      const delta = e.deltaMode === 1 ? horizontal * 24 : horizontal;
      const step = clamp(delta / (cfg.cardWidth * 0.9), -0.6, 0.6);
      posRef.current += step;
      layout(posRef.current);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => setFocus(Math.round(posRef.current), true), 130);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    };
  }, [layout, setFocus]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const cfg = cfgRef.current;
    if (cfg.count < 2) return;
    tweenRef.current?.stop();
    dragRef.current = { x: e.clientX, startPos: posRef.current, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const cfg = cfgRef.current;
      const stepPx = Math.max(cfg.cardWidth * 0.55 * scaleRef.current, 40);
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true;
        rootRef.current?.setPointerCapture(drag.id);
      }
      if (!drag.moved) return;
      const now = performance.now();
      const dt = Math.max(now - drag.lastT, 1);
      drag.v = (e.clientX - drag.lastX) / dt;
      drag.lastX = e.clientX;
      drag.lastT = now;
      posRef.current = drag.startPos - dx / stepPx;
      layout(posRef.current);
    },
    [layout],
  );

  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      dragRef.current = null;
      return;
    }
    // zostawiamy `moved` do najbliższego kliknięcia, żeby przeciągnięcie nie otworzyło podglądu
    setTimeout(() => {
      if (dragRef.current === drag) dragRef.current = null;
    }, 0);
    const cfg = cfgRef.current;
    const stepPx = Math.max(cfg.cardWidth * 0.55 * scaleRef.current, 40);
    const projected = posRef.current - (drag.v * 180) / stepPx;
    setFocus(Math.round(projected), true);
  }, [setFocus]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateBy(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateBy(1);
      } else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
        e.preventDefault();
        onActiveClickRef.current?.(focusRef.current);
      }
    },
    [navigateBy],
  );

  const onCardClick = useCallback(
    (i: number) => {
      if (dragRef.current?.moved) return;
      if (i === focusRef.current) onActiveClickRef.current?.(i);
      else setFocus(i, true);
    },
    [setFocus],
  );

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!autoplay || reducedRef.current || count < 2) return;
    const root = rootRef.current;
    let hovered = false;
    let focused = false;
    const stop = () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    };
    const onEnter = () => (hovered = true);
    const onLeave = () => (hovered = false);
    const onFocusIn = () => (focused = true);
    const onFocusOut = () => (focused = false);
    root?.addEventListener("mouseenter", onEnter);
    root?.addEventListener("mouseleave", onLeave);
    root?.addEventListener("focusin", onFocusIn);
    root?.addEventListener("focusout", onFocusOut);
    autoTimerRef.current = setInterval(
      () => {
        if (!hovered && !focused) navigateBy(1);
      },
      Math.max(cfgRef.current.autoplayDelay, 600),
    );
    return () => {
      stop();
      root?.removeEventListener("mouseenter", onEnter);
      root?.removeEventListener("mouseleave", onLeave);
      root?.removeEventListener("focusin", onFocusIn);
      root?.removeEventListener("focusout", onFocusOut);
    };
  }, [autoplay, autoplayDelay, count, navigateBy]);

  useEffect(() => {
    layout(posRef.current);
  }, [layout, depth, spread, tilt, tiltDirection, visibleCards, falloff, blur, cardWidth, cardHeight, radius, count]);

  useEffect(
    () => () => {
      tweenRef.current?.stop();
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    },
    [],
  );

  return (
    <div
      ref={rootRef}
      className={`depth-carousel ${className}`.trim()}
      style={{ "--dc-perspective": `${perspective}px` } as React.CSSProperties}
      role="group"
      aria-roledescription="karuzela"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="depth-carousel__stage">
        {data.map((item, i) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="depth-carousel__img"
              src={item.image}
              alt={item.alt || ""}
              width={cardWidth}
              height={cardHeight}
              // widoczne od razu karty stosu ładujemy od razu, dalsze – leniwie
              loading={i <= visibleCards ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          );
          return (
            <div
              key={i}
              className="depth-carousel__card"
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              style={{ width: cardWidth, height: cardHeight, borderRadius: radius }}
              aria-roledescription="slajd"
              aria-label={`${i + 1} z ${count}`}
              aria-hidden={active !== i}
              onClick={() => onCardClick(i)}
            >
              {i === 0 && transitionName ? (
                <ViewTransition name={transitionName} share="morph" default="none">
                  {img}
                </ViewTransition>
              ) : (
                img
              )}
              <span
                className="depth-carousel__tint"
                ref={(el) => {
                  overlayRefs.current[i] = el;
                }}
                style={{ background: tint }}
              />
            </div>
          );
        })}
      </div>

      {showControls && count > 1 && (
        <>
          <button type="button" className="depth-carousel__arrow depth-carousel__arrow--prev" aria-label="Poprzednie zdjęcie" onClick={() => navigateBy(-1)}>
            <Arrow dir="prev" />
          </button>
          <button type="button" className="depth-carousel__arrow depth-carousel__arrow--next" aria-label="Następne zdjęcie" onClick={() => navigateBy(1)}>
            <Arrow dir="next" />
          </button>
        </>
      )}

      {showIndicators && count > 1 && (
        <div className="depth-carousel__dots" role="tablist" aria-label="Zdjęcia">
          {data.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Pokaż zdjęcie ${i + 1}`}
              className={`depth-carousel__dot${active === i ? " is-active" : ""}`}
              onClick={() => setFocus(i, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
