# goatreps.com na Pterodactyl z MongoDB

Strona startuje jednym plikiem i sama robi wszystko, co trzeba: instaluje paczki, wgrywa dane do bazy, buduje się
i uruchamia. Bez komend npm i bez crona.

## Co jest w paczce

| | |
| --- | --- |
| `goatreps.zip` (albo folder `goatreps/`) | strona: kod, dane katalogu (`data/`), plik startowy `index.js` i **gotowy `.env`** |
| `goatreps/seed/` | obecne ceny i statystyki – wgrywane do MongoDB przy pierwszym starcie (do pustej bazy) |
| `cdn.tar` | zdjęcia produktów, kategorii i logo (ok. 1,25 GB, 26 tys. plików WebP) |
| `pterodactyl.env` | to samo co `goatreps/.env` – kopia ustawień u Ciebie (hasło do panelu jest w linii `ADMIN_PASSWORD=`) |
| `vercel.env` | te same ustawienia dla Vercela (do wklejenia w Settings → Environment Variables) |

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
4. Plik `.env` jest już w paczce (hasło i klucz panelu, klucze AI, adres strony, `TRUST_PROXY` dla Cloudflare).
   Otwórz go w **Files** i wpisz tylko adres bazy w `MONGODB_URI=` (bez bazy strona też działa – na plikach).
5. **Start**.

## Ustawienia – plik `.env`

Gotowy plik wygląda tak (wartości są już wpisane, puste zostaje tylko `MONGODB_URI`):

```env
MONGODB_URI=mongodb://UŻYTKOWNIK:HASŁO@HOST:27017/?authSource=admin
MONGODB_DB=goatreps
ADMIN_PASSWORD=…
ADMIN_SECRET=…
OPENAI_BASE_URL=…
OPENAI_API_KEY=…
GEMINI_API_KEY=…
NEXT_PUBLIC_SITE_URL=https://goatreps.com
NEXT_PUBLIC_CDN_URL=
CLOUDFLARE_ONLY=1
TRUST_PROXY=cf-connecting-ip
# CF_ORIGIN_SECRET=…   (gotowy klucz – włączasz po kroku 5 w „Cloudflare”)
```

| Zmienna | Opis |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | baza MongoDB – statystyki, ceny, sesje admina i limity logowania idą do bazy `MONGODB_DB` |
| `NEXT_PUBLIC_SITE_URL` | adres strony (sitemap, linki) |
| `ADMIN_PASSWORD`, `ADMIN_SECRET` | panel `/admin`; `ADMIN_SECRET` min. 12 znaków i inny niż hasło; **na wszystkich instancjach takie same** |
| `ADMIN_TOTP_SECRET` | logowanie dwuetapowe do panelu (opcjonalnie; klucz z `node narzedzia/admin-2fa.mjs`) |
| `TRUST_PROXY` | skąd brać prawdziwy adres odwiedzającego: `cf-connecting-ip` za Cloudflare, `x-real-ip` za nginx/load balancerem. Bez tego limity zapytań liczą się wspólnie dla wszystkich |
| `CLOUDFLARE_ONLY` | `1` = serwer przyjmuje tylko połączenia z adresów Cloudflare i tylko dla goatreps.com (www przekierowuje na goatreps.com); `0` = na czas testu przez `http://IP:PORT` |
| `CF_ORIGIN_SECRET` | (opcjonalnie) tajny nagłówek `X-Origin-Secret` dopisywany przez regułę w Cloudflare – wpuszczane są tylko zapytania z nim |
| `TRUST_LOCAL_NETWORK` | (opcjonalnie) `0` = ruch z sieci lokalnej (Docker, 172.x / 10.x / 192.168.x) traktowany jak obcy; domyślnie zaufany (reverse proxy na węźle) |
| `ALLOWED_HOSTS` | (opcjonalnie) dodatkowe domeny po przecinku, np. `goatreps.pl` – domyślnie tylko goatreps.com i www.goatreps.com |
| `NEXT_PUBLIC_CDN_URL` | (opcjonalnie) adres S3/R2 ze zdjęciami – pusty = zdjęcia z folderu `cdn/` na serwerze |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` lub `GEMINI_API_KEY` | wyszukiwanie po zdjęciu (`/photo-search`); bez kluczy narzędzie pokaże, że jest wyłączone |
| `KURSY_URL` | (opcjonalnie) skąd brać kurs KakoBuy – domyślnie plik z repo na GitHubie; `off` wyłącza |

Port bierze się sam z `SERVER_PORT` (przydział w Pterodactyl).

## Cloudflare (domena goatreps.com)

Strona jest ustawiona pod goatreps.com za Cloudflare (`CLOUDFLARE_ONLY=1`): wejście bezpośrednio na `http://IP:PORT`
serwera dostaje 403 – to celowe, żeby nikt nie ominął Cloudflare. W panelu Cloudflare (domena goatreps.com):

1. **DNS → Records**: rekord `A` `goatreps.com` → adres IP serwera (węzła Pterodactyl), **Proxy status: Proxied**
   (pomarańczowa chmurka). Rekord `CNAME` `www` → `goatreps.com`, też Proxied (www przekierowuje na goatreps.com).
