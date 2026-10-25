// Serwer strony w produkcji (zamiast `next start`; uruchamia go server/start.mjs): Next.js za strażnikiem
// z server/origin-guard.mjs – tylko Cloudflare, tylko nasza domena, POST tylko z naszej strony, limity czasu i wielkości.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { createGuard, parseCloudflare } from "./origin-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const log = (message) => console.log(`[goatreps] ${new Date().toISOString().slice(0, 19).replace("T", " ")} ${message}`);
const guard = createGuard(process.env);

// aktualna lista adresów Cloudflare (raz na dobę); bez internetu zostaje lista wbudowana
async function refreshCloudflare() {
  try {
    const texts = await Promise.all(
      ["ips-v4", "ips-v6"].map(async (name) => {
        const res = await fetch(`https://www.cloudflare.com/${name}`, { signal: AbortSignal.timeout(10_000), redirect: "error" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      }),
    );
    guard.setCloudflare(parseCloudflare(texts));
  } catch (error) {
    log(`Nie udało się pobrać listy adresów Cloudflare (${error.message}) – używam wbudowanej.`);
  }
}

// odrzucone zapytania: pierwsze od razu w konsoli, potem zbiorczo co 10 min (bez zalewania logów)
let rejected = 0;
let lastRejected = "";
let firstRejectionLogged = false;
let localWarned = false;
function noteRejection(peer, reason) {
  rejected++;
  lastRejected = `${peer.ip} – ${reason}`;
  if (!firstRejectionLogged) {
    firstRejectionLogged = true;
    log(`Odrzucono zapytanie (${lastRejected}). Strona przyjmuje tylko ruch przez Cloudflare – do testów przez IP:port ustaw CLOUDFLARE_ONLY=0.`);
  }
}
setInterval(() => {
  if (!rejected) return;
  log(`Odrzucono ${rejected} zapytań w ostatnich 10 min (ostatnie: ${lastRejected}).`);
  rejected = 0;
}, 10 * 60_000).unref();

function deny(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(text);
}

await refreshCloudflare();
setInterval(refreshCloudflare, 24 * 60 * 60_000).unref();

const app = next({ dev: false, dir: root, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
await app.prepare();

const server = http.createServer((req, res) => {
  const result = guard.check(req, req.socket.remoteAddress);
  if (result.peer.kind === "local" && !localWarned) {
    localWarned = true;
    log(
      `Zapytania przychodzą z sieci lokalnej (${result.peer.ip}) – zwykle to reverse proxy albo Docker. Serwer nie sprawdzi wtedy, ` +
        `czy idą przez Cloudflare: zablokuj bezpośredni dostęp do portu albo ustaw TRUST_LOCAL_NETWORK=0, jeśli nie masz proxy.`,
    );
  }
  if (result.redirect) {
    res.writeHead(308, { Location: result.redirect, "Cache-Control": "public, max-age=86400" });
    res.end();
    return;
  }
  if (!result.pass) {
    noteRejection(result.peer, result.reason);
    deny(res, result.status, result.text);
    return;
  }
  handle(req, res).catch((error) => {
    console.error("[serwer]", error instanceof Error ? error.message : error);
    if (!res.headersSent) deny(res, 500, "Błąd serwera.");
    else res.destroy();
  });
});

// połączenie spoza Cloudflare zamykamy od razu – zanim wyśle choćby bajt nagłówków (Slowloris, skanery portów)
server.on("connection", (socket) => {
  if (!guard.acceptConnection(socket.remoteAddress)) {
    noteRejection(guard.classify(socket.remoteAddress), "połączenie spoza Cloudflare");
    socket.destroy();
  }
});
server.requestTimeout = 120_000; // wyszukiwanie po zdjęciu trwa do 60 s
server.headersTimeout = 30_000;
server.keepAliveTimeout = 65_000; // dłużej niż typowe pośredniki trzymają bezczynne połączenie
server.maxHeadersCount = 200;

server.listen(port, "0.0.0.0", () => {
  const mode = guard.cloudflareOnly ? `tylko przez Cloudflare, domeny: ${[...guard.hosts].join(", ")}` : "bez blokady Cloudflare (CLOUDFLARE_ONLY=0)";
  log(`Strona działa na porcie ${port} – ${mode}.`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
