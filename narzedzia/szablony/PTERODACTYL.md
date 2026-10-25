# goatreps.com na Pterodactyl z MongoDB

Strona startuje jednym plikiem i sama robi wszystko, co trzeba: instaluje paczki, wgrywa dane do bazy, buduje się
i uruchamia. Bez komend npm i bez crona.

## Co jest w paczce

| | |
| --- | --- |
| `goatreps.zip` (albo folder `goatreps/`) | strona: kod, dane katalogu (`data/`), plik startowy `index.js` |
| `goatreps/seed/` | obecne ceny i statystyki – wgrywane do MongoDB przy pierwszym starcie (do pustej bazy) |
| `cdn.tar` | zdjęcia produktów, kategorii i logo (ok. 1,25 GB, 26 tys. plików WebP) |
| `goatreps/.env.example` | wzór ustawień – na jego podstawie utwórz `.env` |

## Wymagania

- Obraz Node.js **22 lub 24** (np. `ghcr.io/parkervcp/yolks:nodejs_22`) i dostęp do internetu (instalacja paczek przy pierwszym starcie).
- **RAM: min. 2 GB przy pierwszym starcie** (budowanie strony), potem ok. 300–500 MB.
- **Dysk: ok. 3 GB** – zdjęcia 1,25 GB, paczki i zbudowana strona ok. 1 GB, zapas.
- **MongoDB 6+** (np. 7 albo 8). Baza zajmie niewiele (statystyki, ceny, sesje) – zdjęcia nie idą do bazy.

## Wgranie

1. W panelu: **Files → Upload** `goatreps.zip`, potem na pliku **Unarchive**. Przenieś zawartość folderu `goatreps/`
   do katalogu głównego serwera, tak żeby `index.js` był w `/home/container/index.js`.
2. Zdjęcia: wgraj `cdn.tar` (najlepiej przez **SFTP** – plik ma ok. 1,25 GB, panel może mieć limit wielkości uploadu)
   do katalogu głównego i rozpakuj (**Unarchive**). Ma powstać folder `/home/container/cdn/` z podfolderami `i/`, `t/`, `q/`, `p/`, `c/`, `a/`, `b/`.
   *Zamiast tego* możesz wgrać zawartość `cdn/` do S3/R2 i ustawić `NEXT_PUBLIC_CDN_URL` (wtedy folder na serwerze nie jest potrzebny).
3. **Startup → JS file / MAIN_FILE** = `index.js`.
4. Utwórz plik `.env` (Files → New File) – wzór poniżej. Hasła i klucze przekaże właściciel strony osobno.
5. **Start**.

## Ustawienia – plik `.env`

```env
MONGODB_URI=mongodb://UŻYTKOWNIK:HASŁO@HOST:27017/?authSource=admin
MONGODB_DB=goatreps
NEXT_PUBLIC_SITE_URL=https://goatreps.com
ADMIN_PASSWORD=…
ADMIN_SECRET=…
TRUST_PROXY=cf-connecting-ip
```

| Zmienna | Opis |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | baza MongoDB – statystyki, ceny, sesje admina i limity logowania idą do bazy `MONGODB_DB` |
| `NEXT_PUBLIC_SITE_URL` | adres strony (sitemap, linki) |
| `ADMIN_PASSWORD`, `ADMIN_SECRET` | panel `/admin`; `ADMIN_SECRET` min. 12 znaków i inny niż hasło; **na wszystkich instancjach takie same** |
| `ADMIN_TOTP_SECRET` | logowanie dwuetapowe do panelu (opcjonalnie; klucz z `node narzedzia/admin-2fa.mjs`) |
| `TRUST_PROXY` | skąd brać prawdziwy adres odwiedzającego: `cf-connecting-ip` za Cloudflare, `x-real-ip` za nginx/load balancerem. Bez tego limity zapytań liczą się wspólnie dla wszystkich |
| `NEXT_PUBLIC_CDN_URL` | (opcjonalnie) adres S3/R2 ze zdjęciami – pusty = zdjęcia z folderu `cdn/` na serwerze |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` lub `GEMINI_API_KEY` | wyszukiwanie po zdjęciu (`/photo-search`); bez kluczy narzędzie pokaże, że jest wyłączone |

Port bierze się sam z `SERVER_PORT` (przydział w Pterodactyl).

## Pierwszy start

W konsoli widać kolejne kroki (wpisy `[goatreps]`):

1. instalacja paczek (`npm ci`) – ok. 1 min,
2. `Zdjęcia z dysku: /home/container/cdn` (albo `Zdjęcia z CDN: …`) – jeśli jest **UWAGA** o braku zdjęć, sprawdź punkt 2 wgrania,
3. wgranie `seed/` do MongoDB – kilka sekund (`Ceny wgrane…`, statystyki),
4. budowanie strony – 1–3 min,
5. `Ready` – strona działa.

Kolejne starty trwają sekundy – instalacja i budowanie powtarzają się tylko, gdy zmienią się pliki strony albo `.env`.
Dane z `seed/` wgrywają się tylko raz (do pustej bazy) – restarty niczego nie nadpisują. Po pierwszym starcie folder `seed/` można usunąć.

## Kilka instancji (HA)

- Wszystkie instancje łączą się z **tą samą bazą** i mają **ten sam `.env`** – sesje admina, limity logowania, statystyki
  i ceny są wspólne, więc load balancer może wysyłać zapytania do dowolnej instancji.
- Każda instancja buduje stronę identycznie (wspólny identyfikator wersji i klucz szyfrowania wyliczane z plików
  i `ADMIN_SECRET`) – logowanie i nawigacja działają, nawet gdy kolejne zapytania trafiają do różnych instancji.
- Przy wspólnym dysku jedna instancja buduje, a pozostałe czekają na gotową wersję.
- Zdjęcia: każda instancja potrzebuje folderu `cdn/` (albo wszystkie korzystają z `NEXT_PUBLIC_CDN_URL`).

## Aktualizacja strony

Wgraj nowe pliki strony (bez nadpisywania `.env` i `cdn/`) i zrestartuj serwer – strona sama doinstaluje paczki
i przebuduje się, jeśli coś się zmieniło. Nowe zdjęcia: dograj brakujące pliki do `cdn/` (nazwy plików się nie zmieniają).

## Gdy coś nie działa

| Objaw w konsoli | Co zrobić |
| --- | --- |
| `Nie udało się zainstalować zależności` | serwer potrzebuje dostępu do internetu (registry.npmjs.org) |
| `Build się nie udał` / proces ubity w trakcie | za mało RAM – na pierwszy start daj min. 2 GB |
| `Wgrywanie danych do MongoDB nie powiodło się` | sprawdź `MONGODB_URI` (użytkownik, hasło, `authSource`) i czy baza jest osiągalna z kontenera |
| `[mongo] brak połączenia` w trakcie działania | baza niedostępna – strona działa dalej, ale logowanie do panelu jest wtedy zablokowane (celowo) |
| `Brak MONGODB_URI` | brak pliku `.env` albo zmiennej – strona działa wtedy bez bazy (statystyki i ceny w plikach w `data/`) |
| `UWAGA: nie ma folderu ze zdjęciami` | rozpakuj `cdn.tar` w katalogu głównym albo ustaw `NEXT_PUBLIC_CDN_URL` |
| panel `/admin`: „Panel nie jest skonfigurowany” | brak `ADMIN_PASSWORD` / `ADMIN_SECRET` w `.env` |
