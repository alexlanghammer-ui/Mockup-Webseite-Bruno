/**
 * POST /api/bestellung
 *
 * Nimmt eine Bestellung vom Tisch entgegen. Öffentlich erreichbar — der Gast
 * scannt ja nur einen QR-Code und meldet sich nirgends an.
 *
 * Bewusst nicht enthalten: Bezahlen. Kassiert wird wie bisher an der Kasse der
 * Bar. Damit ist dieses System keine Kasse im Sinne der Kassensicherungs-
 * verordnung und braucht keine TSE.
 *
 * Missbrauch wird über drei Grenzen gebremst: Anzahl der Positionen, Summe je
 * Bestellung und Anzahl gleichzeitig offener Bestellungen je Tisch.
 */

import {
  MAX_TISCH, MAX_POSITIONEN, MAX_MENGE, MAX_SUMME, MAX_OFFEN_JE_TISCH,
  MAX_JE_ABSENDER, ABSENDER_FENSTER,
  json, stelleTabelleSicher, ladeKarte, bestellbareArtikel, text, jetzt,
  gleich, tischGeheimnis, tischCode, absenderKennung, turnstileGeprueft
} from '../../lib/bestellungen.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Die Bestellseite fragt hier ab, ob sie ein Turnstile-Feld zeigen muss.
  // Der Sitekey ist öffentlich, deshalb darf er hier heraus.
  if (request.method === 'GET') {
    return json({ turnstileSitekey: env.TURNSTILE_SITEKEY || null }, 200);
  }

  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);

  if (!env.DB) {
    console.error('D1-Binding DB fehlt — siehe ANLEITUNG.md, Schritt 12.');
    return json({ error: 'Das Bestellsystem ist noch nicht eingerichtet.' }, 500);
  }

  // Der Wirt kann das Bestellen abschalten, etwa spät am Abend.
  if (env.KARTE && (await env.KARTE.get('bestellung-gesperrt')) === '1') {
    return json({ error: 'Bestellen per Handy ist gerade nicht möglich. Sag uns einfach kurz Bescheid.' }, 503);
  }

  let daten;
  try {
    daten = await request.json();
  } catch (e) {
    return json({ error: 'Anfrage konnte nicht gelesen werden.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP');

  // Turnstile zuerst: Stimmt das nicht, ist alles Weitere unnötig.
  if (!await turnstileGeprueft(env, daten.turnstile, ip)) {
    return json({ error: 'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte lade die Seite neu.' }, 403);
  }

  const tisch = parseInt(daten.tisch, 10);
  if (!(tisch >= 1 && tisch <= MAX_TISCH)) {
    return json({ error: 'Diese Tischnummer gibt es nicht.' }, 400);
  }

  // Der Code steht nur auf dem gedruckten Aufsteller. Ohne ihn lässt sich die
  // Adresse nicht einfach raten, und niemand kann von außerhalb Tischnummern
  // durchprobieren.
  const geheim = await tischGeheimnis(env);
  if (!geheim) {
    console.error('KV-Binding KARTE fehlt — ohne Speicher gibt es keine Tischcodes.');
    return json({ error: 'Das Bestellsystem ist noch nicht eingerichtet.' }, 500);
  }
  if (!gleich(text(daten.code, 16), await tischCode(geheim, tisch))) {
    return json({ error: 'Dieser QR-Code gilt nicht mehr. Bitte scann den Code auf dem Tisch erneut.' }, 403);
  }

  if (!Array.isArray(daten.positionen) || daten.positionen.length === 0) {
    return json({ error: 'Es ist nichts ausgewählt.' }, 400);
  }
  if (daten.positionen.length > MAX_POSITIONEN) {
    return json({ error: 'Bitte höchstens ' + MAX_POSITIONEN + ' verschiedene Artikel je Bestellung.' }, 400);
  }

  const karte = await ladeKarte(env, request);
  if (!karte) {
    console.error('Keine Speisekarte gefunden — im Admin-Bereich einmal speichern.');
    return json({ error: 'Die Speisekarte ist gerade nicht verfügbar. Sag uns kurz Bescheid.' }, 503);
  }
  const artikel = bestellbareArtikel(karte);

  // Preise kommen aus der Speisekarte, nie aus der Anfrage — sonst könnte
  // sich der Gast seinen eigenen Preis schicken.
  const positionen = [];
  let summe = 0;
  for (const p of daten.positionen) {
    const name = text(p && p.name, 80);
    const menge = parseInt(p && p.menge, 10);

    const gefunden = artikel.get(name);
    if (!gefunden) return json({ error: '„' + name + '" ist gerade nicht bestellbar.' }, 400);
    if (!(menge >= 1 && menge <= MAX_MENGE)) {
      return json({ error: 'Die Menge bei „' + name + '" passt nicht.' }, 400);
    }

    positionen.push({ name: name, menge: menge, preis: gefunden.preis });
    summe += gefunden.preis * menge;
  }

  summe = Math.round(summe * 100) / 100;
  if (summe > MAX_SUMME) {
    return json({
      error: 'Für Bestellungen über ' + MAX_SUMME + ' € sag uns bitte kurz persönlich Bescheid.'
    }, 400);
  }

  await stelleTabelleSicher(env.DB);

  // Grenze je Absender. Gespeichert wird nur ein Hash — die IP-Adresse selbst
  // landet nirgends in der Datenbank.
  const absender = await absenderKennung(geheim, ip);
  if (absender) {
    const bisher = await env.DB
      .prepare('SELECT COUNT(*) AS anzahl FROM bestellungen WHERE absender = ? AND erstellt > ?')
      .bind(absender, jetzt() - ABSENDER_FENSTER)
      .first();
    if (bisher && bisher.anzahl >= MAX_JE_ABSENDER) {
      return json({
        error: 'Von diesem Gerät kamen gerade sehr viele Bestellungen. Sag uns bitte kurz persönlich Bescheid.'
      }, 429);
    }
  }

  const offen = await env.DB
    .prepare("SELECT COUNT(*) AS anzahl FROM bestellungen WHERE tisch = ? AND status IN ('neu','angenommen')")
    .bind(tisch)
    .first();

  if (offen && offen.anzahl >= MAX_OFFEN_JE_TISCH) {
    return json({
      error: 'An diesem Tisch sind schon ' + MAX_OFFEN_JE_TISCH +
             ' Bestellungen offen. Bitte warte, bis sie gebracht wurden.'
    }, 429);
  }

  const id = crypto.randomUUID();
  const zeit = jetzt();

  await env.DB
    .prepare('INSERT INTO bestellungen ' +
             '(id, tisch, status, positionen, summe, hinweis, absender, erstellt, geaendert) ' +
             'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, tisch, 'neu', JSON.stringify(positionen), summe,
          text(daten.hinweis, 200), absender, zeit, zeit)
    .run();

  return json({ ok: true, id: id, tisch: tisch, summe: summe, positionen: positionen }, 200);
}
