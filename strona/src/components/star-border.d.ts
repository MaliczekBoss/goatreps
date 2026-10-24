// Typy do star-border.jsx (React Bits, JS).
import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react";

export type StarBorderProps<T extends ElementType = "button"> = {
  as?: T;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  color?: string;
  trailColor?: string;
  duration?: number;
  thickness?: number;
  radius?: number;
  trailLength?: number;
  stars?: number;
  glow?: number;
  sparkle?: boolean;
  direction?: "clockwise" | "counterclockwise";
  hover?: "lap" | "brighten" | "reveal" | "none";
  clickPulse?: boolean;
  theme?: "dark" | "light";
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className" | "style" | "color">;

declare function StarBorder<T extends ElementType = "button">(props: StarBorderProps<T>): ReactNode;
export default StarBorder;
