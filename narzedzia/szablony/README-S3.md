# CDN goatreps – wysyłka na S3

Ten folder (`cdn/`) jest gotowy do skopiowania 1:1 do bucketu S3 podpiętego pod CDN
(np. `https://cdn.goatreps.com/<ścieżka>`). Generują go skrypty z `narzedzia/` (`npm run zdjecia`).
Nie edytuj plików ręcznie – przy kolejnym uruchomieniu skrypty dorzucą tylko brakujące.

## Struktura

| Folder | Zawartość | Format |
| --- | --- | --- |
| `i/<hash>.webp` | zdjęcie główne produktu | WebP, max 1400×1400, q78 |
| `t/<hash>.webp` | miniatura do siatki (ten sam hash co `i/`) | WebP, max 480×480, q72 |
| `q/<hash>.webp` | zdjęcia z galerii / QC | WebP, max 1400×1400, q78 |
| `p/<hash>.webp` | mały podgląd zdjęcia z galerii (ten sam hash co `q/`) – rząd miniatur na stronie produktu | WebP, max 360×360, q70 |
| `c/<slug>.webp` | grafiki kategorii (z przezroczystością) | WebP |
| `a/<agent>.webp` | logotypy agentów (z przezroczystością) | WebP |
| `b/goat.webp`, `b/banner.webp`, `b/goat.png` | grafiki marki (`goat.png` – oryginał do faviconów) | WebP / PNG |

`hash` = pierwsze 24 znaki sha1 adresu źródłowego zdjęcia (dla zdjęć z bazy – sha1 bajtów).
Nazwa zmienia się razem z treścią, więc pliki w `i/`, `t/`, `q/`, `p/` można cache'ować na zawsze.
Strona wylicza adres podglądu sama: wpis `q/<hash>.webp` z `gallery` → `p/<hash>.webp`
(w `gallery` są tylko zdjęcia, dla których istnieją oba pliki).

`manifest.json` – spis wszystkich plików z rozmiarem w bajtach (`totalFiles`, `totalBytes`, `folders`, `files`).
`README-S3.md` i `manifest.json` **nie** idą do bucketu.

## Wysyłka (rclone)

Jednorazowo skonfiguruj remote `s3` (`rclone config`, typ `s3`, dostawca AWS/R2/itp.).
Potem z folderu nadrzędnego (tam, gdzie leży `cdn/`):

```sh
rclone copy ./cdn s3:BUCKET --transfers 32 \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --exclude README-S3.md --exclude manifest.json
```

rclone ustawia `Content-Type` po rozszerzeniu (`.webp` → `image/webp`, `.png` → `image/png`).
Jeśli chcesz to wymusić, wyślij w dwóch przebiegach (`--include` pomija wszystko inne, także README i manifest):

```sh
rclone copy ./cdn s3:BUCKET --transfers 32 --include "*.webp" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: image/webp"

rclone copy ./cdn s3:BUCKET --include "b/goat.png" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --header-upload "Content-Type: image/png"
```

Uwaga: pliki w `c/`, `a/`, `b/` mają stałe nazwy (bez hasha). Jeśli kiedyś podmienisz taką grafikę,
po wysyłce unieważnij ją w CDN (np. CloudFront invalidation `/c/*`) albo wyślij ją pod nową nazwą.

Bucket nie musi być publiczny, jeśli CDN czyta go bezpośrednio (np. CloudFront z OAC).
Używaj `rclone copy`, nie `rclone sync` – `copy` niczego nie usuwa, więc stare adresy dalej działają.

## Sprawdzenie po wysyłce

```sh
# czy wszystko doszło (rozmiar + MD5, tylko w jedną stronę)
rclone check ./cdn s3:BUCKET --one-way --exclude README-S3.md --exclude manifest.json

# liczba plików i rozmiar – porównaj z totalFiles / totalBytes w manifest.json
rclone size s3:BUCKET

# nagłówki z CDN: oczekiwane 200, content-type: image/webp, cache-control: public, max-age=31536000, immutable
curl -I https://cdn.goatreps.com/b/goat.webp
curl -I https://cdn.goatreps.com/c/buty.webp
```

Sprawdź też dowolne zdjęcie produktu – weź ścieżkę `image` / `thumb` z `strona/data/products.json`
i otwórz `https://cdn.goatreps.com/<ścieżka>`.

## Strona

Strona składa adresy z ustawienia:

```
NEXT_PUBLIC_CDN_URL=https://cdn.goatreps.com
```

bez ukośnika na końcu. Adres zdjęcia = `${NEXT_PUBLIC_CDN_URL}/${product.image}`
(np. `https://cdn.goatreps.com/i/0123456789abcdef01234567.webp`).
W `products.json` są wyłącznie ścieżki względne (`i/…`, `t/…`, `q/…`) – żadnych zewnętrznych adresów zdjęć.
Podgląd galerii: `${NEXT_PUBLIC_CDN_URL}/${entry.replace(/^q\//, "p/")}`.

## Aktualizacja (nowe produkty)

W `narzedzia/`: `npm run snapshot`, `npm run scal`, `npm run zdjecia`, `npm run katalog`, `npm run sprawdz`,
potem ponownie powyższe `rclone copy` – wyśle tylko nowe pliki.
