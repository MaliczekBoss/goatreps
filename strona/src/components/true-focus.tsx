"use client";

// TrueFocus z React Bits (https://reactbits.dev), przeniesiony do TypeScriptu.
// Ramka przeskakuje po kolejnych słowach; użyty w sekcji "Jak kupować" (słowa = kroki).

import { motion, useReducedMotion, type Transition } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CORNERS = ["tf-top-left", "tf-top-right", "tf-bottom-left", "tf-bottom-right"] as const;
type Corner = (typeof CORNERS)[number];
const FRAME_GAP = 10;
const SMOOTH_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];
const SMOOTH_CSS = "cubic-bezier(0.65, 0, 0.35, 1)";
const SPRING_CSS = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Rect = { x: number; y: number; width: number; height: number };

export type TrueFocusProps = {
  sentence?: string;
  separator?: string;
  manualMode?: boolean;
  focusStyle?: "brackets" | "box" | "underline" | "highlight";
  order?: "sequential" | "random";
  easing?: "smooth" | "spring";
  blurAmount?: number;
  focusScale?: number;
  borderColor?: string;
  highlightColor?: string;
  glowColor?: string;
  animationDuration?: number;
  pauseBetweenAnimations?: number;
  cornerSize?: number;
  borderWidth?: number;
  unfocusedOpacity?: number;
  className?: string;
  wordClassName?: string;
  /** Wywoływane przy każdej zmianie aktywnego słowa (np. żeby podświetlić opis kroku). */
  onFocusChange?: (index: number) => void;
};

export default function TrueFocus({
  sentence = "True Focus",
  separator = " ",
  manualMode = false,
  focusStyle = "brackets",
  order = "sequential",
  easing = "smooth",
  blurAmount = 5,
  focusScale = 1,
  borderColor = "green",
  highlightColor,
  glowColor = "transparent",
  animationDuration = 0.5,
  pauseBetweenAnimations = 1,
  cornerSize = 16,
  borderWidth = 3,
  unfocusedOpacity = 1,
  className = "",
  wordClassName = "",
  onFocusChange,
}: TrueFocusProps) {
  const words = sentence.split(separator).filter((word) => word.trim() !== "");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [focusRect, setFocusRect] = useState<Rect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : animationDuration;
  const activeIndex = words.length ? currentIndex % words.length : -1;
  const spring = easing === "spring" && !reduceMotion;
  const transition: Transition = spring ? { type: "spring", visualDuration: duration, bounce: 0.38 } : { duration, ease: SMOOTH_EASE };

  useEffect(() => {
    onFocusChange?.(activeIndex);
  }, [activeIndex, onFocusChange]);

  useEffect(() => {
    if (manualMode || words.length < 2) return;
    const interval = setInterval(
      () => {
        const roll = Math.random();
        setCurrentIndex((prev) => {
          const current = prev % words.length;
          if (order !== "random") return (current + 1) % words.length;
          const next = Math.floor(roll * (words.length - 1));
          return next >= current ? next + 1 : next;
        });
      },
      (animationDuration + pauseBetweenAnimations) * 1000,
    );
    return () => clearInterval(interval);
  }, [manualMode, animationDuration, pauseBetweenAnimations, words.length, order]);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const word = wordRefs.current[activeIndex];
    if (!container || !word) return;

    const measure = () => {
      const next = { x: word.offsetLeft, y: word.offsetTop, width: word.offsetWidth, height: word.offsetHeight };
      setFocusRect((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next));
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    wordRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [activeIndex, sentence, separator]);

  const frame = focusRect && {
    x: focusRect.x - (focusRect.width * (focusScale - 1)) / 2,
    y: focusRect.y - (focusRect.height * (focusScale - 1)) / 2,
    width: focusRect.width * focusScale,
    height: focusRect.height * focusScale,
  };

  const corners: Record<Corner, { x: number; y: number }> | null = frame && {
    "tf-top-left": { x: frame.x - FRAME_GAP, y: frame.y - FRAME_GAP },
    "tf-top-right": { x: frame.x + frame.width + FRAME_GAP - cornerSize, y: frame.y - FRAME_GAP },
    "tf-bottom-left": { x: frame.x - FRAME_GAP, y: frame.y + frame.height + FRAME_GAP - cornerSize },
    "tf-bottom-right": { x: frame.x + frame.width + FRAME_GAP - cornerSize, y: frame.y + frame.height + FRAME_GAP - cornerSize },
  };

  const shapes = frame && {
    box: { x: frame.x - FRAME_GAP, y: frame.y - FRAME_GAP, width: frame.width + FRAME_GAP * 2, height: frame.height + FRAME_GAP * 2 },
    underline: { x: frame.x, y: frame.y + frame.height + FRAME_GAP * 0.4, width: frame.width, height: borderWidth },
    highlight: {
      x: frame.x - frame.height * 0.14,
      y: frame.y + frame.height * 0.04,
      width: frame.width + frame.height * 0.28,
      height: frame.height * 0.92,
    },
  };

  const frameStyle = {
    "--border-color": borderColor,
    "--highlight-color": `color-mix(in srgb, ${highlightColor ?? borderColor} 30%, transparent)`,
    "--glow-color": glowColor,
    "--corner-size": `${cornerSize}px`,
    "--border-width": `${borderWidth}px`,
  } as React.CSSProperties;

  return (
    <div className={`tf-container ${className}`} ref={containerRef} style={frameStyle}>
      {focusStyle === "highlight" && shapes && (
        <motion.span className="tf-highlight" aria-hidden="true" initial={{ ...shapes.highlight, opacity: 0 }} animate={{ ...shapes.highlight, opacity: 1 }} transition={transition} />
      )}

      {words.map((word, index) => {
        const isActive = index === activeIndex;
        return (
          <span
            key={index}
            ref={(el) => {
              wordRefs.current[index] = el;
            }}
            className={`tf-word ${wordClassName} ${manualMode ? "tf-manual" : ""} ${isActive && !manualMode ? "tf-active" : ""}`}
            style={{
              filter: `blur(${isActive ? 0 : blurAmount}px)`,
              opacity: isActive ? 1 : unfocusedOpacity,
              transform: focusScale !== 1 ? `scale(${isActive ? focusScale : 1})` : undefined,
              transition: `filter ${duration}s ease, opacity ${duration}s ease, transform ${duration}s ${spring ? SPRING_CSS : SMOOTH_CSS}`,
            }}
            onMouseEnter={() => {
              if (manualMode) setCurrentIndex(index);
            }}
          >
            {word}
          </span>
        );
      })}

      {shapes && corners && focusStyle !== "highlight" && (
        <div className="tf-frame" aria-hidden="true">
          {focusStyle === "box" && <motion.span className="tf-box" initial={{ ...shapes.box, opacity: 0 }} animate={{ ...shapes.box, opacity: 1 }} transition={transition} />}
          {focusStyle === "underline" && (
            <motion.span className="tf-underline" initial={{ ...shapes.underline, opacity: 0 }} animate={{ ...shapes.underline, opacity: 1 }} transition={transition} />
          )}
          {focusStyle === "brackets" &&
            CORNERS.map((corner) => (
              <motion.span
                key={corner}
                className={`tf-corner ${corner}`}
                initial={{ ...corners[corner], opacity: 0 }}
                animate={{ ...corners[corner], opacity: 1 }}
                transition={transition}
              />
            ))}
        </div>
      )}
    </div>
  );
}
