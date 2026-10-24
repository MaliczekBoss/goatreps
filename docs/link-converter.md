# Link Converter – specyfikacja do portu (stara strona goatreps.com)

Źródło: `zrodla/stara-strona/js/p_link-converter-d760fba5fa6ade3a.js`, moduły webpack:

- `1366` – konfiguracja agentów + kody polecające (ten sam moduł jest też w `p_shipping-*`),
- `6741` – logika: `Dx` = `parse`, `fj` = `canonicalUrl`, `i` = `buildAgentLink`, `gS` = `convertAll`, `c` = `detectPlatform`,
- `3291` – komponent strony `/link-converter`.

Wszystkie przypadki testowe poniżej powstały przez **uruchomienie oryginalnego kodu** (moduły 1366 + 6741 w izolowanym `vm` Node). Pełne wyniki (wszystkie linki dla każdego wejścia): `docs/link-converter-cases.json`. Port w TypeScript powinien dawać te same wyniki. Wyjątek: przypadki z sekcji „Znane błędy”, jeśli świadomie je poprawicie.

---

## 1. Model danych

```ts
type Platform = 'WEIDIAN' | 'TAOBAO' | '1688';
type SourceAgent = 'kakobuy' | 'allchinabuy' | 'litbuy' | 'usfans' | 'acbuy' | 'oopbuy' | 'mulebuy' | 'direct';

interface Parsed { itemId: string; platform: Platform; sourceAgent: SourceAgent }

// moduł 1366 – kody polecające (dokładnie jak w bundlu)
const AGENTS = {
  kakobuy:     { name: 'KakoBuy',     affcode: 'Perkoz' },
  allchinabuy: { name: 'AllChinaBuy', partnercode: 'wVSV4X' },
  litbuy:      { name: 'LitBuy',      inviteCode: 'GOATREPS' },
  usfans:      { name: 'USFans',      ref: 'GSWJ8H' },
  acbuy:       { name: 'ACBuy',       ref: 'MD2BNM' },
  oopbuy:      { name: 'OopBuy',      ref: '' },          // pusty -> brak query string
  mulebuy:     { name: 'MuleBuy',     ref: '200910978' },
} as const;
// Kolejność kluczy wyniku convertAll: original, kakobuy, allchinabuy, litbuy, usfans, acbuy, oopbuy, mulebuy
// CNFans NIE jest obsługiwany przez konwerter (ani na wejściu, ani na wyjściu).
```

## 2. `parse(input)` – rozpoznawanie wejścia (moduł 6741, `Dx`)

Kolejność gałęzi ma znaczenie. Testy hosta to `String.includes` na **surowym** wejściu `e`. Gdy gałąź pasuje do hosta, ale nie znajdzie ID, kod **przechodzi dalej** do kolejnych gałęzi (nie zwraca null od razu). Całość jest w `try/catch`, a każdy wyjątek daje `null`.

