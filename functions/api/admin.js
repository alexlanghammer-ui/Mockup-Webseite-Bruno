/**
 * POST /api/admin
 *
 * Der geschützte Teil: anmelden, abmelden und die Speisekarte speichern.
 * Alle drei laufen über diesen einen Endpunkt, gesteuert über das Feld
 * "aktion" im Anfragekörper.
 *
 * Das Passwort steht in der Umgebungsvariable ADMIN_PASSWORT und niemals im
 * Code. Wie sie gesetzt wird, steht in ANLEITUNG.md, Schritt 10.
 *
 * Die Sitzung ist ein signiertes Cookie — auf dem Server wird nichts
 * gespeichert. Signiert wird mit dem Passwort selbst: änderst du es, sind
 * alle offenen Sitzungen sofort ungültig.
 */

const COOKIE = 'bruno_admin';
const SITZUNG_SEKUNDEN = 8 * 60 * 60;   // 8 Stunden
const MAX_VERSUCHE = 8;                  // pro IP
const SPERRE_SEKUNDEN = 900;             // 15 Minuten

const MAX_KATEGORIEN = 20;
const MAX_GERICHTE = 60;

const json = (daten, status, kopf) =>
  new Response(JSON.stringify(daten), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, kopf || {})
  });

/* ------------------------------------------------------------------ */
/* Anmeldung                                                           */
/* ------------------------------------------------------------------ */

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
function gleich(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return unterschied === 0;
}

async function baueToken(passwort) {
  const ablauf = Math.floor(Date.now() / 1000) + SITZUNG_SEKUNDEN;
  return ablauf + '.' + await signiere(passwort, 'bruno-admin:' + ablauf);
}

async function tokenGueltig(token, passwort) {
  if (typeof token !== 'string') return false;
  const teile = token.split('.');
  if (teile.length !== 2) return false;
  const ablauf = parseInt(teile[0], 10);
  if (!(ablauf > Math.floor(Date.now() / 1000))) return false;
  return gleich(teile[1], await signiere(passwort, 'bruno-admin:' + ablauf));
}

