import { SOCIAL } from "@/lib/social";
import { DiscordIcon, KakoBuyMark, TikTokIcon } from "./brand-icons";

const ITEMS = [
  {
    href: SOCIAL.discord,
    label: "Discord",
    hint: "4,5K osób",
    rel: "noopener noreferrer",
    icon: <DiscordIcon className="h-[19px] w-[19px] text-[#7983f5]" />,
  },
  {
    href: SOCIAL.tiktok,
    label: "TikTok",
    hint: "@goatreps",
    rel: "noopener noreferrer",
    icon: <TikTokIcon className="h-[17px] w-[17px] text-white" />,
  },
  {
    href: SOCIAL.kakobuy,
    label: "KakoBuy",
    hint: "−50% shipping",
    rel: "nofollow sponsored noopener noreferrer",
    icon: <KakoBuyMark className="h-[19px] w-[19px]" />,
  },
];

/**
 * Pływający pasek przy prawej krawędzi (jak na starej stronie). Każdy kafelek po najechaniu
 * rozsuwa się w lewo i pokazuje podpis.
 */
export function SocialDock() {
  return (
    <nav
      aria-label="Społeczność"
      className="dock-in fixed top-1/2 right-4 z-30 hidden -translate-y-1/2 flex-col items-end gap-2 md:flex"
    >
      {ITEMS.map((it, i) => (
        <a
          key={it.label}
          href={it.href}
          target="_blank"
          rel={it.rel}
          aria-label={`${it.label} – ${it.hint}`}
          style={{ "--d": i } as React.CSSProperties}
          className="group flex h-11 items-center overflow-hidden rounded-2xl border border-neutral-800/90 bg-[rgb(10_10_10/0.75)] shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_16px_40px_-20px_rgb(0_0_0/0.95)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-neutral-600 hover:bg-[rgb(18_18_20/0.92)] focus-visible:border-neutral-500"
        >
          <span className="grid max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:max-w-[150px] group-hover:pl-3.5 group-hover:opacity-100 group-focus-visible:max-w-[150px] group-focus-visible:pl-3.5 group-focus-visible:opacity-100">
            <span className="text-sm leading-none font-semibold whitespace-nowrap text-white">{it.label}</span>
            <span className="mt-1 text-[11px] leading-none whitespace-nowrap text-zinc-500">{it.hint}</span>
          </span>
          <span className="m-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] transition-transform duration-300 group-hover:scale-105">
            {it.icon}
          </span>
        </a>
      ))}
    </nav>
  );
}