```ts
function parse(e: string): Parsed | null {
  try {
    const s = decodeURIComponent(e);           // rzuca przy zepsutym '%' -> catch -> null (dla KAŻDEGO wejścia!)

    // 1. KakoBuy  (np. https://www.kakobuy.com/item/details?url=<enc>&affcode=...)
    if (e.includes('kakobuy.com')) {
      const m = s.match(/url=([^&]+)/);        // UWAGA: na już zdekodowanym s
      if (m) {
        const inner = decodeURIComponent(m[1]);// drugie dekodowanie
        const id = inner.match(/itemID[=%](\d+)/) || inner.match(/id=(\d+)/) || inner.match(/offer\/(\d+)/);
        if (id) return { itemId: id[1], platform: detectPlatform(inner), sourceAgent: 'kakobuy' };
      }
    }
    // 2. AllChinaBuy (…/en/page/buy/?…&url=<enc>&partnercode=…) – identyczna logika jak KakoBuy
    if (e.includes('allchinabuy.com')) {
      const m = s.match(/url=([^&]+)/);
      if (m) {
        const inner = decodeURIComponent(m[1]);
        const id = inner.match(/itemID[=%](\d+)/) || inner.match(/id=(\d+)/) || inner.match(/offer\/(\d+)/);
        if (id) return { itemId: id[1], platform: detectPlatform(inner), sourceAgent: 'allchinabuy' };
      }
    }
    // 3. LitBuy  https://litbuy.com/product/{taobao|1688|weidian}/{id}
    if (e.includes('litbuy.com')) {
      const m = e.match(/product\/([^/?]+)\/(\d+)/);
      if (m) return { itemId: m[2], platform: m[1] === 'taobao' ? 'TAOBAO' : m[1] === '1688' ? '1688' : 'WEIDIAN', sourceAgent: 'litbuy' };
    }
    // 4. USFans  https://www.usfans.com/product/{1|2|3}/{id}   1=1688, 2=TAOBAO, inne=WEIDIAN
    if (e.includes('usfans.com')) {
      const m = e.match(/product\/([^/?]+)\/(\d+)/);
      if (m) return { itemId: m[2], platform: m[1] === '1' ? '1688' : m[1] === '2' ? 'TAOBAO' : 'WEIDIAN', sourceAgent: 'usfans' };
    }
    // 5. ACBuy   https://www.acbuy.com/product?id={id}&source={TB|AL|WD}   brak source => WEIDIAN
    if (e.includes('acbuy.com')) {
      const id = e.match(/id=(\d+)/), src = e.match(/source=([^&]+)/);
      if (id) {
        const v = src?.[1] ?? '';
        return { itemId: id[1], platform: v === 'TB' ? 'TAOBAO' : v === 'AL' ? '1688' : 'WEIDIAN', sourceAgent: 'acbuy' };
      }
    }
    // 6. OopBuy  https://oopbuy.com/product/{TAOBAO|1688|WEIDIAN}/{id}  (wielkość liter ma znaczenie: tylko 'TAOBAO' i '1688')
    if (e.includes('oopbuy.com')) {
      const m = e.match(/product\/([^/?]+)\/(\d+)/);
      if (m) return { itemId: m[2], platform: m[1] === 'TAOBAO' ? 'TAOBAO' : m[1] === '1688' ? '1688' : 'WEIDIAN', sourceAgent: 'oopbuy' };
    }
    // 7. MuleBuy https://mulebuy.com/product?id={id}&platform={TAOBAO|ALI_1688|WEIDIAN}
    if (e.includes('mulebuy.com')) {
      const id = e.match(/id=(\d+)/), pf = e.match(/platform=([^&]+)/);
      if (id) {
        const v = pf?.[1] ?? '';
        return { itemId: id[1], platform: v === 'TAOBAO' ? 'TAOBAO' : v === 'ALI_1688' ? '1688' : 'WEIDIAN', sourceAgent: 'mulebuy' };
      }
    }
    // 8. Bezpośrednie linki marketplace (na surowym e)
    if (e.includes('weidian.com')) {             // też subdomeny: shopXXX.v.weidian.com, m.weidian.com
      const m = e.match(/itemID[=%](\d+)/);
      if (m) return { itemId: m[1], platform: 'WEIDIAN', sourceAgent: 'direct' };
    }
    if (e.includes('taobao.com')) {              // item.taobao.com, m.intl.taobao.com … (tmall.com NIE)
      const m = e.match(/\bid=(\d+)/);
      if (m) return { itemId: m[1], platform: 'TAOBAO', sourceAgent: 'direct' };
    }
    if (e.includes('1688.com')) {                // detail.1688.com, m.1688.com
      const m = e.match(/offer\/(\d+)/);
      if (m) return { itemId: m[1], platform: '1688', sourceAgent: 'direct' };
    }
    return null;
  } catch { return null; }
}

// moduł 6741, funkcja c – tylko dla wewnętrznego URL-a z KakoBuy/AllChinaBuy
function detectPlatform(u: string): Platform {
  return u.includes('weidian') ? 'WEIDIAN' : u.includes('taobao') ? 'TAOBAO' : u.includes('1688') ? '1688' : 'WEIDIAN';
}
```

## 3. Budowanie linków