2. **Rules → Origin Rules → Create rule**: *Hostname equals* `goatreps.com` **OR** *Hostname equals* `www.goatreps.com`
   → **Destination Port: Rewrite to** port serwera z Pterodactyl (zakładka Network, ten sam co `SERVER_PORT`).
3. **SSL/TLS → Overview: Flexible** (serwer mówi zwykłym HTTP, HTTPS dla odwiedzających daje Cloudflare);
   **SSL/TLS → Edge Certificates → Always Use HTTPS: On**.
4. **Zdjęcia** działają same: `https://goatreps.com/cdn/…` mają nagłówek cache na rok, więc Cloudflare trzyma je u siebie
   i serwer wysyła każde zdjęcie tylko raz. (Opcjonalnie) **Caching → Cache Rules**: *URI Path starts with* `/cdn/`
   → *Eligible for cache*, *Edge TTL: Use cache-control header if present*.
5. **(najmocniej, opcjonalnie)** **Rules → Transform Rules → Modify Request Header → Create rule**: *All incoming requests*
   → **Set static**, nazwa `X-Origin-Secret`, wartość = klucz z linii `# CF_ORIGIN_SECRET=` w `.env`. Zapisz regułę,
   potem w `.env` usuń `# ` przed `CF_ORIGIN_SECRET` i zrestartuj serwer. Od tej chwili stronę dostanie tylko Twoja
   strefa Cloudflare (nawet inne konto Cloudflare skierowane na IP serwera dostanie 403).
6. **(opcjonalnie)** **Security → WAF → Rate limiting rules**: *URI Path equals* `/api/image-search`, np. 5 zapytań
   na 10 s z jednego IP → Block (wyszukiwanie po zdjęciu kosztuje – strona ma też własne limity).

Test przed przepięciem domeny: ustaw na chwilę `CLOUDFLARE_ONLY=0`, wejdź na `http://IP:PORT`, potem wróć do `1`.

Co jeszcze pilnuje serwer (bez ustawiania): podrobione nagłówki `cf-*` / `x-forwarded-*` spoza Cloudflare są usuwane,
formularze i akcje (POST) przyjmowane są tylko z goatreps.com, API (`/api/*`) nie odpowiada innym stronom,
zapytania > 6 MB i wolne połączenia są ucinane, a lista adresów Cloudflare odświeża się raz na dobę.

## Kurs KakoBuy (ceny w zł, € i $)

Działa sam, nic nie trzeba ustawiać:

- raz w tygodniu (poniedziałek rano) GitHub Actions otwiera kakobuy.com w Chrome, odczytuje kursy walut i zapisuje je
  w repo (`strona/data/kursy.json`),
- serwer co 6 h sprawdza ten plik i podmienia kurs bez restartu (w konsoli: `Kurs KakoBuy z RRRR-MM-DD: 1 CNY = … zł`),
- gdy przez 10 dni nie będzie nowego kursu, strona liczy średni kurs NBP z narzutem KakoBuy (ok. 8%), więc ceny dalej są zbliżone.

Ręcznie: na GitHubie **Actions → Kurs KakoBuy → Run workflow**.

## Pierwszy start

W konsoli widać kolejne kroki (wpisy `[goatreps]`):

1. instalacja paczek (`npm ci`) – ok. 1 min,
2. `Zdjęcia z dysku: /home/container/cdn` (albo `Zdjęcia z CDN: …`) – jeśli jest **UWAGA** o braku zdjęć, sprawdź punkt 2 wgrania,
3. wgranie `seed/` do MongoDB – kilka sekund (`Ceny wgrane…`, statystyki),
4. budowanie strony – 1–3 min,
5. `Strona działa na porcie … – tylko przez Cloudflare` – gotowe.

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

Złóż paczkę bez ustawień (`npm run paczka -- --bez-env --bez-zdjec` w `narzedzia/`), wgraj nowe pliki strony
(bez nadpisywania `.env` i `cdn/`) i zrestartuj serwer – strona sama doinstaluje paczki i przebuduje się, jeśli coś się
zmieniło. Nowe zdjęcia: dograj brakujące pliki do `cdn/` (nazwy plików się nie zmieniają).

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
| `Nie udało się pobrać kursu KakoBuy` | serwer nie ma dostępu do raw.githubusercontent.com – strona liczy dalej po ostatnim kursie |
| `Odrzucono zapytanie (… – spoza Cloudflare)`, w przeglądarce 403 | wchodzisz na IP:port zamiast goatreps.com – to celowe; do testu `CLOUDFLARE_ONLY=0` |
| goatreps.com: 403 „Strona działa tylko przez…” | rekord DNS nie jest Proxied (szara chmurka) albo włączony `CF_ORIGIN_SECRET` bez reguły z kroku 5 |
| goatreps.com: błąd 521 / 522 Cloudflare | serwer wyłączony albo zły port w Origin Rule (krok 2) |
| `Zapytania przychodzą z sieci lokalnej` | przed stroną jest proxy/Docker – zablokuj bezpośredni dostęp do portu albo `TRUST_LOCAL_NETWORK=0` |
