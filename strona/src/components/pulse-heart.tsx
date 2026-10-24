"use client";

// PulseHeart z React Bits (https://reactbits.dev), przeniesiony do TypeScriptu – serduszko ulubionych.
// Kliknięcie: serce kurczy się do kropki, w połowie zmienia kolor i odbija z przeskokiem, a tło lekko "bije".
// Zmiany: serce jako własna ścieżka SVG (bez @hugeicons), refy aktualizowane w efektach, stan "w trakcie" jako state.

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import "./pulse-heart.css";

const OUT = 0.4;
const HEART = "M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z";

const back = (k: number, c: number) => {
  const u = k - 1;
  return 1 + (c + 1) * u ** 3 + c * u ** 2;
};
const swellOf = (t: number, c: number) => (t <= 0 ? 0 : t < OUT ? 1 - (1 - t / OUT) ** 3 : 1 - back((t - OUT) / (1 - OUT), c));
const format = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Shown = { liked: boolean; count: number };
type Roll = { a: string; b: string; at: number; up: boolean };

export type PulseHeartProps = {
  liked?: boolean;
  defaultLiked?: boolean;
  count?: number;
  onChange?: (liked: boolean, count: number) => void;
  showCount?: boolean;
  idleOutline?: boolean;
  size?: number;
  corner?: number;
  likedColor?: string;
  idleColor?: string;
  pillColor?: string;
  textColor?: string;
  duration?: number;
  dotSize?: number;
  overshoot?: number;
  beat?: number;
  rollDuration?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Wywoływane przed obsługą kliknięcia – np. żeby nie przejść linkiem pod spodem. */
  onClickCapture?: (e: MouseEvent<HTMLButtonElement>) => void;
};