```ts
// moduł 6741, fj
function canonicalUrl(p: Parsed): string {
  if (p.platform === 'WEIDIAN') return `https://weidian.com/item.html?itemID=${p.itemId}`;
  if (p.platform === 'TAOBAO')  return `https://item.taobao.com/item.htm?id=${p.itemId}`;
  return `https://detail.1688.com/offer/${p.itemId}.html`;
}

// moduł 6741, i
function buildAgentLink(p: Parsed, agent: keyof typeof AGENTS | 'raw'): string {
  const orig = canonicalUrl(p);
  const enc = encodeURIComponent(orig);
  const { itemId: id, platform: pf } = p;
  switch (agent) {
    case 'kakobuy':
      return `https://kakobuy.com/item/details?url=${enc}&affcode=${AGENTS.kakobuy.affcode}`;
    case 'allchinabuy':
      return `https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=${enc}&partnercode=${AGENTS.allchinabuy.partnercode}`;
    case 'litbuy':
      return `https://litbuy.com/product/${pf === 'TAOBAO' ? 'taobao' : pf === '1688' ? '1688' : 'weidian'}/${id}?inviteCode=${AGENTS.litbuy.inviteCode}`;
    case 'usfans':
      return `https://www.usfans.com/product/${pf === '1688' ? '1' : pf === 'TAOBAO' ? '2' : '3'}/${id}?ref=${AGENTS.usfans.ref}`;
    case 'acbuy':
      return `https://www.acbuy.com/product?id=${id}&source=${pf === 'WEIDIAN' ? 'WD' : pf === '1688' ? 'AL' : 'TB'}&u=${AGENTS.acbuy.ref}`;
    case 'oopbuy': {
      const q = AGENTS.oopbuy.ref ? `?ref=${AGENTS.oopbuy.ref}` : '';
      return `https://oopbuy.com/product/${pf === 'WEIDIAN' ? 'WEIDIAN' : pf === '1688' ? '1688' : 'TAOBAO'}/${id}${q}`;
    }
    case 'mulebuy':
      return `https://mulebuy.com/product?id=${id}&platform=${pf === '1688' ? 'ALI_1688' : pf === 'WEIDIAN' ? 'WEIDIAN' : 'TAOBAO'}&ref=${AGENTS.mulebuy.ref}`;
    case 'raw':
    default:
      return orig;
  }
}

