"use client";

export function BackToTop() {
  return (
    <button
      type="button"
      onClick={() => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className="group inline-flex items-center gap-1 transition-colors hover:text-white"
    >
      Do góry
      <svg viewBox="0 0 24 24" className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" aria-hidden>
        <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
