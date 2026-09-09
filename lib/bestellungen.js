/**
 * Gemeinsame Helfer für Bestellungen.
 *
 * Liegt außerhalb von functions/, weil Cloudflare Pages jede Datei unter
 * functions/ zu einem eigenen Endpunkt macht. Von dort importiert, wird diese
 * Datei beim Deploy einfach mit hineingebaut.
 */

export const MAX_TISCH = 99;
export const MAX_POSITIONEN = 10;      // verschiedene Artikel je Bestellung
export const MAX_MENGE = 20;           // Stück je Artikel
export const MAX_SUMME = 100;          // Euro je Bestellung
export const MAX_OFFEN_JE_TISCH = 3;   // gleichzeitig offene Bestellungen
export const MAX_JE_ABSENDER = 12;     // Bestellungen pro Stunde und Absender
export const ABSENDER_FENSTER = 3600;  // Sekunden

export const json = (daten, status, kopf) =>
  new Response(JSON.stringify(daten), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, kopf || {})
  });

/**
 * Legt die Tabelle an, falls sie noch fehlt. Erspart es, beim Einrichten von
 * Hand ein SQL-Skript auszuführen — der erste Aufruf erledigt das.
 */
export async function stelleTabelleSicher(db) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS bestellungen (' +
    'id TEXT PRIMARY KEY, ' +
    'tisch INTEGER NOT NULL, ' +
    'status TEXT NOT NULL, ' +
    'positionen TEXT NOT NULL, ' +
    'summe REAL NOT NULL, ' +
    'hinweis TEXT, ' +
    'absender TEXT, ' +
    'erstellt INTEGER NOT NULL, ' +
    'geaendert INTEGER NOT NULL)'
  );
  // Für Datenbanken, die vor dieser Spalte angelegt wurden. Ist sie schon da,
  // scheitert die Anweisung — das ist hier der Normalfall, nicht der Fehler.
  try { await db.exec('ALTER TABLE bestellungen ADD COLUMN absender TEXT'); } catch (e) { /* vorhanden */ }
}

/* ------------------------------------------------------------------ */
/* Absender: gezählt wird ein Hash, nie die IP-Adresse selbst           */
/* ------------------------------------------------------------------ */

const kodierer = new TextEncoder();

async function hmac(geheim, text) {
  const key = await crypto.subtle.importKey(
    'raw', kodierer.encode(geheim), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, kodierer.encode(text));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Vergleich in konstanter Zeit — sonst ließe sich ein Code zeichenweise raten. */
export function gleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

/**
 * Das Geheimnis, aus dem die Tischcodes abgeleitet werden. Wird beim ersten
 * Gebrauch erzeugt und in KV abgelegt — so muss beim Einrichten nichts
 * zusätzlich gesetzt werden, und ein Wechsel des Admin-Passworts macht die
 * gedruckten QR-Codes nicht ungültig.
 */
export async function tischGeheimnis(env) {
  if (!env.KARTE) return null;
  let geheim = await env.KARTE.get('tisch-geheimnis');
  if (!geheim) {
    geheim = crypto.randomUUID() + crypto.randomUUID();
    await env.KARTE.put('tisch-geheimnis', geheim);
  }
  return geheim;
}

/** Kurzer Code je Tisch. Nicht zu raten, aber noch abtippbar. */
export async function tischCode(geheim, tisch) {
  return (await hmac(geheim, 'tisch:' + tisch)).slice(0, 8);
}

/** Zählt den Absender, ohne die IP zu speichern. */
export async function absenderKennung(geheim, ip) {
  if (!ip) return null;
  return (await hmac(geheim || 'ohne-geheimnis', 'absender:' + ip)).slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Turnstile                                                           */
/* ------------------------------------------------------------------ */

/**
 * Prüft das Turnstile-Token bei Cloudflare. Sind die Schlüssel nicht gesetzt,
 * ist Turnstile abgeschaltet und alles läuft wie bisher — die Bestellseite
 * lädt dann auch nichts von fremden Servern.
 */
export async function turnstileGeprueft(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;

  const daten = new FormData();
  daten.append('secret', env.TURNSTILE_SECRET);
  daten.append('response', token);
  if (ip) daten.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: daten
    });
    const ergebnis = await res.json();
    return ergebnis && ergebnis.success === true;
  } catch (e) {
    console.error('Turnstile nicht erreichbar:', e && e.message);
    return false;
  }
}

/** "3,60" wie auch "3.60" ergeben 3.6. Leer oder unlesbar ergibt null. */
export function preisAlsZahl(text) {
  if (typeof text !== 'string') return null;
  const sauber = text.replace(/[^0-9,.]/g, '').replace(',', '.');
  if (!sauber) return null;
  const n = Number.parseFloat(sauber);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Holt die Speisekarte, die auch die Webseite zeigt: zuerst die im
 * Admin-Bereich gepflegte, sonst die mitgelieferte Startkarte.
 */
export async function ladeKarte(env, request) {
  if (env.KARTE) {
    const gespeichert = await env.KARTE.get('speisekarte');
    if (gespeichert) {
      try {
        const k = JSON.parse(gespeichert);
        if (Array.isArray(k) && k.length) return k;
      } catch (e) { /* fällt unten durch */ }
    }
  }
  // Cloudflare Pages stellt die eigenen Dateien über env.ASSETS bereit. Das
  // ist verlässlicher als ein Aufruf an die eigene Adresse, der über das Netz
  // zurückliefe.
  const adresse = new URL('/assets/speisekarte-standard.json', request.url);
  try {
    const res = env.ASSETS ? await env.ASSETS.fetch(adresse) : await fetch(adresse);
    if (res.ok) return await res.json();
  } catch (e) { /* keine Karte */ }
  return null;
}

/** Alle bestellbaren Artikel als Name -> Preis. Ohne Preis heißt nicht bestellbar. */
export function bestellbareArtikel(karte) {
  const artikel = new Map();
  for (const kategorie of karte) {
    for (const eintrag of kategorie.items || []) {
      if (eintrag.out) continue;                       // heute aus
      const preis = preisAlsZahl(eintrag.price);
      if (preis === null) continue;                    // ohne Preis nicht bestellbar
      artikel.set(eintrag.name, { preis: preis, kategorie: kategorie.name });
    }
  }
  return artikel;
}

export function text(wert, max) {
  if (typeof wert !== 'string') return '';
  return wert.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Zeitstempel in Sekunden — reicht für eine Bestellliste und liest sich besser. */
export const jetzt = () => Math.floor(Date.now() / 1000);