// moduł 6741, gS
function convertAll(input: string) {
  const p = parse(input);
  if (!p) return null;
  return {
    original: canonicalUrl(p),
    kakobuy: buildAgentLink(p, 'kakobuy'),
    allchinabuy: buildAgentLink(p, 'allchinabuy'),
    litbuy: buildAgentLink(p, 'litbuy'),
    usfans: buildAgentLink(p, 'usfans'),
    acbuy: buildAgentLink(p, 'acbuy'),
    oopbuy: buildAgentLink(p, 'oopbuy'),
    mulebuy: buildAgentLink(p, 'mulebuy'),
  };
}
```

Uwaga: konwerter **zawsze** dokleja kody polecające, ale linki zapisane w bazie produktów w większości ich **nie mają**. Szczegóły w `SPEC-stara-strona.md`, sekcja 1.4. Nowa strona powinna generować linki agentów przy renderze z `(platform, itemId)` przez te same funkcje, a nie czytać ich z bazy.

## 4. Zachowanie UI (`/link-converter`, moduł 3291)

- Nagłówek: link „← Narzędzia” (`/tools`), H1 „Link” + szara druga linia „Converter”, opis: `linkConverterPage.description` = „Konwertuj linki z różnych platform na linki agentów”.
- Wiersz wejścia: `<input>` z placeholderem „Wklej link tutaj...”, dropdown filtra agenta, przycisk „Konwertuj”. Enter = konwersja.
- Opcje filtra (kolejność): `all` „Wszystkie agenty”, `kakobuy` KakoBuy, `allchinabuy` AllChinaBuy, `acbuy` ACBuy, `litbuy` LitBuy, `usfans` USFans, `oopbuy` OopBuy, `mulebuy` MuleBuy. Domyślnie `all`. Filtr działa tylko na już wygenerowanych wynikach, bez ponownej konwersji.
- Puste wejście: komunikat błędu ma treść placeholdera („Wklej link tutaj...”). To quirk.
- `parse` zwraca `null`: błąd „Konwersja nie powiodła się” (`linkConverterPage.error.conversionFailed`) z ikoną CircleAlert, na czerwono.
- Wynik:
  1. Pierwszy wiersz to link oryginalny. Etykieta = `platform` (WEIDIAN/TAOBAO/1688, uppercase), obok link (mono, ucięty) oraz przyciski Kopiuj i Otwórz (`target=_blank rel="noopener noreferrer"`).
  2. Potem po jednym wierszu na agenta (kolejność kluczy z `convertAll`, z pominięciem `original`), przefiltrowane wg dropdownu. Etykieta pochodzi z listy filtrów.
  3. Gdy po filtrowaniu lista jest pusta: „Brak wyników”.
- Kopiowanie: `navigator.clipboard.writeText`. Ikona zmienia się na zielony „check” na 1,8 s. Toastów nie ma.
- Strona nie wysyła nic do API, bo wszystko dzieje się po stronie klienta.

## 5. Znane błędy / quirki oryginału (do decyzji: odtworzyć czy poprawić)

| # | Problem | Przykład | Oryginał zwraca | Propozycja |
|---|---|---|---|---|
| B1 | `decodeURIComponent(e)` na całym wejściu rzuca przy zepsutym `%`, więc **każde** takie wejście daje null | `…itemID=7739733245%` | `null` | dekodować w `try`, przy błędzie dalej parsować surowy tekst |
| B2 | `itemID[=%](\d+)` przy zakodowanym `=` łapie `3` z `%3D` | `weidian.com/item.html?itemID%3D7739733245` | `itemId: "3"` | najpierw zdekodować, regex `itemI[Dd]=(\d+)` |
| B3 | KakoBuy/ACB: `url=([^&]+)` szuka w już zdekodowanym stringu, więc `&` z wewnętrznego URL-a ucina go | kakobuy z `item.htm%3Fspm%3D…%26id%3D…` | `null` | `new URL(e).searchParams.get('url')` |
| B4 | Brak obsługi `tmall.com`, `world.taobao.com/item/{id}.htm`, `weidian.com/item/{id}`, `item.taobao.com/item.htm?…&itemId=`, linków skróconych | `item.tmall.com/item.htm?id=…` | `null` | dodać (tmall → TAOBAO) |
| B5 | Wejście CNFans nierozpoznawane (`shop_type=weidian&id=`), a CNFans nie jest generowany, mimo że baza ma `cnfans_link` | `cnfans.com/product/?shop_type=weidian&id=…` | `null` | dodać CNFans (szablony w `agents.json`) |
| B6 | Test hosta przez `includes` daje fałszywe trafienia (np. `?ref=kakobuy.com` w obcym linku) | – | – | parsować `new URL().hostname` + `endsWith` |
| B7 | Puste wejście pokazuje placeholder jako błąd | `""` | „Wklej link tutaj...” | osobny komunikat |
| B8 | OopBuy ma pusty `ref`, więc linki bez polecenia | – | `…/product/WEIDIAN/{id}` | uzupełnić kod, jeśli istnieje |

## 6. Przypadki testowe (wynik oryginalnego kodu)

Kolumna `original` = `canonicalUrl(parse(input))`. Dla każdego niepustego wyniku 7 linków agentów wynika deterministycznie z `itemId` i `platform` (szablony w sekcji 3 i w `agents.json`). Pełne wartości są w `link-converter-cases.json`.

| # | Wejście | itemId | platform | sourceAgent | original |
|---|---|---|---|---|---|
| 1 | `https://weidian.com/item.html?itemID=7739733245` | `7739733245` | WEIDIAN | direct | `https://weidian.com/item.html?itemID=7739733245` |
| 2 | `https://shop1234567.v.weidian.com/item.html?itemID=7739733245&spider_token=abcd` | `7739733245` | WEIDIAN | direct | `https://weidian.com/item.html?itemID=7739733245` |
| 3 | `https://m.weidian.com/item.html?itemID=7739733245` | `7739733245` | WEIDIAN | direct | `https://weidian.com/item.html?itemID=7739733245` |
| 4 | `https://item.taobao.com/item.htm?id=681234567890` | `681234567890` | TAOBAO | direct | `https://item.taobao.com/item.htm?id=681234567890` |
| 5 | `https://item.taobao.com/item.htm?spm=a1z10.1-c.w4004&id=681234567890&ns=1` | `681234567890` | TAOBAO | direct | `https://item.taobao.com/item.htm?id=681234567890` |
| 6 | `https://m.intl.taobao.com/detail/detail.html?id=681234567890` | `681234567890` | TAOBAO | direct | `https://item.taobao.com/item.htm?id=681234567890` |
| 7 | `https://detail.1688.com/offer/612345678901.html` | `612345678901` | 1688 | direct | `https://detail.1688.com/offer/612345678901.html` |
| 8 | `https://m.1688.com/offer/612345678901.html?spm=a26352` | `612345678901` | 1688 | direct | `https://detail.1688.com/offer/612345678901.html` |
| 9 | `https://kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7739733245&affcode=Perkoz` | `7739733245` | WEIDIAN | kakobuy | `https://weidian.com/item.html?itemID=7739733245` |
| 10 | `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D681234567890&affcode=xyz` | `681234567890` | TAOBAO | kakobuy | `https://item.taobao.com/item.htm?id=681234567890` |
| 11 | `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F612345678901.html&affcode=xyz` | `612345678901` | 1688 | kakobuy | `https://detail.1688.com/offer/612345678901.html` |
| 12 | `https://www.kakobuy.com/item/details?url=https://weidian.com/item.html?itemID=7739733245&affcode=xyz` | `7739733245` | WEIDIAN | kakobuy | `https://weidian.com/item.html?itemID=7739733245` |
| 13 | `https://www.kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fspm%3Da1z10%26id%3D681234567890&affcode=xyz` | — | — | **null** (B3) | — |
| 14 | `https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D681234567890&partnercode=abc` | `681234567890` | TAOBAO | allchinabuy | `https://item.taobao.com/item.htm?id=681234567890` |
| 15 | `https://litbuy.com/product/taobao/681234567890?inviteCode=X` | `681234567890` | TAOBAO | litbuy | `https://item.taobao.com/item.htm?id=681234567890` |
| 16 | `https://litbuy.com/product/weidian/7739733245` | `7739733245` | WEIDIAN | litbuy | `https://weidian.com/item.html?itemID=7739733245` |
| 17 | `https://www.usfans.com/product/2/681234567890?ref=X` | `681234567890` | TAOBAO | usfans | `https://item.taobao.com/item.htm?id=681234567890` |
| 18 | `https://www.usfans.com/product/3/7739733245` | `7739733245` | WEIDIAN | usfans | `https://weidian.com/item.html?itemID=7739733245` |
| 19 | `https://www.usfans.com/product/1/612345678901` | `612345678901` | 1688 | usfans | `https://detail.1688.com/offer/612345678901.html` |
| 20 | `https://www.acbuy.com/product?id=612345678901&source=AL&u=X` | `612345678901` | 1688 | acbuy | `https://detail.1688.com/offer/612345678901.html` |
| 21 | `https://www.acbuy.com/product?id=7739733245` | `7739733245` | WEIDIAN | acbuy | `https://weidian.com/item.html?itemID=7739733245` |
| 22 | `https://oopbuy.com/product/1688/612345678901` | `612345678901` | 1688 | oopbuy | `https://detail.1688.com/offer/612345678901.html` |
| 23 | `https://oopbuy.com/product/WEIDIAN/7739733245` | `7739733245` | WEIDIAN | oopbuy | `https://weidian.com/item.html?itemID=7739733245` |
| 24 | `https://mulebuy.com/product?id=681234567890&platform=TAOBAO&ref=1` | `681234567890` | TAOBAO | mulebuy | `https://item.taobao.com/item.htm?id=681234567890` |
| 25 | `https://mulebuy.com/product?id=612345678901&platform=ALI_1688` | `612345678901` | 1688 | mulebuy | `https://detail.1688.com/offer/612345678901.html` |
| 26 | `https://cnfans.com/product/?shop_type=weidian&id=7739733245&ref=` | — | — | **null** (B5) | — |
| 27 | `https://weidian.com/item.html?itemID%3D7739733245` | `3` (B2) | WEIDIAN | direct | `https://weidian.com/item.html?itemID=3` |
| 28 | `https://world.taobao.com/item/681234567890.htm` | — | — | **null** (B4) | — |
| 29 | `https://item.tmall.com/item.htm?id=681234567890` | — | — | **null** (B4) | — |
| 30 | `hello world` | — | — | **null** | — |
| 31 | `https://weidian.com/item.html?itemID=7739733245%` | — | — | **null** (B1) | — |

