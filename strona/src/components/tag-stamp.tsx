import type { Tag } from "@/lib/types";

export const TAG_LABELS: Record<Tag, string> = {
  bestbatch: "Best batch",
  budgetbatch: "Budget batch",
  random: "Random",
};

/** Plakietka BEST / BUDGET jak na starej stronie. Random nie dostaje plakietki. */
export function TagStamp({
  tags,
  className = "",
}: {
  tags: Tag[];
  className?: string;
}) {
  const tag = tags.includes("bestbatch")
    ? "bestbatch"
    : tags.includes("budgetbatch")
      ? "budgetbatch"
      : null;
  if (!tag) return null;
  return (
    <span
      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
        tag === "bestbatch"
          ? "border-white/30 bg-white/10 text-white"
          : "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
      } ${className}`}
    >
      {tag === "bestbatch" ? "BEST" : "BUDGET"}
    </span>
  );
}
