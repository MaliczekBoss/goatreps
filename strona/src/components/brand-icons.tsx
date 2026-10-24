import { cdn } from "@/lib/images";

// Ikony marek jako SVG (bez zewnętrznych plików – działają z CSP i są ostre w każdym rozmiarze).

export function DiscordIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M19.6 5.3A16.6 16.6 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.6 16.6 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.5 16.7a16.8 16.8 0 0 0 5 2.5l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.4 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.7 16.7 0 0 0 5-2.5c.5-4.3-.8-8.1-2.9-11.4zM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2z" />
    </svg>
  );
}

export function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.6 3c.4 2.1 1.7 3.6 3.9 3.8v3.1c-1.4.1-2.7-.3-3.9-1v6.3c0 3.9-3.2 6.4-6.5 5.7-3.6-.8-5.1-5-3-8 1.2-1.7 3.2-2.5 5.3-2.2v3.2c-1.2-.4-2.6.1-3.1 1.2-.6 1.3.2 2.9 1.6 3.1 1.4.2 2.6-.8 2.6-2.3V3h3.1z" />
    </svg>
  );
}

/** Logo KakoBuy z napisem (a/kakobuy-napis.webp – to ze starej strony, przycięte). */
export function KakoBuyMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cdn("a/kakobuy-napis.webp") ?? ""} alt="" width={32} height={32} className={`object-contain ${className}`} />
  );
}

export function ArrowUpRight({
  className = "h-3.5 w-3.5",
}: {
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M7 17L17 7M8 7h9v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