### 6.1 Pełne oczekiwane wyjście – Weidian (case 1, 2, 3, 9, 12, 16, 18, 21, 23)

```
original:    https://weidian.com/item.html?itemID=7739733245
kakobuy:     https://kakobuy.com/item/details?url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7739733245&affcode=Perkoz
allchinabuy: https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=https%3A%2F%2Fweidian.com%2Fitem.html%3FitemID%3D7739733245&partnercode=wVSV4X
litbuy:      https://litbuy.com/product/weidian/7739733245?inviteCode=GOATREPS
usfans:      https://www.usfans.com/product/3/7739733245?ref=GSWJ8H
acbuy:       https://www.acbuy.com/product?id=7739733245&source=WD&u=MD2BNM
oopbuy:      https://oopbuy.com/product/WEIDIAN/7739733245
mulebuy:     https://mulebuy.com/product?id=7739733245&platform=WEIDIAN&ref=200910978
```

### 6.2 Pełne oczekiwane wyjście – Taobao (case 4, 5, 6, 10, 14, 15, 17, 24)

```
original:    https://item.taobao.com/item.htm?id=681234567890
kakobuy:     https://kakobuy.com/item/details?url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D681234567890&affcode=Perkoz
allchinabuy: https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=https%3A%2F%2Fitem.taobao.com%2Fitem.htm%3Fid%3D681234567890&partnercode=wVSV4X
litbuy:      https://litbuy.com/product/taobao/681234567890?inviteCode=GOATREPS
usfans:      https://www.usfans.com/product/2/681234567890?ref=GSWJ8H
acbuy:       https://www.acbuy.com/product?id=681234567890&source=TB&u=MD2BNM
oopbuy:      https://oopbuy.com/product/TAOBAO/681234567890
mulebuy:     https://mulebuy.com/product?id=681234567890&platform=TAOBAO&ref=200910978
```

