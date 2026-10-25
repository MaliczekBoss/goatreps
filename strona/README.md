# goatreps.com – nowa strona

Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4. Bez bazy danych: katalog jest w `data/products.json`
i `data/categories.json` (generowane skryptami z `../narzedzia`), zdjęcia leżą na S3/CDN (folder `../cdn`).

## Uruchomienie

```bash
npm ci
cp .env.example .env    # uzupełnij adresy
npm run build
npm start               # domyślnie port 3000, inny: npm start -- --port 8080
```

Tryb deweloperski: `npm run dev`.

## Zmienne środowiskowe

| Zmienna | Co robi |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Adres strony (sitemap, Open Graph). |
| `NEXT_PUBLIC_CDN_URL` | Adres CDN z wgranym folderem `cdn/`. Pusty = strona sama podaje zdjęcia z `../cdn` pod `/cdn/…`. Wkompilowany przy buildzie. |
| `CDN_DIR` | Tylko bez CDN: ścieżka do folderu `cdn/`. |
| `TRUST_PROXY` | Nagłówek z adresem odwiedzającego, za Cloudflare `cf-connecting-ip`. Potrzebny do limitów zapytań. |
| `ADMIN_PASSWORD` | Hasło do panelu admina (min. 8 znaków). Puste = panel wyłączony. |
| `ADMIN_SECRET` | Klucz podpisu sesji admina i soli statystyk (min. 12 znaków, inny niż hasło). |
| `ADMIN_TOTP_SECRET` | Opcjonalnie: klucz 2FA z `node ../narzedzia/admin-2fa.mjs`. |

## Synchronizacja cen (co 3 dni)

Gdy ktoś wchodzi na stronę produktu, przeglądarka pyta `/api/price/{id}`. Jeśli cena jest starsza niż 3 dni, serwer sprawdza ją
w sklepie (USFans → Weidian getItemInfo → Weidian getItemSkuInfo; Taobao/1688 przez USFans), zapisuje w `data/ceny.json`
i od razu pokazuje nową cenę. Przez kolejne 3 dni wszyscy dostają ją z pliku, bez pytania sklepu. Blokada (captcha/403/429)
wyłącza dane źródło na godzinę. Usunięte aukcje są oznaczane („produkt może być niedostępny”).
`data/ceny.json` jest zapisywany przez serwer – **nie nadpisuj go przy wgrywaniu nowej wersji strony**.

## Panel admina

`/admin` → logowanie (`/admin/login`) → statystyki (`/admin/stats`). Włączenie: w `.env` na serwerze ustaw `ADMIN_PASSWORD`
i `ADMIN_SECRET` (losowy, np. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), opcjonalnie
`ADMIN_TOTP_SECRET` z `node ../narzedzia/admin-2fa.mjs`, i uruchom stronę ponownie.

- **Sesja**: cookie `__Host-gr_admin` (httpOnly, Secure, SameSite=Strict, 12 h) z tokenem podpisanym HMAC-SHA256; sesja musi też
  istnieć w pamięci serwera. Restart strony wylogowuje, „Wyloguj wszędzie” unieważnia wszystkie sesje.
- **Limity logowania**: 5 nieudanych prób na IP / 15 min, globalnie 40 / 15 min (zawsze, gdy IP jest nieznane – bez `TRUST_PROXY`;
  przy włączonym 2FA tylko wtedy), 0,5–1 s opóźnienia po błędzie. Z 2FA: max 10 złych kodów na dobę – potem logowanie jest zamknięte
  do końca doby (albo restartu). To znak, że ktoś zna hasło: **zmień `ADMIN_PASSWORD`**.
- **Statystyki** liczy `/api/track` (zdarzenia z `src/components/analytics.tsx`): odsłony, sesje, czas, źródła, kraje
  (z `cf-ipcountry`, tylko przy `TRUST_PROXY=cf-connecting-ip`), urządzenia, kliknięcia w agentów i promocję KakoBuy, wyszukiwania
  i wyświetlenia produktów. Dane są w pamięci i w `data/statystyki.json` (zapis co ~15 s; dni 100, godziny 3 doby).
  Odwiedzający to skrót HMAC (dzień + IP + przeglądarka) – **surowe IP nie jest nigdzie zapisywane**, skróty są trzymane tylko
  dla bieżącej doby. Plik zapisuje serwer – **nie nadpisuj go przy wgrywaniu nowej wersji strony**.
