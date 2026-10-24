/** Małe litery, bez polskich znaków i akcentów – "Łańcuszek" i "lancuszek" to to samo. */
export function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