### 6.3 Pełne oczekiwane wyjście – 1688 (case 7, 8, 11, 19, 20, 22, 25)

```
original:    https://detail.1688.com/offer/612345678901.html
kakobuy:     https://kakobuy.com/item/details?url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F612345678901.html&affcode=Perkoz
allchinabuy: https://www.allchinabuy.com/en/page/buy/?nTag=Home-search&from=search-input&_search=url&position=&url=https%3A%2F%2Fdetail.1688.com%2Foffer%2F612345678901.html&partnercode=wVSV4X
litbuy:      https://litbuy.com/product/1688/612345678901?inviteCode=GOATREPS
usfans:      https://www.usfans.com/product/1/612345678901?ref=GSWJ8H
acbuy:       https://www.acbuy.com/product?id=612345678901&source=AL&u=MD2BNM
oopbuy:      https://oopbuy.com/product/1688/612345678901
mulebuy:     https://mulebuy.com/product?id=612345678901&platform=ALI_1688&ref=200910978
```

### 6.4 Szkielet testu (vitest)

```ts
import cases from '../../docs/link-converter-cases.json';
import { parse, convertAll } from '@/lib/link-converter';

describe('link converter – zgodność ze starą stroną', () => {
  for (const c of cases.cases) {
    it(c.input, () => {
      expect(parse(c.input)).toEqual(c.parsed);
      expect(convertAll(c.input)).toEqual(c.links);
    });
  }
});
// Gdy poprawicie B1–B5, oznaczcie te przypadki jako oczekiwane odchylenia, zamiast kasować test.
```
