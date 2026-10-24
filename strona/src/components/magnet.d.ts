// Typy do magnet.jsx (React Bits, JS).
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type MagnetProps = {
  children?: ReactNode;
  padding?: number;
  disabled?: boolean;
  magnetStrength?: number;
  maxOffset?: number;
  exclusive?: boolean;
  axis?: "both" | "x" | "y";
  tilt?: number;
  scale?: number;
  spring?: { stiffness?: number; damping?: number; mass?: number };
  onActiveChange?: (active: boolean) => void;
  wrapperClassName?: string;
  innerClassName?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, "className" | "style" | "children">;

declare function Magnet(props: MagnetProps): ReactNode;
export default Magnet;
