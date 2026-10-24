# narzedzia – katalog i zdjęcia goatreps

Skrypty budujące `strona/data/products.json` + `strona/data/categories.json` oraz folder `cdn/`
(zdjęcia WebP gotowe do wysłania na S3). Wszystkie są wznawialne i można je uruchamiać wielokrotnie –
pomijają to, co już jest zrobione. Wymagany Node 22+ (`npm i` w tym folderze instaluje `sharp`).

## Kolejność

| # | Komenda | Co robi | Wynik |
| --- | --- | --- | --- |
| 1 | `npm run snapshot` | pobiera produkty z API starej strony (`/api/products`, po 100, przerwa 300 ms) | `zrodla/live/products.json` |
| 2 | `npm run kopia` | wyciąga produkty i obrazy z kopii bazy `backup (1).json` (bez pageViews/IP/user agentów, haseł, wektorów CLIP, flags) – tylko raz, przy nowej kopii | `zrodla/backup/` |
| 3 | `npm run scal` | scala kopię z danymi na żywo (dane na żywo wygrywają), czyści pola, nadaje id produktom bez id | `zrodla/scalone.json`, `zrodla/raporty/scalanie.json`, `przydzielone-id.json` |
| 4 | `npm run zdjecia` | pobiera i konwertuje zdjęcia: najpierw główne (`i/`, `t/`), potem galerię (`q/`, `p/`), potem grafiki starej strony (`c/`, `a/`, `b/`); na końcu `cdn/manifest.json` + `cdn/README-S3.md` | `cdn/`, oryginały w `zrodla/orig/`, nieudane w `zrodla/failed.txt` |
| 5 | `npm run katalog` | zapisuje dane dla strony – tylko ścieżki CDN, wyłącznie zdjęcia, które się udały | `strona/data/products.json`, `strona/data/categories.json` |
| 6 | `npm run sprawdz` | sprawdza kontrakt, pliki na CDN, manifest i brak wycieków (apiKey, IP, user agenty, hasła, zewnętrzne adresy zdjęć) | kod wyjścia 0 = OK |

Aktualizacja po pojawieniu się nowych produktów: `npm run aktualizuj` (= 1, 3, 4, 5, ponowne dopisanie zdjęć z Weidian ze stanu, 6), potem `rclone copy` wg `cdn/README-S3.md`.

Etapy zdjęć osobno: `npm run zdjecia:glowne`, `npm run zdjecia:galeria`, `npm run zdjecia:statyczne`.
Flaga `--bez-oryginalow` (np. `npm run zdjecia -- --bez-oryginalow`) nie zapisuje oryginałów w `zrodla/orig/`.
Sam spis CDN: `npm run manifest`.

## Zdjęcia QC z magazynu – `npm run qc`

Pobiera prawdziwe zdjęcia QC z magazynu USFans (`GET https://www.usfans.com/api/goods/estimate-info?goodsId=<itemId>`)
dla każdego unikalnego `itemId` z `strona/data/products.json` (weidian i 1688) i trzyma je u nas, więc QC działa bez starej strony.

- Wynik: `cdn/q/<hash>.webp` (max 1400 px, q78) + `cdn/p/<hash>.webp` (max 360 px, q70), hash = pierwsze 24 znaki sha1 adresu zdjęcia,
  oraz `strona/data/qc.json`: `{ updatedAt, source: "usfans", items: { "<itemId>": { photos: [hash…], weight, dims: { l, w, h }, arrivalDays, checkedAt } } }`.
  `weight` w gramach, `dims` w cm, `arrivalDays` = średni czas dotarcia do magazynu w dniach (tekst, np. `"5"`), `null` gdy brak.
  W `photos` są tylko zdjęcia z gotowym `q/` i `p/`. Wpis jest też dla przedmiotów bez zdjęć (żeby nie pytać o nie ponownie).
- Wznawialne: pomija przedmioty sprawdzone w ostatnich 7 dniach i istniejące pliki, ponawia brakujące zdjęcia; postęp zapisywany co 100 przedmiotów.
  `npm run qc -- --od-nowa` sprawdza wszystko jeszcze raz, `npm run qc -- --limit 150` sprawdza tylko 150 przedmiotów.
