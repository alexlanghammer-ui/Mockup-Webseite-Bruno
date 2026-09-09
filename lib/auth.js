/**
 * Anmeldung und Sitzung für die geschützten Bereiche (Speisekarte, Tresen).
 *
 * Das Passwort steht in der Umgebungsvariable ADMIN_PASSWORT und niemals im
 * Code. Die Sitzung ist ein signiertes Cookie — auf dem Server wird nichts
 * gespeichert. Signiert wird mit dem Passwort selbst: Wird es geändert, sind
 * alle offenen Sitzungen sofort ungültig.
 */

export const COOKIE = 'lokal_admin';
export const SITZUNG_SEKUNDEN = 12 * 60 * 60;   // deckt eine ganze Schicht ab

const kodierer = new TextEncoder();

async function signiere(geheim, text) {
  const key = await crypto.subtle.importKey(
    'raw', kodierer.encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, kodierer.encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Vergleich in konstanter Zeit. Ein normaler Vergleich bricht beim ersten
 * abweichenden Zeichen ab — aus den Laufzeitunterschieden ließe sich das
 * Passwort zeichenweise erraten.
 */
export function gleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

export async function baueToken(passwort) {
  const ablauf = Math.floor(Date.now() / 1000) + SITZUNG_SEKUNDEN;
  return ablauf + '.' + await signiere(passwort, 'admin-sitzung:' + ablauf);
}

export async function tokenGueltig(token, passwort) {
  if (typeof token !== 'string' || !passwort) return false;
  const teile = token.split('.');
  if (teile.length !== 2) return false;
  const ablauf = parseInt(teile[0], 10);
  if (!(ablauf > Math.floor(Date.now() / 1000))) return false;
  return gleich(teile[1], await signiere(passwort, 'admin-sitzung:' + ablauf));
}

export function leseCookie(request, name) {
  const roh = request.headers.get('Cookie') || '';
  for (const stueck of roh.split(';')) {
    const [k, ...rest] = stueck.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export const setzeCookie = (wert, sekunden) =>
  COOKIE + '=' + wert + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + sekunden;

/** Kurzform für die geschützten Endpunkte. */
export async function istAngemeldet(request, env) {
  return tokenGueltig(leseCookie(request, COOKIE), env.ADMIN_PASSWORT);
}
