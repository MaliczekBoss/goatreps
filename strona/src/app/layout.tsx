import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@/components/analytics";
import ClickSpark from "@/components/click-spark";
import { FavoritesProvider } from "@/components/favorites";
import FluxLines from "@/components/flux-lines";
import { SettingsProvider } from "@/components/settings-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SocialDock } from "@/components/social-dock";
import { WelcomePopup } from "@/components/welcome-popup";
import { getRates } from "@/lib/rates";
import { getSettings } from "@/lib/server-settings";
import "./globals.css";

// Inter – ten sam krój co na starej stronie.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://goatreps.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Goat Reps – findy z Weidiana w złotówkach", template: "%s – Goat Reps" },
  description: "Ponad 3 tysiące sprawdzonych findów z Weidiana i Taobao: ceny w złotówkach, zdjęcia QC i linki do KakoBuy, CNFans i innych agentów.",
  applicationName: "goatreps",
  openGraph: { type: "website", siteName: "goatreps", locale: "pl_PL", url: SITE_URL },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings, rates] = await Promise.all([getSettings(), getRates()]);
  return (
    <html lang="pl" className={inter.variable}>
      <body className="flex min-h-dvh flex-col">
        {/* tło całej strony: płynne linie (WebGL), mocno przygaszone i wygaszone ku brzegom */}
        <div className="flux-bg pointer-events-none fixed inset-0 -z-10" aria-hidden>
          <FluxLines
            colors={["#ffffff", "#d4d4d8", "#a1a1aa"]}
            speed={0.22}
            scale={1.7}
            turbulence={0.9}
            glow={1.6}
            rimWidth={0.18}
            lineWidth={1}
            shimmer={1.6}
            opacity={0.32}
            flowDirection="down"
            mouseStrength={0.8}
            mouseRadius={0.3}
            dpr={1}
          />
        </div>
        <a href="#tresc" className="sr-only z-50 rounded bg-fg px-3 py-2 text-card focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60]">
          Przejdź do treści
        </a>
        <SettingsProvider initial={settings} rates={rates}>
          <FavoritesProvider>
            {/* iskry po kliknięciu w dowolnym miejscu strony */}
            <ClickSpark
              sparkColor={["#ffffff", "#d4d4d8"]}
              sparkSize={9}
              sparkRadius={22}
              sparkCount={8}
              duration={420}
              glow={0.4}
              className="flex flex-1 flex-col"
              style={{ height: "auto" }}
            >
              <SiteHeader />
              <main id="tresc" className="flex-1 pt-20 sm:pt-24">
                {children}
              </main>
              <SiteFooter />
            </ClickSpark>
            <SocialDock />
            <WelcomePopup />
            <Analytics />
          </FavoritesProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
