import type { NextConfig } from "next";

// Content-Security-Policy z noncem ustawia src/proxy.ts (nonce musi być inny przy każdym żądaniu).
// Tutaj są nagłówki, które są takie same dla każdej odpowiedzi.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), browsing-topics=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Nonce w CSP wymaga renderowania na żądanie, więc Cache Components / PPR są wyłączone.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  // Zdjęcia są już przygotowane jako WebP (i/ 1400 px, t/ 480 px) i leżą na CDN,
  // więc optymalizator Next (/_next/image) jest zbędny i wyłączony – mniejsza powierzchnia ataku.
  images: { unoptimized: true },
  // Pterodactyl z kilkoma instancjami: wszystkie budują stronę z tym samym identyfikatorem wersji
  // (ustawia go server/start.mjs z sumy kontrolnej plików), więc nawigacja działa między instancjami.
  deploymentId: process.env.GOATREPS_DEPLOYMENT_ID || undefined,
  outputFileTracingIncludes: {
    "/**": ["./data/products.json", "./data/categories.json", "./data/shipping.json", "./data/qc.json", "./data/kursy.json"],
  },
  // Statystyki zapisuje działający serwer – nie mogą trafić do builda ani nadpisać się przy wgrywaniu.
  outputFileTracingExcludes: {
    "/**": ["./data/statystyki.json", "./data/statystyki.json.*"],
  },
  experimental: {
    sri: { algorithm: "sha384" },
    // jedyne akcje serwera to logowanie i wylogowanie w panelu – kilkaset bajtów, więc limit 1 MB jest zbędny
    serverActions: { bodySizeLimit: "32kb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      // panel admina: nigdy w wyszukiwarce ani w cache (przeglądarki, Cloudflare)
      ...["/admin", "/admin/:path*", "/api/admin/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      })),
      {
        source: "/cdn/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/produkty", destination: "/products", permanent: true },
      { source: "/narzedzia", destination: "/tools", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
