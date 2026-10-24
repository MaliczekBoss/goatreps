// Typy do code-slots.jsx (React Bits, JS).
import type { ReactNode } from "react";

export type CodeSlotsProps = {
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  status?: "idle" | "error" | "success";
  mask?: boolean;
  caret?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  accentColor?: string;
  inkColor?: string;
  slotColor?: string;
  digitColor?: string;
  dangerColor?: string;
  slotSize?: number;
  gap?: number;
  radius?: number;
  bounce?: number;
  settle?: number;
  rise?: number;
  cascade?: number;
  ariaLabel?: string;
  className?: string;
};

declare function CodeSlots(props: CodeSlotsProps): ReactNode;
export default CodeSlots;
