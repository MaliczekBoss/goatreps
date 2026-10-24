// Klucz do logowania dwuetapowego (TOTP) w panelu admina goatreps. Bez zależności: node admin-2fa.mjs
import { randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

// 160 bitów – tyle zaleca RFC 4226
const secret = base32(randomBytes(20));
const label = encodeURIComponent("goatreps:admin");
const uri = `otpauth://totp/${label}?secret=${secret}&issuer=goatreps&algorithm=SHA1&digits=6&period=30`;

console.log(`
Logowanie dwuetapowe do panelu admina goatreps

1. W aplikacji z kodami (np. Google Authenticator, Aegis, 2FAS) wybierz „Dodaj kod” → „Wpisz klucz konfiguracji”:
     Nazwa konta: goatreps admin
     Klucz:       ${secret}
     Typ:         oparty na czasie

   (albo zrób z tego adresu kod QR w zaufanym, lokalnym programie: ${uri})

2. Na serwerze dopisz do pliku strona/.env:
     ADMIN_TOTP_SECRET=${secret}
   i uruchom stronę ponownie. Lokalnie dopisz tę samą linijkę do strona/.env.local.

3. Od teraz logowanie pyta o hasło i 6-cyfrowy kod z aplikacji. Każdy kod działa tylko raz.

Zgubisz telefon? Usuń ADMIN_TOTP_SECRET z .env na serwerze (restart strony) i wygeneruj nowy klucz.
Nie wklejaj klucza do czatu, zrzutów ekranu ani repozytorium – kto go ma, generuje kody.
`);