- Wyłączenie liczenia własnych wejść: w konsoli przeglądarki `localStorage.setItem("gr-notrack", "1")`.
- **Z MongoDB** (`MONGODB_URI`): sesje, limity logowania, zużyte kody 2FA i statystyki są w bazie, wspólne dla wszystkich instancji
  (kolekcje `admin_sessions`, `rate_limits`, `admin_totp`, `stats_*`, `product_views`; stare dane wygasają same – indeksy TTL).
  Restart nie wylogowuje, „Wyloguj wszędzie” działa na każdej instancji. Gdy baza nie odpowiada, logowanie jest odrzucane,
  a zdarzenia statystyk przepadają (strona działa dalej). Stary `data/statystyki.json` przenosi raz `server/seed-stats.mjs`.

## Kalkulator wysyłki

Stawki linii KakoBuy są w `data/shipping.json` (9 krajów × 25 wag). Odświeżenie: `node ../narzedzia/wysylka.mjs`
(pobiera ze starego API `goatreps.com/api/shipping`, więc zrób to, zanim stara strona zostanie wyłączona).

## Aktualizacja katalogu

1. W `../narzedzia` uruchom skrypty (opis w `../narzedzia/README.md`) – pobiorą nowe produkty i zdjęcia.
2. Wgraj nowe pliki z `../cdn` na S3 (opis w `../cdn/README-S3.md`).
3. Podmień `data/products.json` i `data/categories.json` na serwerze. Strona wczyta je sama w ciągu minuty – bez restartu.

## Bezpieczeństwo

- **CSP z noncem** (`src/proxy.ts`): wykonują się tylko skrypty Next.js z noncem danego żądania (`'strict-dynamic'`), bez
  `unsafe-inline`/`unsafe-eval` w produkcji. Zdjęcia tylko z własnej domeny i CDN, zakaz ramek (`frame-ancestors 'none'`),
  `base-uri 'none'`, `form-action 'self'`, `object-src 'none'`.
- **SRI** (`experimental.sri`): skrypty mają atrybut `integrity`, więc podmieniony plik JS się nie wykona.
- **Nagłówki** (`next.config.ts`): HSTS z preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
  (kamera, mikrofon, lokalizacja, płatności wyłączone), `Cross-Origin-Opener-Policy`. Brak `X-Powered-By`.
- **Brak bazy**: strona czyta i zapisuje tylko pliki JSON – nie ma czego wstrzyknąć (SQL/NoSQL injection). Jedyne logowanie to
  panel admina (opis wyżej): jedno hasło z `.env`, opcjonalnie 2FA, limity prób, sesje tylko w pamięci serwera.
- **Brak danych osobowych**: nie zapisujemy adresów IP ani User-Agentów (stara strona zapisywała je przy każdym wejściu) – statystyki
  trzymają tylko liczby i jednodniowe skróty HMAC. Cookie dla odwiedzających: `gr_ustawienia` z walutą i agentem; panel admina ma własne.
- **Walidacja wejścia**: wszystkie parametry adresu (`src/lib/query.ts`) mają białą listę wartości i limity długości/zakresu.
- **Linki wychodzące** tylko `https://` do znanych sklepów i agentów (`src/lib/links.ts`), z `rel="nofollow sponsored noopener noreferrer"`.
- **Limity zapytań** na `/api/*` (`src/lib/rate-limit.ts`), odpowiedzi API z `Cache-Control: no-store` i własnym CSP.
- **Zdjęcia**: optymalizator `/_next/image` wyłączony (gotowe WebP z CDN), ścieżka `/cdn/…` przyjmuje tylko nazwy pasujące do
  `^(i|t|q|p|c|a|b)/[a-z0-9_-]+\.(webp|png)$` i nie wychodzi poza folder.
- **Kursy walut** pobiera serwer (NBP), przeglądarka nie łączy się z żadną zewnętrzną usługą.

Za Cloudflare: włącz „Always Use HTTPS”, wystaw port serwera tylko dla adresów Cloudflare i ustaw `TRUST_PROXY=cf-connecting-ip`.
