import Link from "next/link";

/** Nagłówek narzędzia jak na starej stronie: "← Narzędzia", tytuł w dwóch kolorach i opis. */
export function ToolHeader({
  title,
  accent,
  description,
}: {
  title: string;
  accent: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <Link
        href="/tools"
        className="group inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
          aria-hidden
        >
          <path
            d="M19 12H5M11 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Narzędzia
      </Link>
      <h1 className="mt-6 text-4xl leading-tight font-bold text-white md:text-5xl">
        <span className="reveal-line">{title}</span>
        <span
          className="reveal-line text-zinc-500"
          style={{ "--d": 1 } as React.CSSProperties}
        >
          {accent}
        </span>
      </h1>
      <p className="mt-3 max-w-[60ch] text-zinc-400">{description}</p>
    </div>
  );
}
