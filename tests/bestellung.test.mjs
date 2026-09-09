import { onRequest as bestellung } from '../functions/api/bestellung.js';
import { onRequest as tresen } from '../functions/api/tresen.js';
import { baueToken, COOKIE } from '../lib/auth.js';
import { tischGeheimnis, tischCode } from '../lib/bestellungen.js';
import { d1Attrappe, kvAttrappe, KARTE_BEISPIEL, pruefer } from './hilfen.mjs';

const { pruefe, ende } = pruefer();
const PASSWORT = 'ein-langes-testpasswort-42';

function umgebung() {
  return {
    DB: d1Attrappe(),
    ADMIN_PASSWORT: PASSWORT,
    KARTE: kvAttrappe({ speisekarte: JSON.stringify(KARTE_BEISPIEL) })
  };
}

/** Ergänzt den gültigen Tischcode, wie ihn der QR-Aufsteller mitbringt. */
async function mitCode(koerper, env) {
  if (!koerper || koerper.code !== undefined || koerper.tisch === undefined) return koerper;
  const geheim = await tischGeheimnis(env);
  return { ...koerper, code: await tischCode(geheim, koerper.tisch) };
}

async function bestelle(roh, env, method = 'POST') {
  const koerper = method === 'POST' ? await mitCode(roh, env) : roh;
  const request = new Request('https://beispiel.de/api/bestellung', {
    method,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: method === 'POST' ? JSON.stringify(koerper) : undefined
  });
  const res = await bestellung({ request, env });
  let body = {};
  try { body = await res.json(); } catch (e) { /* leer */ }
  return { status: res.status, body };
}

async function amTresen(koerper, env, { angemeldet = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (angemeldet) headers.Cookie = COOKIE + '=' + await baueToken(PASSWORT);
  const request = new Request('https://beispiel.de/api/tresen', {
    method: 'POST', headers, body: JSON.stringify(koerper)
  });
  const res = await tresen({ request, env });
  let body = {};
  try { body = await res.json(); } catch (e) { /* leer */ }
  return { status: res.status, body };
}

const EINE = { tisch: 7, positionen: [{ name: 'Espresso', menge: 2 }] };

/* ---------------- Markierungen der Karte ---------------- */

{
  // "Heute aus" muss ein Speichern im Admin überleben — sonst verschwindet die
  // Markierung beim ersten Preis-Update und ausverkaufte Artikel sind wieder
  // bestellbar.
  const { onRequest: admin } = await import('../functions/api/admin.js');
  const { baueToken: bt, COOKIE: CK } = await import('../lib/auth.js');
  const env = umgebung();
  const cookie = CK + '=' + await bt(PASSWORT);

  const karte = [{ name: 'Bar', items: [
    { name: 'Pale Ale', price: '5,50', out: true },
    { name: 'Oliven', price: '4,50', empfehlung: true },
    { name: 'Gin Tonic', price: '9,00' }
  ]}];

  const res = await admin({
    request: new Request('https://beispiel.de/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ aktion: 'speichern', karte })
    }), env
  });
  const body = await res.json();
  const artikel = body.karte[0].items;

  pruefe('"Heute aus" überlebt das Speichern', artikel[0].out === true);
  pruefe('"Empfehlung" überlebt das Speichern', artikel[1].empfehlung === true);
  pruefe('Unmarkierte bleiben unmarkiert',
    artikel[2].out === undefined && artikel[2].empfehlung === undefined);

  // Und der so gespeicherte Artikel bleibt nicht bestellbar
  const nachher = await bestelle({ tisch: 7, positionen: [{ name: 'Pale Ale', menge: 1 }] }, env);
  pruefe('Ausverkaufter Artikel bleibt auch nach dem Speichern gesperrt', nachher.status === 400);
}
{
  const { onRequest: admin } = await import('../functions/api/admin.js');
  const { baueToken: bt, COOKIE: CK } = await import('../lib/auth.js');
  const env = umgebung();
  const cookie = CK + '=' + await bt(PASSWORT);
  const karte = [{ name: 'Bar', items: [1, 2, 3, 4].map(n =>
    ({ name: 'Snack ' + n, price: '3,00', empfehlung: true })) }];
  const res = await admin({
    request: new Request('https://beispiel.de/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ aktion: 'speichern', karte })
    }), env
  });
  pruefe('Mehr als drei Empfehlungen werden abgelehnt', res.status === 400);
}

/* ---------------- Bestellen ---------------- */

{
  const env = umgebung();
  const a = await bestelle(EINE, env);
  pruefe('Gültige Bestellung wird angenommen', a.status === 200);
  pruefe('Summe wird serverseitig gerechnet', a.body.summe === 4.8, 'ergab: ' + a.body.summe);
}
{
  const env = umgebung();
  // Der Gast schickt einen eigenen Preis mit — der muss ignoriert werden.
  const a = await bestelle({ tisch: 7, positionen: [{ name: 'Gin Tonic', menge: 1, preis: 0.01 }] }, env);
  pruefe('Mitgeschickter Preis wird ignoriert', a.body.summe === 9, 'ergab: ' + a.body.summe);
}

