// Typy do sticker-peel.jsx (React Bits, JS).
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type StickerPeelProps = {
  imageSrc: string;
  width?: number;
  rotate?: number;
  peelDirection?: number;
  peelBackHoverPct?: number;
  peelBackActivePct?: number;
  curlRadius?: number;
  finish?: "gloss" | "matte" | "holo";
  backColor?: string;
  lightingIntensity?: number;
  shadowIntensity?: number;
  followPointer?: boolean;
  draggable?: boolean;
  swing?: number;
  friction?: number;
  bounce?: number;
  intro?: boolean;
  /** "center" albo przesunięcie od środka kontenera w px */
  initialPosition?: "center" | { x?: number; y?: number };
  onDragStart?: () => void;
  onDragEnd?: () => void;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "style">;

declare function StickerPeel(props: StickerPeelProps): ReactNode;
export default StickerPeel;