export default function PulseHeart({
  liked: likedProp,
  defaultLiked = false,
  count = 0,
  onChange,
  showCount = true,
  idleOutline = true,
  size = 40,
  corner = 32,
  likedColor = "#ff4d6d",
  idleColor = "#8b8b93",
  pillColor = "#232326",
  textColor = "#f5f5f5",
  duration = 560,
  dotSize = 0.3,
  overshoot = 1.7,
  beat = 3,
  rollDuration = 350,
  disabled = false,
  label = "Polub",
  className = "",
  onClickCapture,
}: PulseHeartProps) {
  const controlled = likedProp !== undefined;
  const [inner, setInner] = useState(defaultLiked);
  const [total, setTotal] = useState(count);
  const [prevCount, setPrevCount] = useState(count);
  const liked = controlled ? likedProp : inner;
  const [shown, setShown] = useState<Shown>({ liked, count });
  const [roll, setRoll] = useState<Roll | null>(null);
  const [running, setRunning] = useState(false);

  // licznik z zewnątrz (stan liczony w renderze zamiast efektu)
  if (count !== prevCount) {
    setPrevCount(count);
    setTotal(count);
  }
  // zmiany z zewnątrz (np. usunięcie z ulubionych w szufladzie) lądują od razu, gdy nic się nie animuje
  if (!running && (shown.liked !== liked || shown.count !== total)) setShown({ liked, count: total });

  const rootRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const heartRef = useRef<HTMLSpanElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const rollRef = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const viaPointer = useRef(false);
  const shownRef = useRef(shown);
  const logical = useRef({ liked, count: total });
  const cfg = useRef({ duration, dotSize, overshoot, beat, rollDuration });

  useLayoutEffect(() => {
    logical.current = { liked, count: total };
    cfg.current = { duration, dotSize, overshoot, beat, rollDuration };
    if (!running) shownRef.current = shown;
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || root.dataset.instant === undefined) return;
    root.getBoundingClientRect();
    delete root.dataset.instant;
  }, [shown]);

  useLayoutEffect(() => {
    const el = rollRef.current;
    if (!el || !roll) return;
    el.style.transition = "none";
    el.style.transform = `translateY(${roll.up ? "0" : "-1em"})`;
    el.getBoundingClientRect();
    el.style.transition = "";
    el.style.transform = `translateY(${roll.up ? "-1em" : "0"})`;
  }, [roll]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      clearTimeout(rollTimer.current);
    },
    [],
  );

  const startRoll = (from: number, to: number) => {
    if (from === to) return;
    const a = format(from);
    const b = format(to);
    const changed = a.length === b.length ? [...b].flatMap((ch, i) => (ch !== a[i] ? [i] : [])) : [];
    setRoll({ a, b, at: changed.length === 1 ? changed[0] : -1, up: to > from });
    clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => setRoll(null), cfg.current.rollDuration);
  };

  const run = (nextLiked: boolean, nextCount: number) => {
    const root = rootRef.current;
    const heart = heartRef.current;
    const pill = pillRef.current;
    if (!root || !heart || !pill) return;
    const glyph = glyphRef.current;
    root.dataset.running = "";
    setRunning(true);
    let swapped = false;
    let prev = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const { duration: D, dotSize: dot, overshoot: c, beat: B } = cfg.current;
      const t = Math.min(1, (now - t0) / D);
      const step = prev ? now - prev : 1000 / 60;
      prev = now;
      const s = swellOf(t, c);
      const k = 1 - (1 - dot) * s;
      if (glyph) glyph.setAttribute("transform", `translate(12 12) scale(${k}) translate(-12 -12)`);
      else heart.style.transform = `scale(${k})`;
      pill.style.transform = `scale(${1 - (B / 100) * s})`;
      if (!swapped && t + step / 2 / D >= OUT) {
        swapped = true;
        root.dataset.liked = String(nextLiked);
        startRoll(shownRef.current.count, nextCount);
        shownRef.current = { liked: nextLiked, count: nextCount };
        setShown(shownRef.current);
      }
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
        return;
      }
      raf.current = 0;
      if (glyph) glyph.removeAttribute("transform");
      heart.style.transform = "";
      pill.style.transform = "";
      delete root.dataset.running;
      const l = logical.current;
      if (l.liked !== shownRef.current.liked || l.count !== shownRef.current.count) {
        shownRef.current = { liked: l.liked, count: l.count };
        setShown(shownRef.current);
      }
      setRunning(false);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return;
    viaPointer.current = true;
    if (!reducedMotion() && rootRef.current) rootRef.current.dataset.pressed = "";
  };
  const handlePointerUp = () => {
    if (rootRef.current) delete rootRef.current.dataset.pressed;
  };
  const handlePointerCancel = () => {
    viaPointer.current = false;
    handlePointerUp();
  };
  const handleKeyDown = () => {
    viaPointer.current = false;
  };
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (disabled || raf.current) return;
    const pointer = viaPointer.current && e.detail !== 0;
    viaPointer.current = false;
    const nextLiked = !liked;
    const nextCount = total + (nextLiked ? 1 : -1);
    if (!controlled) setInner(nextLiked);
    setTotal(nextCount);
    onChange?.(nextLiked, nextCount);
    if (pointer && !reducedMotion()) run(nextLiked, nextCount);
    else if (rootRef.current) rootRef.current.dataset.instant = "";
  };

  const text = format(shown.count);
  const cells: ({ ch: string } | { top: string; bottom: string })[] = roll
    ? roll.at === -1
      ? [{ top: roll.up ? roll.a : roll.b, bottom: roll.up ? roll.b : roll.a }]
      : [...roll.b].map((ch, i) => (i === roll.at ? { top: roll.up ? roll.a[i] : ch, bottom: roll.up ? ch : roll.a[i] } : { ch }))
    : [...text].map((ch) => ({ ch }));

  return (
    <button
      ref={rootRef}
      type="button"
      aria-pressed={liked}
      disabled={disabled}
      data-liked={String(shown.liked)}
      data-solid={idleOutline ? undefined : ""}
      data-no-count={showCount ? undefined : ""}
      className={`pulse-heart${className ? ` ${className}` : ""}`}
      style={
        {
          "--ph-size": `${size}px`,
          "--ph-corner": `${corner}px`,
          "--ph-pill": pillColor,
          "--ph-idle": idleColor,
          "--ph-liked": likedColor,
          "--ph-text": textColor,
          "--ph-roll": `${rollDuration}ms`,
          "--ph-stroke": `${(1.5 * size) / 24}px`,
        } as React.CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onClickCapture={onClickCapture}
      onClick={handleClick}
    >
      <span ref={pillRef} className="pulse-heart__pill">
        <span ref={heartRef} className="pulse-heart__heart" aria-hidden="true">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <g ref={glyphRef}>
              <path d={HEART} vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
        </span>
        {showCount ? (
          <span className="pulse-heart__count" aria-hidden="true">
            {cells.map((cell, i) =>
              "ch" in cell ? (
                <span key={`c${i}`}>{cell.ch}</span>
              ) : (
                <span key={`r${i}`} className="pulse-heart__slot">
                  <span ref={rollRef} className="pulse-heart__roll">
                    <span>{cell.top}</span>
                    <span>{cell.bottom}</span>
                  </span>
                </span>
              ),
            )}
          </span>
        ) : null}
        <span className="pulse-heart__sr">{showCount ? `${label}, ${format(total)}` : label}</span>
      </span>
    </button>
  );
}
