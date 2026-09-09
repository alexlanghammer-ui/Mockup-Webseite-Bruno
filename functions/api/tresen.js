/**
 * POST /api/tresen
 *
 * Der Blick der Bedienung auf die Bestellungen. Geschützt durch dieselbe
 * Anmeldung wie der Speisekarten-Editor.
 *
 * Aktionen:
 *   liste    — offene und kürzlich servierte Bestellungen
 *   status   — eine Bestellung auf angenommen / serviert / storniert setzen
 *   sperre   — Bestellen per Handy an- oder abschalten
 */

import { istAngemeldet } from '../../lib/auth.js';
import {
  json, stelleTabelleSicher, jetzt, MAX_TISCH, tischGeheimnis, tischCode
} from '../../lib/bestellungen.js';

/** Servierte Bestellungen bleiben eine Weile sichtbar, dann verschwinden sie. */
const NACHLAUF_SEKUNDEN = 30 * 60;

/** Ältere Erledigte werden beim Abruf nebenbei aufgeräumt. */
const AUFRAEUMEN_NACH_SEKUNDEN = 24 * 60 * 60;

const ERLAUBTE_STATUS = ['angenommen', 'serviert', 'storniert'];

function zeile(r) {
  let positionen = [];
  try { positionen = JSON.parse(r.positionen); } catch (e) { /* unlesbar */ }
  return {
    id: r.id,
    tisch: r.tisch,
    status: r.status,
    positionen: positionen,
    summe: r.summe,
    hinweis: r.hinweis || '',
    erstellt: r.erstellt,
    geaendert: r.geaendert
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);

  if (!env.ADMIN_PASSWORT) {
    console.error('ADMIN_PASSWORT fehlt — siehe ANLEITUNG.md, Schritt 10.');
    return json({ error: 'Der Tresen ist noch nicht eingerichtet.' }, 500);
  }
  if (!await istAngemeldet(request, env)) return json({ error: 'Nicht angemeldet.' }, 401);

  let daten;
  try {
    daten = await request.json();
  } catch (e) {
    return json({ error: 'Anfrage konnte nicht gelesen werden.' }, 400);
  }

  /* --- Tischcodes für die Aufsteller -------------------------------- */
  // Braucht keine Datenbank, deshalb vor der Prüfung darauf.
  if (daten.aktion === 'tischcodes') {
    const geheim = await tischGeheimnis(env);
    if (!geheim) return json({ error: 'Der Speicher ist noch nicht eingerichtet.' }, 500);

    const von = parseInt(daten.von, 10);
    const bis = parseInt(daten.bis, 10);
    if (!(von >= 1 && bis <= MAX_TISCH && von <= bis)) {
      return json({ error: 'Bitte einen Bereich zwischen 1 und ' + MAX_TISCH + ' angeben.' }, 400);
    }

    const tische = [];
    for (let t = von; t <= bis; t++) tische.push({ tisch: t, code: await tischCode(geheim, t) });
    return json({ ok: true, tische: tische }, 200);
  }

  if (!env.DB) {
    console.error('D1-Binding DB fehlt — siehe ANLEITUNG.md, Schritt 12.');
    return json({ error: 'Das Bestellsystem ist noch nicht eingerichtet.' }, 500);
  }

  await stelleTabelleSicher(env.DB);
  const zeit = jetzt();

  /* --- Liste ------------------------------------------------------- */
  if (daten.aktion === 'liste') {
    // Alles Offene, dazu kurz die zuletzt Servierten — damit die Bedienung
    // sieht, was gerade rausgegangen ist, und nichts doppelt bringt.
    const { results } = await env.DB
      .prepare("SELECT * FROM bestellungen WHERE status IN ('neu','angenommen') " +
               "OR (status = 'serviert' AND geaendert > ?) ORDER BY erstellt ASC")
      .bind(zeit - NACHLAUF_SEKUNDEN)
      .all();

    // Nebenbei aufräumen, damit die Tabelle nicht endlos wächst.
    await env.DB
      .prepare("DELETE FROM bestellungen WHERE status IN ('serviert','storniert') AND geaendert < ?")
      .bind(zeit - AUFRAEUMEN_NACH_SEKUNDEN)
      .run();

    const gesperrt = env.KARTE ? (await env.KARTE.get('bestellung-gesperrt')) === '1' : false;

    return json({ ok: true, bestellungen: (results || []).map(zeile), gesperrt: gesperrt }, 200);
  }

  /* --- Status ändern ----------------------------------------------- */
  if (daten.aktion === 'status') {
    const id = typeof daten.id === 'string' ? daten.id : '';
    const status = daten.status;

    if (!id) return json({ error: 'Keine Bestellung angegeben.' }, 400);
    if (ERLAUBTE_STATUS.indexOf(status) === -1) return json({ error: 'Unbekannter Status.' }, 400);

    const ergebnis = await env.DB
      .prepare('UPDATE bestellungen SET status = ?, geaendert = ? WHERE id = ?')
      .bind(status, zeit, id)
      .run();

    const geaendert = ergebnis && ergebnis.meta ? ergebnis.meta.changes : 0;
    if (!geaendert) return json({ error: 'Diese Bestellung gibt es nicht mehr.' }, 404);

    return json({ ok: true }, 200);
  }

  /* --- Bestellen sperren oder freigeben ----------------------------- */
  if (daten.aktion === 'sperre') {
    if (!env.KARTE) return json({ error: 'Der Speicher ist noch nicht eingerichtet.' }, 500);
    const gesperrt = daten.gesperrt === true;
    await env.KARTE.put('bestellung-gesperrt', gesperrt ? '1' : '0');
    return json({ ok: true, gesperrt: gesperrt }, 200);
  }

  return json({ error: 'Unbekannte Aktion.' }, 400);
}