- Tempo: max 2 zapytania do API naraz, min. 700 ms między startami (pełny katalog ok. 30 min), zdjęcia max 6 naraz.
  Blokada (kod 90000, HTTP 403/429, captcha/HTML) = przerwa 10 min, potem 20, 40, 80; przy 5. blokadzie skrypt zapisuje postęp i kończy (kod 2) – uruchom ponownie później.
- Oryginały (niezaufane) w `zrodla/qc-orig/<hash>.<ext>`, adresy zdjęć z USFans w `zrodla/qc-orig/_usfans.json` (nie kopiować do `strona/`).
  Tylko jpeg/png/webp/gif/avif rozpoznane przez sharp, max 25 MB i 64 Mpx, timeout 60 s, tylko https (przekierowania poza https odrzucane).
- Zdjęcia są tylko dla przedmiotów, które ktoś zamówił przez USFans, więc większość wpisów ma `photos: []` – warto powtarzać np. raz w tygodniu.
  Na końcu skrypt odświeża `cdn/manifest.json`; potem `rclone copy` wg `cdn/README-S3.md`.

## Zdjęcia produktów z Weidian – `npm run weidian`

Pobiera zdjęcia oferty prosto z Weidian (`GET https://thor.weidian.com/detail/getItemInfo/1.0?param={"vItemId":"<itemId>"}`,
pole `result.default_model.item_info.imgs` – zdjęcia główne, max 15) dla każdego unikalnego `itemId` weidian z `strona/data/products.json`
i od razu dopisuje je do galerii produktów. Zdjęć wariantów (SKU) nie bierze – w jednej ofercie bywa wiele różnych produktów.

- Wynik: `cdn/q/<hash>.webp` (max 1400 px, q78) + `cdn/p/<hash>.webp` (max 360 px, q70); produkty bez zdjęcia głównego dostają też
  `cdn/i/` + `cdn/t/` z pierwszego zdjęcia z Weidian. Hash = pierwsze 24 znaki sha1 adresu oryginału (si.geilicdn.com bez `.webp?w=700&cp=1`);
  zdjęcie, które już jest w galerii ze starej strony (`zrodla/scalone.json`), zachowuje dotychczasowy hash – plik się nie dubluje.
- `products.json`: nowe `q/…` dopisywane na końcu `gallery`, w kolejności z Weidian, bez powtórzeń – pomijane zdjęcie główne (ten sam hash),
  zdjęcia już obecne oraz wizualnie takie same jak główne lub jak któreś z galerii (dHash, odległość ≤ 5; pierwsze zdjęcie z Weidian to zwykle
  zdjęcie główne). Wszystkie produkty z tym samym `itemId` dostają te zdjęcia. Plik zapisywany atomowo co 25 przedmiotów (ten sam format,
  jeden produkt na linię), strona wczytuje go sama – nowe zdjęcia widać od razu.
- Wznawialne: stan w `zrodla/weidian/_info.json` (adresy zdjęć, `checkedAt`, odciski dHash), pomija przedmioty sprawdzone w ostatnich 7 dniach,
  istniejące pliki i zapisane oryginały, ponawia brakujące zdjęcia. `npm run weidian -- --od-nowa` sprawdza wszystko jeszcze raz,
  `npm run weidian -- --limit 150` sprawdza tylko 150 przedmiotów.
- **Po samym `npm run katalog` galerie wracają do stanu ze `scalone.json`** – uruchom `npm run weidian -- --limit 0`, żeby dopisać
  zdjęcia z Weidian ze stanu (bez zapytań do Weidian; pobiera tylko brakujące zdjęcia). `npm run aktualizuj` robi to sam.
