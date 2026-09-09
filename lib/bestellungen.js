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
    'erstellt INTEGER NOT NULL, ' +
    'geaendert INTEGER NOT NULL)'
  );
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
