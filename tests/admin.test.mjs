import { onRequest } from '../functions/api/admin.js';

const PASSWORT = 'ein-langes-testpasswort-42';

/** Ganz einfacher Ersatz für Cloudflare KV. */
function kvAttrappe(start = {}) {
  const daten = new Map(Object.entries(start));
  return {
    daten,
    get: async (k) => (daten.has(k) ? daten.get(k) : null),
    put: async (k, v) => { daten.set(k, v); }
  };
}

function umgebung(extra = {}) {
  return { ADMIN_PASSWORT: PASSWORT, KARTE: kvAttrappe(), ...extra };
}

async function ruf(koerper, { env = umgebung(), cookie = null, ip = '1.2.3.4', method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip };
  if (cookie) headers.Cookie = cookie;
  const request = new Request('https://beispiel.de/api/admin', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(koerper) : undefined
  });
  const res = await onRequest({ request, env });
  let body = {};
  try { body = await res.json(); } catch (e) { /* leer */ }
  return { status: res.status, body, setCookie: res.headers.get('Set-Cookie'), env };
}

/** Meldet an und gibt das Sitzungscookie zurück. */
async function anmelden(env) {
  const a = await ruf({ aktion: 'login', passwort: PASSWORT }, { env });
  return a.setCookie.split(';')[0];
}

let fehler = 0;
function pruefe(name, bedingung, zusatz = '') {
  if (!bedingung) fehler++;
  console.log(`${bedingung ? 'OK  ' : 'FAIL'}  ${name}${zusatz ? '  — ' + zusatz : ''}`);
}

const KARTE = [
  { name: 'Kaffee', note: 'Frisch geröstet', items: [
    { name: 'Espresso', desc: 'Doppelt 3,40', price: '2,40' },
    { name: 'Cappuccino', desc: '', price: '3,60' }
  ]}
];

/* ---------------- Anmeldung ---------------- */

{
  const a = await ruf({ aktion: 'login', passwort: 'falsch' });
  pruefe('Falsches Passwort wird abgelehnt', a.status === 401);
  pruefe('Kein Cookie bei falschem Passwort', !a.setCookie);
}
{
  const a = await ruf({ aktion: 'login', passwort: PASSWORT });
  pruefe('Richtiges Passwort meldet an', a.status === 200);
  pruefe('Cookie ist HttpOnly', /HttpOnly/.test(a.setCookie || ''));
  pruefe('Cookie ist Secure', /Secure/.test(a.setCookie || ''));
  pruefe('Cookie ist SameSite=Strict', /SameSite=Strict/.test(a.setCookie || ''));
}
{
  const a = await ruf({ aktion: 'login', passwort: PASSWORT }, { env: { KARTE: kvAttrappe() } });
  pruefe('Ohne ADMIN_PASSWORT kommt ein klarer Fehler', a.status === 500);
}
{
  const a = await ruf({ aktion: 'irgendwas' }, { method: 'GET' });
  pruefe('GET wird abgewiesen', a.status === 405);
}

/* ---------------- Brute Force ---------------- */

{
  const env = umgebung();
  let letzte;
  for (let i = 0; i < 10; i++) letzte = await ruf({ aktion: 'login', passwort: 'falsch' }, { env });
  pruefe('Nach vielen Fehlversuchen wird gesperrt', letzte.status === 429);

  const trotzdem = await ruf({ aktion: 'login', passwort: PASSWORT }, { env });
  pruefe('Sperre gilt auch für das richtige Passwort', trotzdem.status === 429);

  const andereIp = await ruf({ aktion: 'login', passwort: PASSWORT }, { env, ip: '9.9.9.9' });
  pruefe('Andere IP ist nicht mitgesperrt', andereIp.status === 200);
}

/* ---------------- Sitzung ---------------- */

