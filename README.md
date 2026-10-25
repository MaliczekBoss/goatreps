# goatreps – nowa strona

| Folder | Co zawiera |
| --- | --- |
| `strona/` | Strona: Next.js 16 + React 19 + TypeScript + Turbopack + Tailwind 4. Instrukcja w `strona/README.md`. |
| `cdn/` | Zdjęcia gotowe do wgrania na S3/CDN (WebP): `i/` główne 1400 px, `t/` miniatury 480 px, `q/` galeria 1400 px, `p/` podglądy galerii 360 px, `c/` kategorie, `a/` logo agentów, `b/` logo strony. Instrukcja w `cdn/README-S3.md`. |
| `narzedzia/` | Skrypty importu: pobranie produktów ze starej strony, scalenie z backupem, zdjęcia → WebP, katalog, tabela wysyłki. Instrukcja w `narzedzia/README.md`. |
| `docs/` | Specyfikacja starej strony (funkcje, API, agenci, konwerter linków, obserwacje bezpieczeństwa). |
| `zrodla/` | Surowe pobrane dane i oryginały zdjęć (nie wgrywać na serwer). |
| `backup (1).json` | Kopia bazy MongoDB – **zawiera adresy IP odwiedzających i hash hasła admina, trzymaj ją prywatnie**. |

Kolejność wdrożenia: 1) wgraj `cdn/` na S3, 2) ustaw `.env` strony (`NEXT_PUBLIC_CDN_URL`, `TRUST_PROXY`),
3) `npm ci && npm run build && npm start` w `strona/`.

## Wdrożenie na Vercel

Repo nie zawiera folderów `cdn/` (zdjęcia, 1,25 GB), `zrodla/` ani backupu bazy – są za duże albo prywatne.

1. **Zdjęcia:** wgraj zawartość lokalnego `cdn/` do magazynu plików z publicznym adresem (Cloudflare R2, AWS S3 + CloudFront, Bunny…),
   zachowując ścieżki (`i/…`, `t/…`, `q/…` itd.). Szczegóły w `cdn/README-S3.md` (lokalnie).
2. **Nowy projekt na Vercel** z tego repo, w ustawieniach: **Root Directory = `strona`** (framework Next.js wykryje się sam).
3. **Zmienne środowiskowe** (Settings → Environment Variables) – gotowy plik do wklejenia robi `npm run paczka`
   (`do-wyslania/vercel.env`, uzupełnij `NEXT_PUBLIC_CDN_URL`); wzór w `strona/.env.example`:
   - `NEXT_PUBLIC_CDN_URL` – adres magazynu zdjęć, np. `https://cdn.goatreps.com` (bez tego strona nie pokaże zdjęć),
   - `TRUST_PROXY=x-real-ip` – Vercel podaje prawdziwy adres odwiedzającego w tym nagłówku (limity zapytań, statystyki),
   - `ADMIN_PASSWORD`, `ADMIN_SECRET` (min. 12 znaków, inny niż hasło), opcjonalnie `ADMIN_TOTP_SECRET`,
   - klucze do wyszukiwania po zdjęciu: `OPENAI_API_KEY` / `OPENAI_BASE_URL` i/lub `GEMINI_API_KEY`.
4. **Redeploy** po ustawieniu zmiennych.

Ograniczenia Vercela (serwer bez stałego dysku i z wieloma krótko żyjącymi instancjami):
- statystyki panelu admina i odświeżone ceny są trzymane tylko w pamięci – po restarcie instancji znikają
  (panel pokazuje ostrzeżenie); na stałe trzeba by je zapisywać np. w Upstash Redis,
- sesja admina jest ważna po podpisie przez 12 h; „Wyloguj wszędzie” wylogowuje tylko bieżące urządzenie – resztę wyloguje zmiana `ADMIN_SECRET`,
- kursy KakoBuy: raz w tygodniu GitHub Actions (`.github/workflows/kurs-kakobuy.yml`) zapisuje nowy `strona/data/kursy.json`
  i Vercel przebudowuje stronę; gdy kurs jest starszy niż 10 dni, strona liczy NBP × narzut KakoBuy (~8,3%).

## Wdrożenie na Pterodactyl (MongoDB)

Paczkę do wgrania składa skrypt (w folderze `narzedzia/`):

```bash
npm run paczka
```

Powstaje `do-wyslania/`: `goatreps.zip` (strona z plikiem startowym `index.js`, gotowym `.env` i danymi do pierwszego
wgrania do MongoDB), `cdn.tar` (zdjęcia), `pterodactyl.env` / `vercel.env` (ustawienia – tworzone raz, z nowym hasłem
panelu; potem tylko dopisujesz `MONGODB_URI`) i `PTERODACTYL.md` – instrukcja dla osoby, która wgrywa. Strona sama
instaluje paczki, wgrywa dane do pustej bazy, buduje się i startuje na porcie z `SERVER_PORT`; statystyki, ceny, sesje
admina i limity logowania są w MongoDB, więc może działać kilka instancji naraz. Kurs KakoBuy serwer pobiera sam co 6 h
(plik odświeżany co tydzień przez GitHub Actions). Aktualizacja bez nadpisania ustawień: `npm run paczka -- --bez-env --bez-zdjec`.

Na serwerze strona działa przez `server/serve.mjs` (zamiast `next start`): z `CLOUDFLARE_ONLY=1` przyjmuje tylko połączenia
z adresów Cloudflare i tylko dla goatreps.com, usuwa podrobione nagłówki `cf-*`, wpuszcza POST tylko z naszego Origin
i nie odpowiada na `/api/*` innym stronom. Ustawienia Cloudflare (DNS, port, SSL, cache zdjęć) – `PTERODACTYL.md`.

