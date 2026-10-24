// Nazwy kategorii do kafelków po stronie przeglądarki (pełna lista z liczbami jest w data/categories.json).
export const CATEGORY_NAMES: Record<string, string> = {
  buty: "Buty",
  koszulki: "Koszulki",
  bluzy: "Bluzy",
  swetry: "Swetry",
  kurtki: "Kurtki",
  sety: "Sety",
  spodnie: "Spodnie",
  spodenki: "Spodenki",
  longsleeve: "Longsleeve",
  nakrycie_glowy: "Nakrycie głowy",
  okulary: "Okulary",
  torby_i_plecaki: "Torby i plecaki",
  akcesoria: "Akcesoria",
  paski: "Paski",
  elektronika: "Elektronika",
  inne: "Inne",
};

export const categoryName = (slug: string) => CATEGORY_NAMES[slug] ?? slug;
