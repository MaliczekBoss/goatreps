# Specyfikacja funkcjonalna starej strony goatreps.com

Stan na 2026-10-24. Opracowane z produkcyjnych bundli JS (Next.js pages router, build `q6BRrOeu8vZ7xxnxalmf3`), z HTML strony głównej, z kilkudziesięciu GET-ów do publicznych stron i API oraz ze struktury lokalnego backupu bazy `backup (1).json`. Z backupu brane były tylko schemat i statystyki katalogu, bez danych osobowych.

Oznaczenia źródeł: **[kod]** – odczytane z bundla, **[live]** – zaobserwowane na żywej stronie, **[backup]** – z backupu Mongo, **[wniosek]** – interpretacja, niezweryfikowana bezpośrednio.

Pliki towarzyszące (wszystkie w `docs/`):

| Plik | Zawartość |
|---|---|
| `agents.json` | agenci, kody polecające, szablony linków, kolory, logo |
| `link-converter.md` | pseudo-kod konwertera do portu w TS + przypadki testowe |
| `link-converter-cases.json` | 31 przypadków: wejście → wynik oryginalnego kodu |
| `katalog.json` | kategorie (kolejność, etykiety, ikony, liczby), tagi/badge, sortowanie, waluty, języki, rozmiary stron, klucze localStorage |
| `shipping.json` | kraje, format API wysyłki, wzór przeliczenia, snapshoty odpowiedzi |
| `i18n-stara-strona.json` | cały słownik pl+en (bez sekcji admina) |
| `copy-strona-glowna.json` | teksty faktycznie renderowane: meta/OG, navbar, szuflady, modal wyszukiwania, sekcje home, popup, 404 |

---

## 0. Przegląd

### 0.1 Stack i architektura
- Next.js (pages router), React 19, Tailwind v4 + shadcn/ui (Radix), framer-motion, sonner (toaster), lucide-react, `react-country-flag` (flagi SVG z `cdn.jsdelivr.net/gh/lipis/flag-icons`). **[kod]**
- Wszystkie strony to statyczny eksport (`autoExport: true`, `pageProps: {}`). Dane pobiera klient (`fetch` w `useEffect`). Brak SSR/SEO dla produktów: `/item/details/[id]` ma ten sam ogólny `<title>`. **[kod][live]**
- Motyw wyłącznie ciemny (`class="dark"`). Font Inter (next/font). `--primary: #920515`, tło `oklch(.141 .005 285.823)`, kontener `.site-container` = `max-width: 80rem`, padding 1rem (1.5rem od `sm`). **[live css]**
- Za Cloudflare. API zachowuje się jak dwa backendy: `/api/products` i `/api/product/:id` (etag `W/…`, bez nagłówków bezpieczeństwa) oraz `/api/shipping`, `/api/qc`, `/api/tracking`, `/api/page-views` (pełny zestaw nagłówków w stylu helmet, CORS z `allow-credentials`). Nagłówków `/api/image-search` nie sprawdzano, ale ma ten sam styl błędów JSON. **[live][wniosek]**
- Baza: MongoDB, baza `goatreps`, kolekcje `products` (3237 dok.), `pageViews` (7272), `images` (15, base64 webp serwowane jako `/api/image/{objectId}`), `adminCredentials`, `adminSessions`, `bestBatches` (pusta), `tracking` (pusta). **[backup]**

### 0.2 Trasy
| Trasa | Opis |
|---|---|
| `/` | strona główna |
| `/products` | katalog (W2C) z filtrami, infinite scroll, wyszukiwaniem po zdjęciu |
| `/item/details/[id]` | szczegóły produktu |
| `/tools` | hub narzędzi |
| `/link-converter` | konwerter linków |
| `/qc-finder` | wyszukiwarka zdjęć QC |
| `/shipping` | kalkulator wysyłki |
| `/tracking` | śledzenie paczek |
| `/404`, `/500`, `/_error` | strony błędów |
| `/i2189srrasw`, `/i2189srrasw/item/[id]` | panel admina. Tylko odnotowany, nieanalizowany. Ścieżka jawna w `_buildManifest.js` |

Nie ma `robots.txt` (404), sitemapy, polityki prywatności, regulaminu ani banera cookies. **[live]**

### 0.3 Elementy globalne (każda strona poza adminem) **[kod]**
- **Navbar** (fixed, zaokrąglony pasek). Po lewej logo `/goat.png` + „Goat Reps”. Na środku linki „Produkty” (`/products`) i „Narzędzia” (`/tools`). Po prawej:
  - przycisk wyszukiwania „Szukaj produktów...” + `⌘K`,
  - serce (szuflada Ulubione z licznikiem `9+`),
  - ikona ustawień (szuflada Ustawienia),
  - hamburger na mobile (Produkty, Narzędzia).
- **Szuflada „Ulubione”** („Twoje polubione produkty”). Pusta: „Brak polubionych produktów” / „Kliknij serce na karcie produktu aby dodać do ulubionych”. Element listy: miniatura, tytuł, badge `{quality}/10`, „Zobacz szczegóły” → `/item/details/{id}`, przycisk „Usuń z ulubionych”. Dane w `localStorage.likedProducts`, synchronizacja między kartami przez zdarzenie `storage` + `CustomEvent('liked-products-sync')`.
- **Szuflada „Ustawienia”** („Waluta i agent zakupowy”) ma trzy pola:
  - Język: Polski/English z flagą PL/GB,
  - Waluta: „PLN — Złoty”, „USD — Dolar”, „EUR — Euro”,
  - Agent zakupowy: KakoBuy, USFans, AllChinaBuy (logo w grayscale), ACBuy, LitBuy.
- **Modal wyszukiwania** (`Ctrl/⌘+K` lub klik w pole):
  - minimum 2 znaki, debounce 300 ms, `GET /api/products?search={q}&page=1&count=3`,
  - wynik: miniatura, tytuł, cena w walucie użytkownika; klik → `/item/details/{id}`,
  - Enter → `/products?search={q}`, Esc zamyka,
  - przy pustym zapytaniu sekcja „Narzędzia”: Konwerter linków (`/link-converter`), Śledzenie paczki (`/tracking`), Znajdź QC (`/qc-finder`).
- **Pływający pasek społecznościowy** (tylko `md+`, prawa krawędź, pionowo): Discord (`#5865F2`) → `https://discord.gg/QaBEPx8Vsq`, TikTok → `https://www.tiktok.com/@goatreps`, logo KakoBuy → `https://ikako.vip/r/Perkoz`.
- **Popup powitalny KakoBuy** – patrz 6.4.
- **Śledzenie odsłon** – `POST /api/page-views` przy każdej zmianie trasy (patrz 7).
- Toaster sonner jest zamontowany, ale strony go praktycznie nie używają.

---

## 1. Agenci zakupowi

### 1.1 Lista (pełne dane: `agents.json`) **[kod][backup][live]**

