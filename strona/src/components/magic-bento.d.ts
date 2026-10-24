// Typy do magic-bento.jsx (React Bits, JS).
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export type MagicBentoItem = {
  id?: string;
  label?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  image?: string;
  visual?: ReactNode;
  content?: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  colSpan?: number;
  rowSpan?: number;
};

export type MagicBentoProps = {
  items?: MagicBentoItem[];
  columns?: number;
  rowHeight?: number;
  gap?: number;
  radius?: number;
  theme?: "dark" | "light";
  glowColor?: string;
  textAutoHide?: boolean;
  enableBorderGlow?: boolean;
  enableSpotlight?: boolean;
  spotlightRadius?: number;
  enableStars?: boolean;
  particleCount?: number;
  enableTilt?: boolean;
  enableMagnetism?: boolean;
  clickEffect?: boolean;
  intro?: boolean;
  disableAnimations?: boolean;
  onItemClick?: (item: MagicBentoItem, index: number) => void;
  className?: string;
  style?: CSSProperties;
};

declare function MagicBento(props: MagicBentoProps): ReactNode;
export default MagicBento;
