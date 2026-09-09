import { onRequest as bestellung } from '../functions/api/bestellung.js';
import { onRequest as tresen } from '../functions/api/tresen.js';
import { baueToken, COOKIE } from '../lib/auth.js';
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

async function bestelle(koerper, env, method = 'POST') {
  const request = new Request('https://beispiel.de/api/bestellung', {
    method,
    headers: { 'Content-Type': 'application/json' },
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

pruefe('GET wird abgewiesen', (await bestelle(null, umgebung(), 'GET')).status === 405);

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

ende();