| key (konwerter) | Nazwa | settingsKey (`userSettings.defaultAgent`) | Pole API | Logo | Kolor przycisku „Kup na” | Kod polecający | W ustawieniach | W konwerterze |
|---|---|---|---|---|---|---|---|---|
| `kakobuy` | KakoBuy | `kakoBuy` (**domyślny**) | `kakobuy_link` | `/agents/kakobuy.png` | `bg-red-600` (#e7000b), tekst biały | `affcode=Perkoz`; rejestracja `https://ikako.vip/r/Perkoz` | tak | tak |
| `usfans` | USFans | `usFans` | `usfans_link` | `/agents/usfans.png` | `bg-white`, tekst czarny | `ref=GSWJ8H` | tak | tak |
| `allchinabuy` | AllChinaBuy | `allchinabuy` | `allchinabuy_link` | `/agents/allchinabuy.png` (grayscale w ustawieniach) | `bg-white`, tekst czarny | `partnercode=wVSV4X` | tak | tak |
| `acbuy` | ACBuy | `acbuy` | `acbuy_link` | `/agents/acbuy.png` | `bg-green-400` (#05df72), tekst czarny | `u=MD2BNM` | tak | tak |
| `litbuy` | LitBuy | `litbuy` | `litbuy_link` | `/agents/litbuy.png` | `bg-yellow-400` (#fdc700), tekst czarny | `inviteCode=GOATREPS` | tak | tak |
| `oopbuy` | OopBuy | – | `oopbuy_link` | brak (404) | – | pusty `ref` | nie | tak |
| `mulebuy` | MuleBuy | – | `mulebuy_link` | brak (404) | – | `ref=200910978` | nie | tak |
| `cnfans` | CNFans | – | `cnfans_link` | brak (404) | – | brak w kodzie; w bazie `ref=634281` w 190 linkach, reszta pusta | nie | **nie** |

Uwaga na niespójne klucze w kodzie: `kakoBuy`/`usFans` (camelCase) w ustawieniach i w karcie produktu, ale `kakobuy`/`usfans` w konwerterze i w i18n. Mapowanie ustawień na pole API **[kod]**:
`{kakoBuy:'kakobuy_link', usFans:'usfans_link', allchinabuy:'allchinabuy_link', acbuy:'acbuy_link', litbuy:'litbuy_link'}[defaultAgent] || default_link`. Na stronie produktu przy nieznanym agencie fallback to `kakobuy_link`.

### 1.2 Szablony linków (`{id}` = ID przedmiotu) **[kod]**

| Agent | Weidian | Taobao | 1688 |
|---|---|---|---|
| KakoBuy | `https://kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D{id}&affcode=Perkoz` | `https://kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D{id}&affcode=Perkoz` | `https://kakobuy.com/item/details?url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F{id}.html&affcode=Perkoz` |
| AllChinaBuy | `https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url={enc(weidian)}&partnercode=wVSV4X` | jw. z `enc(taobao)` | jw. z `enc(1688)` |
| LitBuy | `https://litbuy.com/product/weidian/{id}?inviteCode=GOATREPS` | `…/product/taobao/{id}?inviteCode=GOATREPS` | `…/product/1688/{id}?inviteCode=GOATREPS` |
| USFans | `https://www.usfans.com/product/3/{id}?ref=GSWJ8H` | `…/product/2/{id}?ref=GSWJ8H` | `…/product/1/{id}?ref=GSWJ8H` |
| ACBuy | `https://www.acbuy.com/product?id={id}&source=WD&u=MD2BNM` | `…&source=TB&u=MD2BNM` | `…&source=AL&u=MD2BNM` |
| OopBuy | `https://oopbuy.com/product/WEIDIAN/{id}` | `…/product/TAOBAO/{id}` | `…/product/1688/{id}` |
| MuleBuy | `https://mulebuy.com/product?id={id}&platform=WEIDIAN&ref=200910978` | `…&platform=TAOBAO&ref=200910978` | `…&platform=ALI_1688&ref=200910978` |
| CNFans [backup] | `https://cnfans.com/product/?shop_type=weidian&id={id}&ref=` | `shop_type=taobao` [wniosek] | `shop_type=1688` |

Linki kanoniczne marketplace: `https://weidian.com/item.html?itemID={id}`, `https://item.taobao.com/item.htm?id={id}`, `https://detail.1688.com/offer/{id}.html`. `enc()` = `encodeURIComponent`.

### 1.3 Wybór agenta i waluty – `localStorage.userSettings` **[kod]**
- Format: `{"defaultCurrency":"PLN"|"USD"|"EUR","defaultAgent":"kakoBuy"|"usFans"|"allchinabuy"|"acbuy"|"litbuy"}`. Zapisywany zawsze w całości przy każdej zmianie w szufladzie ustawień.
- Domyślne wartości: `PLN` i `kakoBuy`. Błąd JSON daje te same domyślne.
- Navbar nasłuchuje `storage` i `userSettingsChanged`, ale **nic nie emituje** `userSettingsChanged`. Strony czytają ustawienia tylko przy montowaniu, więc zmiana agenta/waluty działa dopiero po przejściu na inną stronę lub reloadzie. Bug do poprawienia.
- Język: osobny klucz `localStorage.goatreps_language` (`pl`|`en`, domyślnie `pl`).

### 1.4 Gdzie linki agentów są używane
- **Karta produktu**: link agenta jest używany tylko wtedy, gdy produkt nie ma `price`. Praktycznie zawsze karta prowadzi do `/item/details/{id}`.
- **Strona produktu**: jeden przycisk „Kup na {Agent}” dla agenta z ustawień (kolor wg 1.1) oraz przycisk „Oryginał” (`default_link`). **Nie ma** listy przycisków dla wszystkich agentów.
- **Problem z afiliacją** **[backup]**: linki zapisane w bazie mają kody tylko częściowo.
  - KakoBuy: `affcode=Perkoz` we wszystkich 3235 produktach z linkami.
  - USFans, LitBuy, ACBuy, MuleBuy, AllChinaBuy: tylko 212–213 linków z kodem, ~3022 z pustym `ref=` / `inviteCode=` / `u=` / `partnercode=`.
  - Kto wybierze w ustawieniach innego agenta niż KakoBuy, w ~93% przypadków dostaje link **bez** polecenia.
  - **Rekomendacja:** w nowej stronie generować link przy renderze z `(platform, itemId)` szablonami z 1.2, a w bazie trzymać tylko `default_link`/`itemId`/`platform`.
- Platforma w bazie: `platform` = `"WD"` (2947) albo `null` (290); `default_link` = Weidian w 3236 przypadkach, 1688 w jednym. Katalog to w praktyce 99,97% Weidian.

---

## 2. Link Converter (`/link-converter`)

Pełna specyfikacja do portu: **`link-converter.md`**. W skrócie:

- **Wejście rozpoznawane:**
  - KakoBuy (`kakobuy.com…?url=`),
  - AllChinaBuy (`allchinabuy.com…?url=`),
  - LitBuy (`/product/{weidian|taobao|1688}/{id}`),
  - USFans (`/product/{3|2|1}/{id}`),
  - ACBuy (`?id=&source=WD|TB|AL`),
  - OopBuy (`/product/{WEIDIAN|TAOBAO|1688}/{id}`),
  - MuleBuy (`?id=&platform=WEIDIAN|TAOBAO|ALI_1688`),
  - bezpośrednie linki: `weidian.com` (`itemID=`), `taobao.com` (`\bid=`), `1688.com` (`offer/{id}`).
- CNFans, Tmall, `world.taobao.com/item/{id}.htm` i shortlinki **nie** są obsługiwane.
- **Wyjście:** link oryginalny + 7 agentów (KakoBuy, AllChinaBuy, LitBuy, USFans, ACBuy, OopBuy, MuleBuy) z kodami z modułu `1366`. Filtr agenta w dropdownie, kopiowanie i otwieranie każdego linku.
- Konwersja działa w 100% po stronie klienta, bez API.
- Znane błędy B1–B8 opisuje `link-converter.md` §5.

---

## 3. Waluty

### 3.1 Źródło kursów – singleton `CurrencyService` (moduł `1552` w `_app`) **[kod]**
- `getRates()` jest wołane po stronie **klienta**. Cache trwa 1 h (`UPDATE_INTERVAL = 3_600_000` ms), w pamięci modułu, czyli osobno dla każdej karty i resetowany po reloadzie. Cache jest używany, jeśli `rates.PLN !== 0`.
- `fetchRatesFromMultipleAPIs()` odpytuje równolegle (`Promise.allSettled`) trzy źródła:
  1. `GET https://api.exchangerate-api.com/v4/latest/CNY` → `rates.PLN/USD/EUR`,
  2. `GET https://api.fixer.io/latest?base=CNY` → `rates.*` (stary endpoint fixer.io, obecnie wymaga klucza i trafia do `null`) **[wniosek]**,
  3. `GET https://api.currencyapi.com/v3/latest?base_currency=CNY` → `data.PLN.value` itd. (bez klucza API, więc też `null`) **[wniosek]**.
- `averageRates()` liczy średnią arytmetyczną z odpowiedzi, które mają PLN, USD i EUR ≠ 0. Wynik: `{PLN, USD, EUR, CNY: 1}`. W praktyce działa tylko exchangerate-api.
- Fallback (wszystko padło / brak danych): `{PLN: 0.58, USD: 0.14, EUR: 0.13, CNY: 1}`, czyli mnożniki CNY → waluta.
- `convertFromCNY(amount, cur) = rates[cur] === 0 ? amount * fallback[cur] : amount * rates[cur]`.

### 3.2 Waluty i formatowanie **[kod]**
- Do wyboru PLN (domyślna), USD, EUR. CNY nie jest do wyboru; pojawia się tylko, gdy kursy jeszcze się nie załadowały. Symbole: `PLN → "zł"`, `USD → "$"`, `EUR → "€"`.
- Formatowanie w poszczególnych miejscach:

| Miejsce | Kursy dostępne | Kursy niezaładowane |
|---|---|---|
| Karta produktu, modal wyszukiwania | `${convertFromCNY(p).toFixed(0)} ${symbol}`, np. `376 zł`, `52 $`, `47 €` | `${price} CNY` |
| Strona produktu (cena główna) | `${symbol}${value.toFixed(0)}`, symbol **przed** liczbą, np. `zł376` (niespójne) | `¥${price}` |
| Strona produktu (druga linia) | `¥{price} CNY` | – |
| Kalkulator wysyłki | `x.toFixed(2) + " zł"`; kurs PLN/USD = `rates.PLN / rates.USD`, domyślnie `4` | – |
| Slider ceny | max w walucie użytkownika = `10 * ceil(2000 * rate / 10)`, krok 10; do API idzie CNY = `Math.round(value / rate)` | – |

- Zaokrąglenie: `toFixed(0)` (zaokrąglenie połówkowe JS) dla cen produktów, `toFixed(2)` dla wysyłki.
- **Rekomendacja:** kursy pobierać po stronie serwera (np. NBP API lub exchangerate-api) i cache'ować (ISR/Route Handler, 1–12 h). Przeglądarka nie powinna dzwonić do 3 obcych API, z których 2 i tak nie działają.

---

## 4. Produkty

### 4.1 API produktów **[kod][live]**
`GET /api/products?page={n}&count={k}&sort={s}[&category={c}][&search={q}][&minPrice={cny}][&maxPrice={cny}]`
- `page` od 1. `count` jest obcinany po stronie serwera do **100** (`count=500` daje 100).
- `sort`: `newest` | `oldest` | `price_asc` | `price_desc`.
- `category`: klucz z 4.2. Pusta kategoria (`""`) dotyczy 217 produktów, które da się zobaczyć tylko pod „Wszystkie”.
- `search`: case-insensitive po tytule (`JORDAN` daje 128 wyników). **Nie** przeszukuje tagów (`BESTBATCH` daje 0). Czy przeszukuje opis – nie ustalono.
- `minPrice` / `maxPrice` w CNY. Nieznane parametry (np. `tags=`) są ignorowane.
- Odpowiedź: `{ products: Product[], total: number }`. `total` to łączna liczba trafień (3239 dla całego katalogu 2026-10-24).
- `Product` (API, snake_case):
  ```
  id:number, title, description, price:number(CNY), image_url, images:string[], platform:"WD"|null,
  average_arrival:string|null ("4-7"), dimensions:{weight,length,width,height,formattedDimensions}|{}|null,
  category, tags:string[], quality:7..10, default_link, kakobuy_link, cnfans_link, allchinabuy_link,
  litbuy_link, usfans_link, acbuy_link, oopbuy_link, mulebuy_link, created_at, updated_at
  ```
- `GET /api/product/{id}` → `{ product: Product }` albo `404 {"error":"Not found"}`.
- W bazie (camelCase, Mongo) są dodatkowo: `links{default,kakobuy,cnfans,allchinabuy,litbuy,usfans,acbuy,oopbuy,mulebuy}`, `flags{changedLink, addedViaSlash}` (dodane przez komendę slash na Discordzie, 292 szt.) **[wniosek]**, `imageVector` (512 float), `vectors{normalBg,scaleBg,noBg,centerBg,highResBg}` (każdy 512 float), `legacyId`. **[backup]**
- Zdjęcia: `image_url` wskazuje na
  - `photos.dekriss.pl/api/assets/{uuid}/thumbnail?apiKey=…&size=preview` (Immich, z kluczem API w URL – patrz 8),
  - `cdn.dekriss.pl/images/…`,
  - `si.geilicdn.com` (CDN Weidian), `i.postimg.cc`, `/api/image/{id}`.

  Pole `images[]` to głównie `si.geilicdn.com`. **[backup]**

### 4.2 Kategorie (kolejność jak w UI; `katalog.json`) **[kod][backup]**

| # | key | Etykieta PL | Ikona (home) | Produktów |
|---|---|---|---|---|
| 0 | `all` | Wszystkie | – (tylko `/products`) | 3239 |
| 1 | `buty` | Buty | `/clothes/buty.png` | 658 |
| 2 | `koszulki` | Koszulki | `/clothes/koszulki.png` | 617 |
| 3 | `bluzy` | Bluzy | `/clothes/bluzy.png` | 489 |
| 4 | `swetry` | Swetry *(hardcoded)* | `/clothes/swetry.png` | **0** |
| 5 | `kurtki` | Kurtki | `/clothes/kurtki.png` | 136 |
| 6 | `sety` | Sety *(hardcoded)* | `/clothes/sety.png` | 3 |
| 7 | `spodnie` | Spodnie | `/clothes/spodnie.png` | 237 |
| 8 | `spodenki` | Spodenki | `/clothes/spodenki.png` | 171 |
| 9 | `longsleeve` | Longsleeve | `/clothes/longsleeve.png` | 74 |
| 10 | `nakrycie_glowy` | Nakrycie głowy | `/clothes/nakrycie_glowy.png` | 108 |
| 11 | `okulary` | Okulary *(hardcoded)* | `/clothes/okulary.png` | **0** |
| 12 | `torby_i_plecaki` | Torby i plecaki | `/clothes/plecaki.png` (!) | 94 |
| 13 | `paski` | Paski | `/clothes/paski.png` | 32 |
| 14 | `elektronika` | Elektronika | `/clothes/elektronika.png` | 79 |
| 15 | `akcesoria` | Akcesoria | `/clothes/akcesoria.png` | 322 |
| – | `""` (brak) | – | – | 217 |

Liczby pochodzą z backupu z 2026-10-22. Dla „Wszystkie” użyto `total` z API z 2026-10-24.

### 4.3 Tagi, badge i jakość **[kod][backup]**
- Tagi w danych: `bestbatch` (1431), `random` (1241), `budgetbatch` (272). Etykiety PL (`w2cPage.tags`): „Best Batch”, „Budget Batch”, „Random”. W słowniku są też nieużywane `promocje` „Promocje”, `npc` „NPC”, `non-npc` „Non-NPC”.
- Badge na karcie (lewy górny róg zdjęcia), najwyżej jeden:
  - `bestbatch` → **„BEST”** (`bg-white/10 text-white border-white/30`),
  - w przeciwnym razie `budgetbatch` → **„BUDGET”** (`bg-emerald-500/15 text-emerald-300 border-emerald-500/35`),
  - `random` nie ma badge.
- Na stronie produktu wszystkie tagi są pokazywane jako `#tag`.
- `quality` przyjmuje wartości 7/8/9/10 (rozkład 769/806/914/748), domyślnie 9. Karta pokazuje „Quality: {q}/10” (etykieta po angielsku na sztywno), z ikoną i w zielonej pigułce w szufladzie ulubionych.
- UI nie ma filtra po tagach ani po jakości.

### 4.4 Strona `/products` **[kod]**
- Brak nagłówka H1. Od góry:
  1. Wiersz wyszukiwania: pole „Szukaj...” z ikoną lupy i „×” do czyszczenia, obok przycisk aparatu „Szukaj po zdjęciu” (patrz 5.6).
  2. Pasek filtrów:
     - dropdown sortowania z ikonami: „Najnowsze” (Sparkles), „Najstarsze” (History), „Cena rosnąco” (TrendingUp), „Cena malejąco” (TrendingDown); domyślnie `newest`,
     - popover ceny – opisany niżej,
     - pionowy separator,
     - poziomy pasek chipów kategorii (16 pozycji z 4.2, aktywny `bg-white text-black`). Pasek przewija się przeciąganiem myszą i kółkiem (pionowe kółko → poziomy scroll), z gradientowymi krawędziami.
  3. Siatka kart `.products-grid`: 1 kolumna < 640 px, 3 kolumny ≥ 640 px, 5 kolumn ≥ 1024 px.
- **Popover ceny:**
  - przycisk ma etykietę „Cena”, a przy aktywnym filtrze „{min} – {max} {symbol}”,
  - wewnątrz: tytuł „Cena ({symbol})”, dwa pola liczbowe Min/Max (zatwierdzane na blur lub Enter, z clampem do `[0,max]`, min ≤ max), podwójny suwak (krok 10, minimalny odstęp 10), podpisy „0 {sym}” / „{max} {sym}”, przy aktywnym filtrze przycisk „Wyczyść wszystkie filtry”,
  - zmiana waluty resetuje zakres.
- **Stronicowanie:** `count=15`. Infinite scroll przez IntersectionObserver na sentinelu (`rootMargin: 200px`). `hasMore = (zwrócono dokładnie 15)`. Zmiana kategorii, wyszukiwania, sortowania lub ceny resetuje do strony 1.
- **Stany:** podczas pierwszego ładowania 15 szkieletów. Brak wyników: „Nie znaleziono produktów” / „Spróbuj zmienić filtry lub wyszukiwanie”. Przy doładowaniu spinner pod siatką.
- **URL:** czyta `?category=` i `?search=`. Wpisywanie w pole (debounce **350 ms**) robi `router.push('/products?category=…&search=…', {shallow:true})`, a fetch bierze `search` z URL. Klik w chip kategorii zmienia tylko stan i **nie** aktualizuje URL (bug: nie da się udostępnić linku). Wejście z `/products?category=buty` działa.
- **Tryb wyników wyszukiwania po zdjęciu:** ukrywa sortowanie, cenę i kategorie. Pokazuje nagłówek „Wyniki wyszukiwania po zdjęciu” / „Znaleziono {{count}} podobnych przedmiotów”, przycisk „Wyczyść wyszukiwanie” i siatkę wyników. Przy braku wyników: „Nie znaleziono podobnych przedmiotów” / „Spróbuj wgrać wyraźniejsze zdjęcie produktu”.

### 4.5 Karta produktu (komponent `9397`, wspólny dla home i `/products`) **[kod]**
- Cała karta jest klikalna i prowadzi do `/item/details/{id}`. Zawartość:
  - zdjęcie `image_url` (lazy, `aspect-square`; po błędzie ukrywane; fallback `/placeholder.png` zwraca 404),
  - badge BEST/BUDGET,
  - serce (toggle ulubionych, `stopPropagation`),
  - tytuł (`h3`),
  - etykieta kategorii (przetłumaczona),
  - „Quality: X/10”,
  - etykieta „Cena” i cena (format z 3.2),
  - przycisk „Szczegóły →”.
- W ulubionych zapisywane są pola `{id,title,image_url,price,quality,category,default_link,kakobuy_link,usfans_link,allchinabuy_link,acbuy_link,litbuy_link}`.

### 4.6 Strona produktu `/item/details/[id]` **[kod][live]**
- **Dane:** `GET /api/product/{id}`. Ładowanie: szkielet. Brak produktu: ikona Package, „Produkt nie znaleziony”, link „← Wróć do produktów” (`/products`).
- **Układ (desktop `lg`):** lewa kolumna z galerią i QC, prawa kolumna sticky (`top-24`) z informacjami. Na mobile informacje są pod galerią, a na dole jest **przyklejony pasek** z przyciskiem „Kup na {Agent}” i ikoną „otwórz oryginał”.
- **Galeria:**
  - `images[]`, a gdy pusta, `[image_url]`; strzałki ←/→ (zapętlone), licznik „{i}/{n}”, pasek miniatur (auto-scroll do aktywnej), podpis „Kliknij aby powiększyć”,
  - prawy klik i przeciąganie są zablokowane,
  - lightbox: zoom +/−/reset (0,5–5×, też kółkiem i klawiszami `+ = - 0`), strzałki, Esc.
- **Blok informacji:**
  - pigułki: platforma (`WD→Weidian`, `TB→Taobao`, `AL→"Aliexpress"` (błąd, w ACBuy AL=1688), `88→1688`), surowy klucz kategorii (np. `buty`, nieprzetłumaczony), stała pigułka „Goat Reps”,
  - H1 z tytułem,
  - cena: przy `price > 0` cena przeliczona, a pod nią „¥{price} CNY”,
  - metadane (pokazywane, jeśli są): „Dostawa: {average_arrival} dni” (Clock), waga „{dimensions.weight} g” (Package), wymiary „{formattedDimensions} cm” lub „{l}×{w}×{h} cm” (Ruler),
  - tagi `#tag`, opis,
  - przyciski: „Kup na {KakoBuy|USFans|LitBuy|ACBuy|AllChinaBuy}” (kolor agenta) → `T[agentField] || default_link` oraz „Oryginał” (ExternalLink) → `default_link`, oba `target=_blank`.
- **Sekcja „Zdjęcia QC”** (zwijana, domyślnie otwarta, licznik zdjęć w nagłówku):
  - `GET /api/qc?url={encode(kakobuy_link || default_link)}`; zdjęcia brane z `kakobuyqc.grupy[]`,
  - każda grupa ma nagłówek `variant` lub „Sesja {n}”, a obok „{timestamp} · {n} zdjęć”, pod spodem siatka miniatur otwierana w lightboxie,
  - podczas ładowania 6 szkieletów; brak zdjęć: „Brak zdjęć QC dla tego produktu”.
- **Stopka (tylko tutaj):** „Goat Reps” + „Coded by [dekriss](https://dekriss.pl)”.
- Strona nie ma kalkulatora wagi ani wysyłki ani listy innych agentów.

---

## 5. Narzędzia

### 5.1 Hub `/tools` **[kod]**
H1: „Narzędzia” + szara linia „Eksploruj narzędzia”. Cztery kafle, każdy z ikoną, tytułem, opisem i CTA „Eksploruj narzędzia →”:

| Kolejność | href | Tytuł | Opis |
|---|---|---|---|
| 1 | `/qc-finder` | Znajdź zdjęcia QC | Wprowadź URL produktu aby znaleźć zdjęcia kontroli jakości |
| 2 | `/link-converter` | Konwerter linków | Konwertuj linki z różnych platform na linki agentów |
| 3 | `/tracking` | Śledzenie przesyłek | Sprawdź status swoich przesyłek w czasie rzeczywistym |
| 4 | `/shipping` | Kalkulator Wysyłki | Oblicz koszt wysyłki z Chin — wklej link produktu lub wpisz wagę ręcznie. |

Każda podstrona narzędzia ma u góry link „← Narzędzia”.

### 5.2 QC Finder `/qc-finder` **[kod][live]**
- H1 „QC” / „Finder”, opis „Wprowadź URL produktu aby znaleźć zdjęcia kontroli jakości”, placeholder „Wprowadź URL produktu (Weidian, Taobao, 1688)...”, przycisk „Szukaj QC” / „Szukam...”.
- Przed wysłaniem usuwany jest prefiks mobilny: `url.replace(/^(https?:\/\/)m\./i, '$1')`. Potem `GET /api/qc?url={enc}`.
- Kształt odpowiedzi (z kodu). Klient zbiera **unikalne** URL-e zdjęć ze wszystkich trzech miejsc:
  ```
  { kakobuyqc: { grupy: [{ variant?: string, timestamp: string, photos: string[] }],
                 qc_data: { data: [{ image_list: string[] }] } } }
  // + rekurencyjnie każde pole `image_list` gdziekolwiek w obiekcie
  ```
- Wynik: „{n} Znalezione zdjęcia QC”, przycisk „Wyczyść wyniki” i siatka. Lightbox ma zoom ±, obrót ±90°, reset, **pobieranie** (`qc-{n}.jpg` przez `fetch` + blob), strzałki i Esc.
- Błędy: puste pole → „Wprowadź link do produktu”; HTTP 429 → „Zbyt wiele zapytań. Spróbuj ponownie za chwilę”; inny błąd HTTP → „Nie udało się pobrać zdjęć QC”; wyjątek → „Błąd podczas wyszukiwania zdjęć QC”; 0 zdjęć → „Brak zdjęć QC” + „Nie znaleziono zdjęć kontroli jakości dla tego produktu. Spróbuj z innym linkiem.”
- **Live 2026-10-24:** `GET /api/qc` bez parametru → `400 {"error":"URL parameter is required"}`. Z linkiem KakoBuy lub Weidian → po ~11,7 s `500 {"error":"Failed to fetch QC data"}`. Upstream obecnie nie działa (timeout ~10 s).
- **Dostawca:** cienkie proxy. Nazwa pola `kakobuyqc` i polskie `grupy` wskazują na opakowane API QC KakoBuy (`qc_data.data[].image_list` to format odpowiedzi agenta) **[wniosek]**. Własnych danych QC brak (kolekcja `tracking`/QC w bazie nie istnieje).

### 5.3 Kalkulator wysyłki `/shipping` (dane: `shipping.json`) **[kod][live]**
- H1 „Kalkulator” / „kosztów wysyłki”, opis „Dodaj przedmioty, wybierz kraj i agenta — oblicz koszt wysyłki z Chin.” Mimo opisu nie ma wyboru agenta; zawsze `agent=kakobuy`.
- **Lewa kolumna „Dodaj przedmiot”** – dwie zakładki:
  - **„Przedmiot”:**
    1. „Szukaj w bazie”: pole z placeholderem „Nike, Jordan, Bape...”, debounce 300 ms, `GET /api/products?search={q}&count=8&sort=newest`. Lista podpowiedzi „{kategoria} · ¥{cena} · {waga}g”. Po wyborze: jeśli produkt ma `weight > 0`, waga jest wpisywana (etykieta „· z bazy danych”); w przeciwnym razie wywoływany jest weight-lookup na `kakobuy_link || default_link`. **Bug:** API produktów nie zwraca pola `weight` (waga jest najwyżej w `dimensions.weight`), więc gałąź „z bazy” nigdy się nie wykona i zawsze idzie weight-lookup. Z tego samego powodu w podpowiedziach nie widać wagi.
    2. Separator „lub”.
    3. Pole „Link (KakoBuy, USFans, Weidian, Taobao…)” z placeholderem `https://kakobuy.com/item/details?url=...`. Po 700 ms debounce `GET /api/product/weight-lookup?url=`; pokazuje miniaturę i tytuł, a gdy przyjdzie waga, wpisuje ją (etykieta „· pobrano z linku”).
    4. „Waga (gramy)” z placeholderem „np. 1222”.
    5. Przycisk „Dodaj do listy”. Etykieta pozycji = tytuł z bazy, potem tytuł z linku, potem „Przedmiot z linku”, na końcu „Przedmiot”.
  - **„Ręcznie”:** „Opis (opcjonalnie)” (placeholder „np. Kurtka, Buty...”), „Waga (gramy)” (placeholder „np. 800”), „Dodaj do listy”.
  - Walidacja: „Podaj wagę przedmiotu w gramach” / „Podaj wagę w gramach”.
  - „Lista przedmiotów ({n})”: miniatura, etykieta, waga edytowalna inline (Enter zapisuje, Esc anuluje), kosz. Pod listą „Łączna waga {sum.toLocaleString()} g”. Lista żyje tylko w stanie komponentu, bez localStorage.
- **Prawa kolumna „Ustawienia”:**
  - „Kraj docelowy” z flagą: PL Polska (domyślny), DE Niemcy, FR Francja, GB Wielka Brytania, CZ Czechy, SK Słowacja, HU Węgry, RO Rumunia, US USA,
  - „Łączna waga paczki”,
  - przycisk „Oblicz koszt wysyłki” / „Obliczam...”; bez przedmiotów → „Dodaj przynajmniej jeden przedmiot”.
- **Zapytanie:** `GET /api/shipping?country={CC}&weight={sumGrams}&agent=kakobuy`.
  - Odpowiedź PL, 1000 g (live):
    ```json
    {"express":{"name":"Europe Tariffless Line - electrified","price":30.89,"days":"11-20 days","originalPrice":"30.89"},
     "standard":{"name":"ups-Tariffless Line-electrified","price":28.66,"days":"9-18 days","originalPrice":"28.66"},
     "economy":{"name":"HKUPS-T","price":25.47,"days":"7-13 days","originalPrice":"25.47"}}
    ```
  - Ceny są w **USD**. Brak `weight` → `400 {"error":"Weight is required"}`, nieznany kraj → `500 {"error":"Failed to fetch shipping data"}`.
  - „express / standard / economy” to w praktyce 3 linie posortowane od najdroższej do najtańszej, a nie kategorie szybkości: „economy” HKUPS-T 7–13 dni jest szybsza niż „express” 11–20 dni **[wniosek]**.
  - Nazwy linii („Tariffless Line”, „HKUPS-T”, „Europe DHL Small Parcel”) to linie KakoBuy, więc endpoint to proxy do estymatora wysyłki KakoBuy **[wniosek]**. Własnej tabeli stawek brak.
- **Wynik:**
  - karta „Kupon KakoBuy” z kodem **Perkoz · −55 zł** i przełącznikiem (domyślnie **włączony**),
  - dla każdej opcji: ikona (Express → Zap, Standard → Clock, Economy → TrendingDown), etykieta, `days`, `name` i cena,
  - stopka „Ceny są orientacyjne i mogą się różnić w zależności od aktualnych stawek agenta.”
  - Wzór ceny:
    ```
    plnPerUsd = (rates.USD>0 && rates.PLN>0) ? rates.PLN/rates.USD : 4
    base  = parseFloat(originalPrice) * plnPerUsd   (gdy NaN/0 → price)
    shown = voucher ? max(0, base − 55).toFixed(2) : base.toFixed(2)  + " zł"
    voucher → dodatkowo "bez kuponu: {base.toFixed(2)} zł"
    ```
  - Waluta wyniku zawsze PLN, niezależnie od ustawień.

### 5.4 Weight lookup **[kod][live]**
- `GET /api/product/weight-lookup?url={enc}` → `{"ok":true,"weight":number|null,"title":string,"imageUrl":string,"itemId":"7739733245","platform":"WEIDIAN"}`. Czas odpowiedzi ~3 s.
- Przyjmuje link Weidian i link KakoBuy. Dla obu testowanych produktów `weight: null`, więc w praktyce zwraca głównie tytuł i zdjęcie.
- Tytuł bywa po chińsku albo w dziwnej transliteracji, a obrazek pochodzi z `si.geilicdn.com`. To proxy do danych przedmiotu agenta lub Weidian; który dokładnie upstream – nie ustalono **[wniosek]**.

### 5.5 Tracking `/tracking` **[kod][live]**
- H1 „Tracking” / „Śledzenie przesyłek”, opis „Sprawdź status swoich przesyłek w czasie rzeczywistym”, placeholder „Wprowadź numer śledzenia (np. CG52151218DE)...”, przycisk „Śledź przesyłkę” / „Szukam...”.
- **Walidacja klienta:** długość ≥ 8 i dopasowanie do któregoś z wzorców:
  `/^[A-Z]{2}\d{9}[A-Z]{2}$/i`, `/^[A-Z]{2,5}\d{8,20}$/i`, `/^\d{10,22}$/`, `/^[A-Z]{2,6}\d{6,18}[A-Z]{0,4}$/i`.
  Inaczej komunikat „Nieprawidłowy format numeru śledzenia. Sprawdź numer i spróbuj ponownie.” (hardcoded, bez i18n).
- **Zapytanie:** `GET /api/tracking?trackingNumber={enc}`. Kształt odpowiedzi z kodu:
  ```
  { success: boolean,
    "Informacje_główne": { "Numer referencyjny", "Numer śledzenia", "Kraj", "Data", "Ostatni status" },
    "Szczegóły_przesyłki": [ { "Status", "Lokalizacja", "Data" } ] }
  ```
- **Wyświetlanie:**
  - karta „Informacje główne” z polami (pokazywane, jeśli niepuste): Numer referencyjny, Numer śledzenia, Kraj, Data (`toLocaleString('pl-PL')`), oraz pigułka ostatniego statusu,
  - oś czasu „Szczegóły przesyłki”,
  - ikona statusu: zawiera „dostarczona”/„delivered” → CheckCircle; „w drodze”/„transit” → Truck; „celna”/„customs” → AlertCircle; inaczej Clock,
  - przycisk „Wyczyść wyniki”.
- **Błędy:** puste pole → „Wprowadź numer śledzenia”; 429 → „Zbyt wiele zapytań…”; inny błąd HTTP → „Nie udało się pobrać danych śledzenia”; `success:false` → „Nie znaleziono przesyłki”; wyjątek → „Błąd podczas wyszukiwania śledzenia”.
- **Live:** bez parametru → `400 {"error":"Tracking number parameter is required"}`. Fikcyjny numer `ZZ000000000ZZ` → po ~10,4 s `500 {"error":"Failed to fetch tracking data"}`. Upstream obecnie nie odpowiada.
- **Dostawca: nie ustalono.** To proxy (kolekcja `tracking` w bazie jest pusta). Polskie klucze odpowiedzi to mapowanie po stronie serwera z nieznanego API śledzenia (prawdopodobnie agregator wielu przewoźników, skoro opis mówi „Wspiera wszystkie główne kurierów”).

### 5.6 Wyszukiwanie po zdjęciu (na `/products`) **[kod][backup]**
- Dialog „Szukaj po zdjęciu” z opisem „Wgraj, przeciągnij lub wklej zdjęcie produktu, a znajdziemy najbardziej podobne przedmioty.” Strefa drop: „Przeciągnij i upuść zdjęcie tutaj” / „Upuść, aby wgrać”, „lub kliknij, aby wybrać plik”, „Możesz też wkleić zdjęcie ze schowka (Ctrl+V)”. Podgląd z „×” i „Zmień zdjęcie”, przycisk „Szukaj” / „Szukamy podobnych przedmiotów...”.
- **Walidacja:** `file.type` musi zaczynać się od `image/` (inaczej „To nie jest poprawny plik graficzny”), rozmiar ≤ 8 388 608 B (inaczej „Zdjęcie jest za duże (max 8MB)”).
- **Wysyłka:** plik → `FileReader.readAsDataURL` → `POST /api/image-search` z `Content-Type: application/json` i body `{"image":"data:image/…;base64,…"}`. Odpowiedź: `{ success: boolean, products: Product[], error?: string }`. Gdy `!ok || !success`, pokazywany jest `error` lub „Nie udało się wyszukać. Spróbuj ponownie.” Sukces zamyka dialog i włącza tryb wyników (4.4). `GET` → `405 {"success":false,"error":"Method not allowed"}`.
- **Mechanizm po stronie serwera** **[backup][wniosek]**:
  - każdy produkt ma embedding `imageVector` (**512** float, nieznormalizowany, norma ~10,6) oraz `vectors` z pięcioma wariantami tła zdjęcia: `normalBg`, `scaleBg`, `noBg`, `centerBg`, `highResBg` (każdy 512-d, cosinus do `imageVector` 0,80–0,95),
  - wymiar i normy pasują do surowych embeddingów obrazu **CLIP ViT-B/32**,
  - serwer najpewniej liczy embedding wgranego zdjęcia tym samym modelem i rankuje produkty podobieństwem kosinusowym (prawdopodobnie max po wariantach),
  - w i18n jest klucz „Podobieństwo” (`imageSearch.similarity`), ale UI go nie wyświetla,
  - embedding ma 2621 z 3237 produktów (`imageVector`) i 3159 z 3237 (`vectors`),
  - modelu, progu ani limitu wyników nie ustalono (nie wysyłano zdjęć).

---

## 6. Strona główna `/`

### 6.1 Kolejność sekcji **[kod][live HTML]**
1. **Navbar** (0.3).
2. **Hero:**
   - 5 animowanych rozmytych białych „blobów” w tle, z paralaksą i wygaszaniem przy scrollu,
   - logo `/goat.png` (lekko obrócone, pływa),
   - **H1:** „Znajdź więcej<br /> Szybciej i lepiej”,
   - pigułka-link **„Discord: 1K →”** → `https://discord.gg/QaBEPx8Vsq`,
   - duże pole tylko do odczytu „Szukaj produktów...” z `⌘K`; fokus otwiera modal wyszukiwania.
3. **Pasek kategorii:** 15 okrągłych ikon z podpisami (kolejność z 4.2, bez „Wszystkie”), przewijany poziomo (drag myszą/dotykiem, strzałki ◀ ▶). Klik → `/products?category={key}`.
4. **„Popularne” (ikona Flame) / H2 „Ostatnie znaleziska”** z linkiem „Zobacz wszystko →” (`/products`). Karuzela:
   - źródło: `GET /api/products?page={n}&count=10&sort=newest`, doładowywane, gdy indeks ≥ length−3,
   - desktop: 5 widocznych kart (środkowa powiększona 1.15×, z poświatą; boczne przyciemnione), mobile: 1 karta,
   - auto-przewijanie co **4,5 s**, pauza na hover,
   - przyciski „Poprzedni produkt” / „Następny produkt”,
   - start od 3. elementu na desktopie.

   „Popularne” to w rzeczywistości po prostu najnowsze produkty.
5. **„Nowe produkty →”** (link `/products`): 5 najnowszych (`count=5&sort=newest`). Siatka jak `.products-grid`, szkielety podczas ładowania.
6. **Rzędy kategorii:** dla każdej z 15 kategorii nagłówek-link **„Nowe {Kategoria} →”** (`/products?category={key}`) i 5 najnowszych produktów (`GET /api/products?page=1&count=5&sort=newest&category={key}`). Ładowane leniwie (IntersectionObserver, `rootMargin 200px`). **Rząd z 0 produktów jest ukrywany** (obecnie Swetry i Okulary).
7. Pływający pasek społecznościowy (`md+`) i popup powitalny.

**Na stronie głównej nie ma stopki, FAQ, sekcji „Dlaczego my”, CTA Discord ani statystyk** (poza „Discord: 1K”).

### 6.2 Meta / SEO (z `com.html`) **[live]**
- `<html lang="en">` (błąd, treść jest po polsku), `<title>goatreps.com</title>`.
- `description` / `og:description` / `twitter:description`: „Najlepsza strona repowa, na której znajdziesz wiele przedmiotów w najlepszych cenach!”
- `keywords`: „goatreps, repliki premium, luksusowe repliki, repliki butów, repliki ubrań, goatreps.com”, `author`: goatreps.com.
- `og:type` website, `og:site_name` goatreps, `og:url` https://goatreps.com, `og:image` https://goatreps.com/goatreps_banner.png (960×240), `twitter:card` summary_large_image.
- `icon` / `apple-touch-icon`: `/goat.png`, `theme-color` `#ffffff`.
- W `<head>` jest `<script id="discord:component-embed" type="application/json">` z kartą komponentów Discorda:
  - nagłówek „goatreps” z emoji `<:goatreps:1503742743019524237>`,
  - link do goatreps.com z opisem,
  - banner,
  - przyciski „Przeglądaj przedmioty” → /products i „Nasz Discord” → discord.gg/QaBEPx8Vsq.
- Preloadowane obrazy: `/goat.png`, wszystkie `/clothes/*.png`, `/agents/kakobuy.png`.

### 6.3 Linki zewnętrzne (moduł `5593`) **[kod]**
```js
{ discord: "https://discord.gg/QaBEPx8Vsq",
  tiktok: "https://www.tiktok.com/@goatreps",
  kakobuyRegister: "https://ikako.vip/r/Perkoz" }
```
Do tego `https://dekriss.pl` (stopka „Coded by dekriss” na stronie produktu). Innych linków (Instagram, YouTube, sklep) nie ma.

### 6.4 Popup powitalny KakoBuy **[kod]** – uwaga: dark patterns
- Pokazywany, dopóki `localStorage.goatreps_welcome_done` nie jest ustawione. Zamykany przyciskiem ×, kliknięciem w tło lub Esc; blokuje scroll strony.
- Treść:
  - logo + „Goat Reps”, badge „★ PARTNER”, „★ LIMITOWANA”,
  - **„Zgarnij -50% na shipping”**,
  - „Załóż konto KakoBuy przez nasz link i odbierz zniżkę na wysyłkę. Oferta ważna przez **7 dni**.”,
  - zielona kropka + „**{N} osób ogląda teraz tę ofertę**”,
  - dwa wiersze korzyści: „Bonus powitalny na pierwszy haul — KakoBuy”, „Zniżka na shipping — -50%”,
  - licznik DNI / GODZ / MIN / SEK,
  - CTA „Zarejestruj się w KakoBuy” (otwiera `https://ikako.vip/r/Perkoz` i zamyka popup),
  - stopka „Bez zobowiązań · Oferta tylko przez ten link”.
- **Licznik jest fałszywy:** data końca = pierwsza wizyta + 7 dni, zapisana w `localStorage.goatreps_offer_end`. **Liczba oglądających jest losowa:** `32 + floor(28·random())`, czyli 32–59.
- Do tego niespójność: popup obiecuje −50%, a kalkulator wysyłki pokazuje kupon −55 zł.
- Rekomendacja: nie przenosić 1:1 (ryzyko nieuczciwej praktyki rynkowej, UOKiK / dyrektywa Omnibus). Ewentualnie uczciwy baner z kodem.

### 6.5 Teksty, które istnieją tylko w słowniku (martwy kod, nierenderowane)
Do wykorzystania w nowej stronie. Pełne brzmienie w `i18n-stara-strona.json`:
- **FAQ** (`questions`): tytuł „Często zadawane pytania i odpowiedzi”, podtytuł o Discordzie. Pytania: „Czy KakoBuy jest bezpieczny?”, „Czy celnik mi zabierze paczkę?”, „Czy przesyłka jest droga?” z odpowiedziami.
- **Stopka** (`footer`):
  - „© 2025 TwojaNazwa. Wszystkie prawa zastrzeżone. Strona jest źródłem wiedzy zamawiania z Chin jednak tego nie popiera!” (zawiera placeholder „TwojaNazwa”),
  - tagline „Zakupy stają się łatwiejsze!”,
  - menu „Strona Główna” (Start, Korzyści) i „Narzędzia” (Link Converter, W2C, Tracking Paczki, Nasz Discord).
- **CTA** (`cta`): „Dołącz do społeczności!” / „Poznaj najlepsze repy, dziel się doświadczeniami i bądź na bieżąco z najnowszymi trendami.” / „Dołącz do Discord”. Do tego `adBar`: „Dołącz do naszego Discord i poznaj najlepsze repy!”
- **Bento** (`bentoGrid`): Best Batch, W2C, Smart Tools, Knowledge Base, Community Feed. **„Dlaczego my?”** (`features`): 6 punktów, m.in. „Bezpieczne płatności” i „Wsparcie 24/7”. To obietnice, których strona nie spełnia; nie przenosić bez weryfikacji.
- **Wtyczka** (`linkUtilityBlock`): „Zainstaluj wtyczkę”, „Nasza wtyczka”, Auto-Link Konwerter, QC Menu 2.0, „Usuń "Check Agree" i "Warn Remind"”. Rozszerzenie przeglądarki nie jest nigdzie linkowane.
- **Tutoriale:** brak treści. `tutorialsPage` to tylko placeholder 404.
- **Teksty prawne** (polityka prywatności, regulamin, cookies): **brak całkowicie**.

### 6.6 Faktycznie używane klucze i18n (dla zakresu tłumaczeń) **[kod]**
- `navbar.products`, `navbar.narzedzia`, `header.searchPlaceholder`, `header.subtitle`, `header.discord`
- `header.popular`, `header.latestFinds`, `header.latestFindsPrev`, `header.latestFindsNext`, `header.viewAll`, `header.newestItems`, `header.newest`
- `productCard.*`, `sort.*`, `w2cPage.categories.*`, `w2cPage.{searchPlaceholder,price,clearFilters,noProducts,noProductsDescription}`
- `imageSearch.*`, `searchModal.*`, `settings.language`, `welcomeDialog.*`
- `itemDetails.*`, `footer.codedBy`
- `linkConverterPage.{description,input.placeholder,button.convert,error.conversionFailed,noResults.title}`
- `qcFinderPage.*`, `trackingPage.*`, `shippingTool.*`, `shipping.*`, `utility.explore`
- `errors.404.*`

Część tekstów jest na sztywno po polsku, bez i18n: szuflady Ulubione i Ustawienia (z przełącznikiem `pl ? … : …`), błąd formatu numeru w trackingu, „Quality:”, „Link (KakoBuy, USFans…)”, nazwy Express/Standard/Economy.
- Strona 404: duże „404”, „Strona nie została znaleziona”, „Przepraszamy, ale strona której szukasz nie istnieje lub została przeniesiona.”, przyciski „Strona główna” i „Wróć”.

---

## 7. Śledzenie odsłon (`/api/page-views`) **[kod][live][backup]**
- **Klient** (`_app`, komponent `eh`): przy każdej zmianie `router.asPath` / `pathname` wysyła `POST /api/page-views` z `Content-Type: application/json` i body `{"page": router.pathname}`. Wysyłany jest `pathname` (wzorzec, np. `/item/details/[id]`), a nie konkretny URL. Błędy 404 i 429 trafiają tylko do `console.error`. Wywołanie idzie zawsze, bez żadnej zgody.
- **Serwer zapisuje per odsłonę** dokument `{ page, ipAddress, userAgent, createdAt }` w kolekcji `pageViews`; w backupie jest 7272 takich wpisów z pełnym IP i UA.
- **`GET /api/page-views` jest publiczny** i zwraca agregaty, a przy okazji wykonuje czyszczenie (`removedInvalid`, efekt uboczny GET-a):
  ```json
  {"pageViews":[{"page_path":"/products","page_name":"Produkty","view_count":4285,"last_viewed":"…"},
                {"page_path":"/","page_name":"Strona główna","view_count":2684,…},
                {"page_path":"/tools","page_name":"Narzędzia","view_count":214,…},
                {"page_path":"/shipping","page_name":"Kalkulator wysyłki","view_count":52,…},
                {"page_path":"/link-converter","page_name":"Konwerter linków","view_count":39,…},
                {"page_path":"/qc-finder","page_name":"QC Finder","view_count":27,…},
                {"page_path":"/tracking","page_name":"Śledzenie paczek","view_count":26,…}],
   "totalViews":7327,"removedInvalid":0}
  ```
  Liczone są tylko te 7 ścieżek, bez `/item/details/[id]`.
- **Prywatność (RODO):** adres IP to dana osobowa. Stara strona zbiera IP + UA przy każdej odsłonie, bez podstawy prawnej opisanej w polityce prywatności (której nie ma), bez informacji dla użytkownika i bez retencji. `POST` nie jest uwierzytelniony, więc każdy może pompować statystyki (jest tylko limit 429).
- **Rekomendacja:** w nowej stronie liczyć tylko agregaty (ścieżka + dzień) bez IP i UA, albo IP hashowane z dzienną solą. Do tego retencja, informacja w polityce prywatności i chroniony GET statystyk. Backup `backup (1).json` zawiera IP i hash hasła admina, więc trzeba go traktować jako poufny (poza repo, usunąć po migracji).

---

## 8. Obserwacje bezpieczeństwa (bez prób wykorzystania)

| # | Waga | Obserwacja | Źródło | Rekomendacja |
|---|---|---|---|---|
| S1 | **Wysoka** | **Klucz API Immich jawny w każdym `image_url`**: `https://photos.dekriss.pl/api/assets/{uuid}/thumbnail?apiKey=<USUNIĘTY – klucz trzeba unieważnić w Immich>&size=preview`. Trafia do każdego klienta przez `/api/products`, do ulubionych w localStorage i do logów Cloudflare. Daje dostęp do API Immich z uprawnieniami tego klucza: potencjalnie cała biblioteka zdjęć właściciela, a może upload i usuwanie. | [live][backup] | Natychmiast unieważnić klucz w Immich. Zdjęcia skopiować do własnego storage/CDN (np. R2/S3 + next/image) i nie linkować do prywatnego Immicha. |
| S2 | Średnia | Strony HTML nie mają żadnych nagłówków bezpieczeństwa: brak CSP, HSTS, X-Frame-Options (możliwy clickjacking), X-Content-Type-Options i Referrer-Policy. Jest za to `x-powered-by: Next.js`. Te same braki mają `/api/products` i `/api/product/:id` (mają je tylko `/api/shipping`, `/api/qc`, `/api/tracking`, `/api/page-views`). | [live] | `poweredByHeader: false`; w `next.config` `headers()` z CSP, HSTS (`max-age=31536000; includeSubDomains`), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| S3 | Średnia | Ścieżka panelu admina `/i2189srrasw` (security by obscurity) jawna w publicznym `_buildManifest.js`. Cały słownik admina (`admin.*`, `adminPage.*`: „Hasło admina”, „Konwertuj linki”, „Best Batche”…) jest w publicznym `_app`. Logowanie oparte na jednym wspólnym haśle (kolekcje `adminCredentials` z `passwordHash` i `adminSessions`). Panelu nie analizowano. | [kod][backup] | Admin za porządnym auth (np. Auth.js / Cloudflare Access), osobny route group, kod admina poza publicznymi bundlami. Rate-limit i 2FA. |
| S4 | Średnia | Endpointy przyjmujące dowolny URL od użytkownika (`/api/qc?url=`, `/api/product/weight-lookup?url=`) – jeśli serwer pobiera ten URL bezpośrednio, istnieje ryzyko SSRF. **Nie testowano.** | [kod][wniosek] | Serwer ma tylko parsować `itemId` + `platform` (konwerter) i sam budować URL do znanego upstreamu; allowlista hostów, timeouty, rate-limit. |
| S5 | Średnia | Zbieranie IP + UA przy każdej odsłonie bez polityki prywatności i zgody (RODO), publiczny GET statystyk z efektem ubocznym, nieuwierzytelniony POST. | [kod][live][backup] | Patrz 7. |
| S6 | Niska | `POST /api/image-search` przyjmuje base64 do ~8 MB w JSON (ok. 11 MB body), a koszt to liczenie embeddingu na serwerze, więc wektor DoS i kosztów. | [kod] | Upload multipart z limitem, resize po stronie klienta (np. 512 px), rate-limit / Turnstile. |
| S7 | Niska | Przeglądarka odpytuje bezpośrednio `api.exchangerate-api.com`, `api.fixer.io`, `api.currencyapi.com` (IP użytkownika trafia do 3 podmiotów, 2 z nich nie działają). Flagi idą z `cdn.jsdelivr.net`. | [kod] | Kursy przez własny Route Handler z cache. Flagi jako lokalne SVG. |
| S8 | Niska | Dark patterns w popupie (fałszywy licznik i losowa liczba oglądających) oraz niespójne obietnice (−50% vs −55 zł, „Bezpieczne płatności”, „Wsparcie 24/7” w martwych tekstach). | [kod] | Nie przenosić; uczciwe treści. |
| S9 | Info | Upstreamy QC i trackingu zwracają 500 po ~10–12 s. Klient nie ma timeoutu ani anulowania, więc użytkownik długo czeka. | [live] | Timeout ~8 s, cache wyników QC, komunikat o niedostępności. |
| S10 | Info | `/placeholder.png` nie istnieje (404). `lang="en"` przy polskiej treści. Brak `robots.txt` i sitemapy. Brak SSR produktów (SEO). | [live] | Poprawić w nowej wersji. |
| S11 | Info | `access-control-allow-credentials: true` na API, ale `Access-Control-Allow-Origin` nie jest odbijane dla obcego `Origin` (sprawdzone z `https://example.com`), więc CORS nie jest dziurawy. | [live] | Nie dodawać ACAO z credentials w nowej wersji. |
| S12 | Info | W publicznych bundlach nie znaleziono innych sekretów (kluczy API, tokenów, wewnętrznych URL-i) poza S1 i ścieżką admina. Kody polecające są jawne z założenia. | [kod] | – |

---

## 9. Ściąga endpointów

| Endpoint | Metoda | Parametry | Odpowiedź | Charakter |
|---|---|---|---|---|
| `/api/products` | GET | `page`, `count` (≤100), `sort` (`newest`/`oldest`/`price_asc`/`price_desc`), `category`, `search`, `minPrice`, `maxPrice` (CNY) | `{products: Product[], total}` | **własne dane** (Mongo `products`) |
| `/api/product/{id}` | GET | – | `{product}` / `404 {"error":"Not found"}` | własne dane |
| `/api/image/{objectId}` | GET | – | obraz (webp z kolekcji `images`) | własne dane [backup] |
| `/api/image-search` | POST | JSON `{image: dataURL}` | `{success, products, error?}` | **własne dane** (embeddingi 512-d, CLIP?) + model po stronie serwera |
| `/api/qc` | GET | `url` | `{kakobuyqc:{grupy[], qc_data:{data[]}}}`; `400`/`429`/`500 {"error"}` | **proxy** – prawdopodobnie QC KakoBuy |
| `/api/shipping` | GET | `country` (PL DE FR GB CZ SK HU RO US), `weight` (g), `agent=kakobuy` | `{express,standard,economy}: {name, price, days, originalPrice}` w USD | **proxy** – estymator wysyłki KakoBuy |
| `/api/product/weight-lookup` | GET | `url` | `{ok, weight, title, imageUrl, itemId, platform}` | **proxy** – dane przedmiotu (upstream nieustalony) |
| `/api/tracking` | GET | `trackingNumber` | `{success, Informacje_główne{…}, Szczegóły_przesyłki[…]}` | **proxy** – dostawca nieustalony |
| `/api/page-views` | POST / GET | POST `{page}`; GET bez parametrów | POST: zapis IP+UA; GET: `{pageViews[], totalViews, removedInvalid}` | własne dane |

---

## 10. Czego nie udało się ustalić
1. **Dostawca trackingu** (`/api/tracking`). Kod klienta go nie ujawnia, a upstream nie odpowiada (500 po ~10 s), więc nie dało się zobaczyć prawdziwej odpowiedzi. Kształt opisany tylko z kodu.
2. **Upstream QC** – realnej odpowiedzi nie zobaczono (500). To, że to KakoBuy, to wniosek z nazwy pola `kakobuyqc`.
3. **Upstream weight-lookup** (KakoBuy? Weidian?) i to, kiedy zwraca niepustą `weight` (w testach zawsze `null`).
4. **Image search po stronie serwera:** model (512-d pasuje do CLIP ViT-B/32), metryka, sposób łączenia 5 wariantów, limit wyników, czy zwraca pole similarity. Nie wysyłano żadnego zdjęcia.
5. Czy `search` w `/api/products` przeszukuje też `description`.
6. Upstream kalkulatora wysyłki (wniosek: KakoBuy) i to, czy obsługuje kraje spoza listy 9 – nieznany kraj daje 500.
7. Logika i treść panelu admina – świadomie pominięte.
8. Taobao w szablonie CNFans (`shop_type=taobao`) – nie występuje w danych, to wniosek.