- Tempo: zapytania pojedynczo, co 1–1,5 s, zdjęcia max 4 naraz; gdy w kolejce czeka ponad 120 zdjęć, zapytania czekają.
  Wąskim gardłem jest serwer zdjęć (oryginały ok. 200 KB, niebuforowane potrafią iść 5–10 s) – ok. 0,75 zdjęcia/s,
  pierwszy pełny przebieg (ok. 2270 przedmiotów, śr. 8,7 zdjęcia) trwa kilka godzin. Kolejne przebiegi pobierają tylko nowe zdjęcia.
  Blokada (HTTP 403/429, 5xx po ponowieniach, przekierowanie, HTML/captcha, komunikat o weryfikacji, 10 błędów lub 20 nieudanych pobrań z rzędu)
  = przerwa 10 min, potem 20, 40; przy 4. blokadzie skrypt zapisuje postęp i kończy (kod 2) – uruchom ponownie później.
- Oryginały (niezaufane) w `zrodla/weidian/orig/<hash>.<ext>`. Tylko https z `*.geilicdn.com` (także przekierowania), max 15 MB,
  max 3 przekierowania, jpeg/png/webp/gif/avif rozpoznane przez sharp, max 64 Mpx, min. 200 px, proporcje do 1:4, WebP bez metadanych.
  Na końcu skrypt odświeża `cdn/manifest.json`; potem `rclone copy` wg `cdn/README-S3.md`.

## Klucz 2FA do panelu admina – `node admin-2fa.mjs`

Generuje losowy klucz TOTP (160 bitów, bez zależności – nie trzeba `npm i`) i wypisuje, jak go dodać do aplikacji z kodami
(Google Authenticator, Aegis, 2FAS) oraz jako `ADMIN_TOTP_SECRET` w `strona/.env` na serwerze. Po restarcie strony logowanie
do `/admin` pyta o hasło i jednorazowy 6-cyfrowy kod. Klucz jest wypisywany tylko na ekran – nie zapisuj go w repozytorium.
Opis panelu: `strona/README.md` → „Panel admina”.

## Zasady

- Zdjęcia: `hash` = pierwsze 24 znaki sha1 adresu źródłowego (dla `/api/image/<id>` i `data:` – sha1 bajtów).
  `i/` max 1400 px q78, `t/` max 480 px q72, `q/` max 1400 px q78, `p/` max 360 px q70 (ten sam hash co `q/`), `.rotate()` wg EXIF, bez powiększania, bez metadanych.
  Dla si.geilicdn.com najpierw próbowany jest oryginał (bez `.webp?w=700&cp=1`), potem podany adres.
- Pobrane pliki są niezaufane: tylko jpeg/png/webp/gif/avif/tiff rozpoznane przez sharp (SVG/HTML odrzucane), max 25 MB,
  max 64 Mpx, timeout 60 s, 4 próby z rosnącą przerwą, łącznie 12 pobrań naraz i max 6 na domenę.
- Produkt, którego zdjęcie się nie udało, zostaje w katalogu z `image: null` / `thumb: null`. W `gallery` są tylko zdjęcia z gotowym `q/` i `p/`.
- Produkty bez id dostają id od 100001 w górę (poza zakresem id starej strony, żeby nie kolidować z jej nowymi produktami).
  Przydział jest zapisany w `przydzielone-id.json` – nie usuwaj go, bo id zmieniłyby się przy kolejnym uruchomieniu.
- `zrodla/` to surowe, niezaufane dane (m.in. adresy z kluczem API photos.dekriss.pl) – nie kopiuj ich do `strona/` ani `cdn/`.
- Polskie nazwy kategorii są w `lib/wspolne.mjs` (`KATEGORIE`), zgodne z tłumaczeniami starej strony.

## Kursy walut KakoBuy (`npm run kurs`)

Strona przelicza juany na zł, € i $ po kursach KakoBuy, a nie po średnim NBP, bo KakoBuy ma narzut ok. 8% i ceny z NBP wychodziły za niskie.
Skrypt `kurs-kakobuy.mjs` otwiera kakobuy.com w ukrytej przeglądarce (Edge, Chrome albo Chromium; inną wskaż w zmiennej `BROWSER`),
odczytuje listę kursów, którą ich strona sama zapisuje w przeglądarce, i zapisuje ją do `strona/data/kursy.json` razem z narzutem względem NBP.

- Uruchamiaj raz dziennie (np. cron na serwerze). Strona używa pliku do 3 dni.
- Bez pliku albo ze starym plikiem strona liczy: średni kurs NBP × ostatni zmierzony narzut KakoBuy.