// GET liefert die Konfiguration für die Bestellseite, andere Methoden nicht.
pruefe('GET liefert die Konfiguration', (await bestelle(null, umgebung(), 'GET')).status === 200);
pruefe('DELETE wird abgewiesen', (await bestelle(null, umgebung(), 'DELETE')).status === 405);

{
  const a = await bestelle({ tisch: 0, positionen: [{ name: 'Espresso', menge: 1 }] }, umgebung());
  pruefe('Tisch 0 wird abgelehnt', a.status === 400);
}
{
  const a = await bestelle({ tisch: 100, positionen: [{ name: 'Espresso', menge: 1 }] }, umgebung());
  pruefe('Tisch 100 wird abgelehnt', a.status === 400);
}
pruefe('Leere Bestellung wird abgelehnt',
  (await bestelle({ tisch: 7, positionen: [] }, umgebung())).status === 400);
pruefe('Unbekannter Artikel wird abgelehnt',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Champagner', menge: 1 }] }, umgebung())).status === 400);
pruefe('Artikel ohne Preis ist nicht bestellbar',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Tageskaffee', menge: 1 }] }, umgebung())).status === 400);
pruefe('Als "heute aus" markierter Artikel ist nicht bestellbar',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Cold Brew', menge: 1 }] }, umgebung())).status === 400);
pruefe('Menge 0 wird abgelehnt',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Espresso', menge: 0 }] }, umgebung())).status === 400);
pruefe('Menge 21 wird abgelehnt',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Espresso', menge: 21 }] }, umgebung())).status === 400);
pruefe('Zu viele verschiedene Artikel werden abgelehnt',
  (await bestelle({ tisch: 7, positionen: Array.from({ length: 11 }, () => ({ name: 'Espresso', menge: 1 })) }, umgebung())).status === 400);
pruefe('Bestellung über 100 € wird abgelehnt',
  (await bestelle({ tisch: 7, positionen: [{ name: 'Gin Tonic', menge: 20 }] }, umgebung())).status === 400);

{
  const env = umgebung();
  for (let i = 0; i < 3; i++) await bestelle(EINE, env);
  const vierte = await bestelle(EINE, env);
  pruefe('Vierte offene Bestellung am Tisch wird gebremst', vierte.status === 429);

  const andererTisch = await bestelle({ tisch: 8, positionen: [{ name: 'Espresso', menge: 1 }] }, env);
  pruefe('Anderer Tisch ist nicht mitgebremst', andererTisch.status === 200);
}
{
  const env = umgebung();
  await env.KARTE.put('bestellung-gesperrt', '1');
  pruefe('Gesperrtes Bestellen wird abgewiesen', (await bestelle(EINE, env)).status === 503);
}
{
  const env = umgebung();
  delete env.DB;
  pruefe('Fehlende Datenbank meldet sich sauber', (await bestelle(EINE, env)).status === 500);
}

/* ---------------- Tresen ---------------- */

pruefe('Tresen ohne Anmeldung wird abgewiesen',
  (await amTresen({ aktion: 'liste' }, umgebung(), { angemeldet: false })).status === 401);

{
  const env = umgebung();
  await bestelle(EINE, env);
  await bestelle({ tisch: 3, positionen: [{ name: 'Gin Tonic', menge: 1 }] }, env);

  const a = await amTresen({ aktion: 'liste' }, env);
  pruefe('Tresen sieht beide Bestellungen', a.body.bestellungen.length === 2);
  pruefe('Älteste steht oben', a.body.bestellungen[0].tisch === 7);
  pruefe('Positionen kommen lesbar zurück',
    a.body.bestellungen[0].positionen[0].name === 'Espresso' &&
    a.body.bestellungen[0].positionen[0].menge === 2);

  const id = a.body.bestellungen[0].id;
  pruefe('Annehmen klappt', (await amTresen({ aktion: 'status', id, status: 'angenommen' }, env)).status === 200);

  const b = await amTresen({ aktion: 'liste' }, env);
  pruefe('Status ist übernommen', b.body.bestellungen.find(x => x.id === id).status === 'angenommen');

  await amTresen({ aktion: 'status', id, status: 'serviert' }, env);
  const c = await amTresen({ aktion: 'liste' }, env);
  pruefe('Servierte bleibt zunächst sichtbar', !!c.body.bestellungen.find(x => x.id === id));

  await amTresen({ aktion: 'status', id, status: 'storniert' }, env);
  const d = await amTresen({ aktion: 'liste' }, env);
  pruefe('Stornierte verschwindet aus der Liste', !d.body.bestellungen.find(x => x.id === id));
  pruefe('Nach Storno bleibt nur die andere', d.body.bestellungen.length === 1);
}
{
  const env = umgebung();
  const a = await amTresen({ aktion: 'status', id: 'gibtsnicht', status: 'serviert' }, env);
  pruefe('Unbekannte Bestellung meldet 404', a.status === 404);
}
{
  const env = umgebung();
  await bestelle(EINE, env);
  const liste = await amTresen({ aktion: 'liste' }, env);
  const id = liste.body.bestellungen[0].id;
  const a = await amTresen({ aktion: 'status', id, status: 'bezahlt' }, env);
  pruefe('Unbekannter Status wird abgelehnt', a.status === 400);
}
{
  const env = umgebung();
  await amTresen({ aktion: 'sperre', gesperrt: true }, env);
  pruefe('Sperre wird gespeichert', await env.KARTE.get('bestellung-gesperrt') === '1');
  pruefe('Gesperrt taucht in der Liste auf', (await amTresen({ aktion: 'liste' }, env)).body.gesperrt === true);
  await amTresen({ aktion: 'sperre', gesperrt: false }, env);
  pruefe('Freigabe wird gespeichert', await env.KARTE.get('bestellung-gesperrt') === '0');
}
{
  const env = umgebung();
  pruefe('Ohne gesetzte Sperre ist Bestellen möglich', (await bestelle(EINE, env)).status === 200);
  pruefe('Unbekannte Tresen-Aktion wird abgelehnt',
    (await amTresen({ aktion: 'quatsch' }, env)).status === 400);
}

/* ---------------- Tischcode ---------------- */

{
  const env = umgebung();
  // Ohne Code — genau der Fall "Adresse geraten"
  const ohne = await bestelle({ ...EINE, code: '' }, env);
  pruefe('Bestellung ohne Code wird abgelehnt', ohne.status === 403);

  const falsch = await bestelle({ ...EINE, code: 'abcdefgh' }, env);
  pruefe('Bestellung mit falschem Code wird abgelehnt', falsch.status === 403);

  const geheim = await tischGeheimnis(env);
  const fremd = await bestelle({ ...EINE, code: await tischCode(geheim, 8) }, env);
  pruefe('Code eines anderen Tisches gilt nicht', fremd.status === 403);

  pruefe('Mit richtigem Code klappt es', (await bestelle(EINE, env)).status === 200);
}
{
  const env = umgebung();
  const a = await amTresen({ aktion: 'tischcodes', von: 1, bis: 3 }, env);
  pruefe('Tresen liefert Codes', a.status === 200 && a.body.tische.length === 3);
  pruefe('Jeder Tisch hat einen eigenen Code',
    new Set(a.body.tische.map(t => t.code)).size === 3);

  const ohne = await amTresen({ aktion: 'tischcodes', von: 1, bis: 3 }, env, { angemeldet: false });
  pruefe('Codes gibt es nur angemeldet', ohne.status === 401);

  const bereich = await amTresen({ aktion: 'tischcodes', von: 5, bis: 2 }, env);
  pruefe('Falscher Bereich wird abgelehnt', bereich.status === 400);
}
{
  const env = umgebung();
  const g1 = await tischGeheimnis(env);
  const g2 = await tischGeheimnis(env);
  pruefe('Geheimnis bleibt über Aufrufe gleich', g1 === g2);
  pruefe('Geheimnis liegt im Speicher', !!(await env.KARTE.get('tisch-geheimnis')));
}

/* ---------------- Grenze je Absender ---------------- */

{
  const env = umgebung();
  let letzte;
  // 12 sind erlaubt, verteilt über verschiedene Tische, damit nicht die
  // Tischgrenze zuerst greift.
  for (let i = 0; i < 14; i++) {
    letzte = await bestelle({ tisch: (i % 9) + 1, positionen: [{ name: 'Espresso', menge: 1 }] }, env);
  }
  pruefe('Zu viele Bestellungen vom selben Absender werden gebremst', letzte.status === 429);
}
{
  const env = umgebung();
  const a = await bestelle(EINE, env);
  const zeile = await env.DB.prepare('SELECT absender FROM bestellungen').first();
  pruefe('Bestellung wird angenommen', a.status === 200);
  pruefe('Es wird ein Hash gespeichert, keine IP',
    !!zeile.absender && !String(zeile.absender).includes('203.0.113.9'),
    String(zeile.absender).slice(0, 16) + '…');
}

/* ---------------- Turnstile ---------------- */

{
  const env = { ...umgebung(), TURNSTILE_SECRET: 'geheim' };
  const echterFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false }));
  const a = await bestelle({ ...EINE, turnstile: 'kaputt' }, env);
  globalThis.fetch = echterFetch;
  pruefe('Fehlgeschlagenes Turnstile blockt', a.status === 403);
}
{
  const env = { ...umgebung(), TURNSTILE_SECRET: 'geheim' };
  const echterFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }));
  const a = await bestelle({ ...EINE, turnstile: 'gut' }, env);
  globalThis.fetch = echterFetch;
  pruefe('Bestandenes Turnstile lässt durch', a.status === 200);
}
{
  const env = umgebung();   // ohne TURNSTILE_SECRET
  pruefe('Ohne Turnstile-Schlüssel läuft alles wie bisher',
    (await bestelle(EINE, env)).status === 200);
}
{
  const request = new Request('https://beispiel.de/api/bestellung', { method: 'GET' });
  const res = await bestellung({ request, env: { TURNSTILE_SITEKEY: 'abc' } });
  const body = await res.json();
  pruefe('GET verrät den öffentlichen Sitekey', body.turnstileSitekey === 'abc');
}

ende();
