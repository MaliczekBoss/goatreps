// Kolejność i nazwy jak na starej stronie.
export const TOOLS = [
  {
    href: "/photo-search",
    name: "Szukaj po zdjęciu",
    description: "Wrzuć zdjęcie albo screen – AI rozpozna produkt i znajdzie go w naszym katalogu.",
    icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z",
  },
  {
    href: "/qc-finder",
    name: "Znajdź zdjęcia QC",
    description: "Wklej link do produktu – pokażemy zdjęcia QC z magazynu, które trzymamy u siebie.",
    icon: "M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  },
  {
    href: "/link-converter",
    name: "Konwerter linków",
    description: "Konwertuj linki z Weidiana, Taobao, 1688 i od agentów na link do Twojego agenta.",
    icon: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  },
  {
    href: "/tracking",
    name: "Śledzenie przesyłek",
    description: "Wpisz numer przesyłki i sprawdź status w 17TRACK, Parcels albo Poczcie Polskiej.",
    icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  },
  {
    href: "/shipping",
    name: "Kalkulator wysyłki",
    description: "Oblicz koszt wysyłki z Chin – dodaj przedmioty, wybierz kraj i porównaj linie.",
    icon: "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  },
] as const;
