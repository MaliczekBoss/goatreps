import { NextResponse, type NextRequest } from "next/server";

const dev = process.env.NODE_ENV === "development";

const cdnOrigin = (() => {
  try {
    const raw = process.env.NEXT_PUBLIC_CDN_URL;
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

function contentSecurityPolicy(nonce: string, https: boolean) {
  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce: wykonają się tylko skrypty Next.js z tym noncem i to, co one same załadują.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React/Next ustawiają atrybuty style (np. zmienne CSS), których nonce nie obejmuje.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${cdnOrigin ? ` ${cdnOrigin}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    // tylko przez HTTPS – na http://IP:PORT (serwer bez domeny) przeglądarka próbowałaby pobrać CSS i JS po https
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const nonce = btoa(String.fromCharCode(...bytes));
  // x-forwarded-proto: od Cloudflare/Vercela albo uzupełniony przez Next z prawdziwego połączenia (podróbki usuwa server/origin-guard.mjs)
  const https = !dev && (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")) === "https";
  const csp = contentSecurityPolicy(nonce, https);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api/|cdn/|_next/static/|_next/image).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