function leseCookie(request, name) {
  const roh = request.headers.get('Cookie') || '';
  for (const stueck of roh.split(';')) {
    const [k, ...rest] = stueck.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

const setzeCookie = (wert, sekunden) =>
  COOKIE + '=' + wert + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + sekunden;

/**
 * Einfache Bremse gegen automatisiertes Durchprobieren. Zählt Fehlversuche je
 * IP. Der Zähler liegt in KV und ist dort nur "eventually consistent" — als
 * exakte Sperre taugt er nicht, zum Ausbremsen eines Bots reicht er.
 */
async function zuVieleVersuche(env, ip) {
  if (!env.KARTE || !ip) return false;
  const stand = await env.KARTE.get('login-versuche:' + ip);
  return stand !== null && parseInt(stand, 10) >= MAX_VERSUCHE;
}

async function merkeFehlversuch(env, ip) {
  if (!env.KARTE || !ip) return;
  const stand = parseInt(await env.KARTE.get('login-versuche:' + ip) || '0', 10);
  await env.KARTE.put('login-versuche:' + ip, String(stand + 1), {
    expirationTtl: SPERRE_SEKUNDEN
  });
}

/* ------------------------------------------------------------------ */
/* Prüfung der Speisekarte                                             */
/* ------------------------------------------------------------------ */

function text(wert, max) {
  if (typeof wert !== 'string') return '';
  return wert.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Aus "Wein & Bier" wird "wein-bier" — brauchbar als Kennung im Filter. */
function kennung(name, vergeben) {
  let basis = name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!basis) basis = 'kategorie';
  let k = basis, n = 2;
  while (vergeben.has(k)) k = basis + '-' + n++;
  vergeben.add(k);
  return k;
}

function pruefeKarte(roh) {
  if (!Array.isArray(roh)) return { fehler: 'Die Karte muss eine Liste von Kategorien sein.' };
  if (roh.length === 0) return { fehler: 'Die Karte braucht mindestens eine Kategorie.' };
  if (roh.length > MAX_KATEGORIEN) {
    return { fehler: 'Mehr als ' + MAX_KATEGORIEN + ' Kategorien sind nicht vorgesehen.' };
  }

  const vergeben = new Set();
  const karte = [];

  for (const k of roh) {
    if (!k || typeof k !== 'object') return { fehler: 'Eine Kategorie ist unlesbar.' };

    const name = text(k.name, 60);
    if (!name) return { fehler: 'Jede Kategorie braucht einen Namen.' };

    if (!Array.isArray(k.items)) return { fehler: 'Kategorie "' + name + '" hat keine Gerichteliste.' };
    if (k.items.length > MAX_GERICHTE) {
      return { fehler: 'Kategorie "' + name + '" hat mehr als ' + MAX_GERICHTE + ' Einträge.' };
    }

    const vorhandene = text(k.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, '');
    let id;
    if (vorhandene && !vergeben.has(vorhandene)) {
      vergeben.add(vorhandene);
      id = vorhandene;
    } else {
      id = kennung(name, vergeben);
    }
    if (id === 'alle') id = kennung(name + '-kategorie', vergeben);

    const items = [];
    for (const g of k.items) {
      if (!g || typeof g !== 'object') return { fehler: 'Ein Eintrag in "' + name + '" ist unlesbar.' };
      const gName = text(g.name, 80);
      if (!gName) return { fehler: 'In "' + name + '" hat ein Eintrag keinen Namen.' };
      items.push({ name: gName, desc: text(g.desc, 200), price: text(g.price, 20) });
    }

    karte.push({ id: id, name: name, note: text(k.note, 200), items: items });
  }

  return { karte: karte };
}

/* ------------------------------------------------------------------ */

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);

  if (!env.ADMIN_PASSWORT) {
    console.error('ADMIN_PASSWORT fehlt — siehe ANLEITUNG.md, Schritt 10.');
    return json({ error: 'Der Admin-Bereich ist noch nicht eingerichtet.' }, 500);
  }

  let daten;
  try {
    daten = await request.json();
  } catch (e) {
    return json({ error: 'Anfrage konnte nicht gelesen werden.' }, 400);
  }

  const aktion = daten && daten.aktion;

  /* --- anmelden --------------------------------------------------- */
  if (aktion === 'login') {
    const ip = request.headers.get('CF-Connecting-IP');

    if (await zuVieleVersuche(env, ip)) {
      return json({ error: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' }, 429);
    }

    if (!gleich(String(daten.passwort || ''), env.ADMIN_PASSWORT)) {
      await merkeFehlversuch(env, ip);
      return json({ error: 'Falsches Passwort.' }, 401);
    }

    const token = await baueToken(env.ADMIN_PASSWORT);
    return json({ ok: true }, 200, { 'Set-Cookie': setzeCookie(token, SITZUNG_SEKUNDEN) });
  }

  /* --- abmelden --------------------------------------------------- */
  if (aktion === 'logout') {
    return json({ ok: true }, 200, { 'Set-Cookie': setzeCookie('', 0) });
  }

  /* Ab hier ist eine gültige Sitzung Pflicht. */
  const angemeldet = await tokenGueltig(leseCookie(request, COOKIE), env.ADMIN_PASSWORT);

  if (aktion === 'status') return json({ angemeldet: angemeldet }, 200);

  if (!angemeldet) return json({ error: 'Nicht angemeldet.' }, 401);

  /* --- speichern -------------------------------------------------- */
  if (aktion === 'speichern') {
    if (!env.KARTE) {
      console.error('KV-Binding KARTE fehlt — siehe ANLEITUNG.md, Schritt 9.');
      return json({ error: 'Der Speicher ist noch nicht eingerichtet.' }, 500);
    }

    const { fehler, karte } = pruefeKarte(daten.karte);
    if (fehler) return json({ error: fehler }, 400);

    await env.KARTE.put('speisekarte', JSON.stringify(karte));
    return json({ ok: true, karte: karte }, 200);
  }

  return json({ error: 'Unbekannte Aktion.' }, 400);
}
