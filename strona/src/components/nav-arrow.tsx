"use client";

/** Strzałka przewijania: szklany przycisk – pod kursorem rośnie i bieleje, grot przesuwa się w stronę ruchu, przy kliknięciu się wciska. */
export function NavArrow({ dir, onClick, label, className = "" }: { dir: "left" | "right"; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group/arrow grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/40 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.9)] backdrop-blur-md transition-[scale,translate,opacity,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] outline-none hover:scale-110 hover:border-white hover:bg-white hover:text-black focus-visible:border-white active:scale-90 active:duration-100 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${dir === "left" ? "group-hover/arrow:-translate-x-0.5" : "group-hover/arrow:translate-x-0.5"}`}
        aria-hidden
      >
        <path
          d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