{
  const a = await ruf({ aktion: 'speichern', karte: KARTE });
  pruefe('Speichern ohne Anmeldung wird abgelehnt', a.status === 401);
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  const a = await ruf({ aktion: 'speichern', karte: KARTE }, { env, cookie });
  pruefe('Speichern mit Anmeldung klappt', a.status === 200);
  pruefe('Karte landet im Speicher', !!env.KARTE.daten.get('speisekarte'));
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  const verbogen = cookie.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'));
  const a = await ruf({ aktion: 'speichern', karte: KARTE }, { env, cookie: verbogen });
  pruefe('Manipulierte Signatur wird erkannt', a.status === 401);
}
{
  const env = umgebung();
  const abgelaufen = 'lokal_admin=' + (Math.floor(Date.now() / 1000) - 10) + '.abc';
  const a = await ruf({ aktion: 'speichern', karte: KARTE }, { env, cookie: abgelaufen });
  pruefe('Abgelaufene Sitzung wird abgelehnt', a.status === 401);
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  // Passwortwechsel muss offene Sitzungen ungültig machen
  env.ADMIN_PASSWORT = 'ein-anderes-langes-passwort';
  const a = await ruf({ aktion: 'speichern', karte: KARTE }, { env, cookie });
  pruefe('Passwortwechsel beendet offene Sitzungen', a.status === 401);
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  const s = await ruf({ aktion: 'status' }, { env, cookie });
  pruefe('Status meldet angemeldet', s.body.angemeldet === true);
  const aus = await ruf({ aktion: 'logout' }, { env, cookie });
  pruefe('Abmelden löscht das Cookie', /Max-Age=0/.test(aus.setCookie || ''));
  const s2 = await ruf({ aktion: 'status' }, { env });
  pruefe('Status ohne Cookie meldet abgemeldet', s2.body.angemeldet === false);
}

/* ---------------- Prüfung der Karte ---------------- */

async function speichere(karte) {
  const env = umgebung();
  const cookie = await anmelden(env);
  return ruf({ aktion: 'speichern', karte }, { env, cookie });
}

pruefe('Leere Karte wird abgelehnt', (await speichere([])).status === 400);
pruefe('Karte muss eine Liste sein', (await speichere({ a: 1 })).status === 400);
pruefe('Kategorie ohne Namen wird abgelehnt',
  (await speichere([{ name: '', items: [] }])).status === 400);
pruefe('Kategorie ohne Gerichteliste wird abgelehnt',
  (await speichere([{ name: 'Kaffee' }])).status === 400);
pruefe('Gericht ohne Namen wird abgelehnt',
  (await speichere([{ name: 'Kaffee', items: [{ name: '', price: '2' }] }])).status === 400);
pruefe('Zu viele Kategorien werden abgelehnt',
  (await speichere(Array.from({ length: 21 }, (_, i) => ({ name: 'K' + i, items: [] })))).status === 400);
pruefe('Leere Kategorie ohne Gerichte ist erlaubt',
  (await speichere([{ name: 'Bald mehr', items: [] }])).status === 200);

{
  const a = await speichere([{ name: 'Wein & Bier', items: [{ name: 'Riesling' }] }]);
  pruefe('Kennung wird aus dem Namen gebildet', a.body.karte[0].id === 'wein-bier',
    'ergab: ' + a.body.karte[0].id);
}
{
  const a = await speichere([{ name: 'Frühstück', items: [] }]);
  pruefe('Umlaute werden umgeschrieben', a.body.karte[0].id === 'fruehstueck',
    'ergab: ' + a.body.karte[0].id);
}
{
  const a = await speichere([{ name: 'Kaffee', items: [] }, { name: 'Kaffee', items: [] }]);
  pruefe('Doppelte Namen bekommen verschiedene Kennungen',
    a.body.karte[0].id !== a.body.karte[1].id,
    a.body.karte.map(k => k.id).join(', '));
}
{
  const a = await speichere([{ name: 'Alle', items: [] }]);
  pruefe('Kennung "alle" wird vermieden', a.body.karte[0].id !== 'alle',
    'ergab: ' + a.body.karte[0].id);
}
{
  const a = await speichere([{ name: '  Kaffee   und   Kuchen  ', note: ' Notiz ', items: [
    { name: '  Espresso ', desc: ' klein ', price: ' 2,40 ' }
  ]}]);
  const k = a.body.karte[0];
  pruefe('Überflüssige Leerzeichen werden entfernt',
    k.name === 'Kaffee und Kuchen' && k.note === 'Notiz' && k.items[0].name === 'Espresso');
}
{
  const lang = 'x'.repeat(500);
  const a = await speichere([{ name: lang, items: [{ name: lang, desc: lang, price: lang }] }]);
  const k = a.body.karte[0];
  pruefe('Überlange Eingaben werden gekürzt',
    k.name.length === 60 && k.items[0].name.length === 80 &&
    k.items[0].desc.length === 200 && k.items[0].price.length === 20);
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  const a = await ruf({ aktion: 'speichern', karte: KARTE }, { env: { ...env, KARTE: undefined }, cookie });
  pruefe('Fehlender Speicher meldet sich sauber', a.status === 500);
}
{
  const env = umgebung();
  const cookie = await anmelden(env);
  const a = await ruf({ aktion: 'quatsch' }, { env, cookie });
  pruefe('Unbekannte Aktion wird abgelehnt', a.status === 400);
}

console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
