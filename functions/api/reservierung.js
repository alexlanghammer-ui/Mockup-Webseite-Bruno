/**
 * POST /api/reservierung
 *
 * Nimmt eine Reservierungsanfrage vom Formular entgegen, prüft sie und
 * schickt sie als Mail an das Postfach des Cafés.
 *
 * Läuft als Cloudflare Pages Function — die Datei muss nicht gebaut oder
 * installiert werden, Cloudflare macht daraus beim Deploy automatisch einen
 * Endpunkt unter /api/reservierung.
 *
 * Der Mailversand braucht das SEND_EMAIL-Binding. Wie das eingerichtet wird,
 * steht in ANLEITUNG.md, Schritt 6.
 */

const EMPFAENGER = 'hallo@bruno-stuttgart.de';
const ABSENDER = 'webseite@bruno-stuttgart.de';

const BEREICHE = ['Drinnen', 'Draußen', 'Theke', 'Egal'];
const MAX_LAENGE = 1000;
const MAX_GAESTE = 20;

/** Antwort als JSON, damit das Formular sie auswerten kann. */
const json = (daten, status) =>
  new Response(JSON.stringify(daten), {
    status: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });

/**
 * Kürzt einen Wert und entfernt Zeilenumbrüche. Wichtig: Name und E-Mail
 * landen im Betreff und im Reply-To der Mail — ohne diese Bereinigung könnte
 * jemand über ein \n eigene Mail-Header einschleusen.
 */
function text(wert) {
  if (typeof wert !== 'string') return '';
  return wert.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_LAENGE);
}

/** Bewusst großzügig — strengere Regeln lehnen echte Adressen ab. */
const istEmail = (wert) => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(wert);

const istDatum = (wert) => /^\d{4}-\d{2}-\d{2}$/.test(wert);
const istUhrzeit = (wert) => /^\d{2}:\d{2}$/.test(wert);

/** Heute in Berliner Zeit als YYYY-MM-DD — Cloudflare-Server laufen auf UTC. */
function heute() {
  const jetzt = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  return jetzt;
}

function pruefe(d) {
  const r = {
    date: text(d.date),
    time: text(d.time),
    guests: parseInt(d.guests, 10),
    name: text(d.name),
    email: text(d.email),
    phone: text(d.phone),
    occasion: text(d.occasion),
    notes: text(d.notes),
    area: text(d.area)
  };

  if (!r.name) return { fehler: 'Bitte gib deinen Namen an.' };
  if (!istEmail(r.email)) return { fehler: 'Die E-Mail-Adresse sieht nicht richtig aus.' };
  if (!istDatum(r.date)) return { fehler: 'Bitte wähle ein Datum.' };
  if (!istUhrzeit(r.time)) return { fehler: 'Bitte wähle eine Uhrzeit.' };
  if (r.date < heute()) return { fehler: 'Das Datum liegt in der Vergangenheit.' };
  if (!(r.guests >= 1)) return { fehler: 'Bitte gib an, wie viele Personen kommen.' };
  if (r.guests > MAX_GAESTE) {
    return { fehler: 'Für mehr als ' + MAX_GAESTE + ' Personen ruf uns bitte direkt an.' };
  }
  if (BEREICHE.indexOf(r.area) === -1) r.area = 'Egal';

  return { daten: r };
}

function alsMail(r) {
  const zeilen = [
    'Neue Reservierungsanfrage über die Webseite',
    '',
    'Datum:     ' + r.date.split('-').reverse().join('.'),
    'Uhrzeit:   ' + r.time + ' Uhr',
    'Personen:  ' + r.guests,
    'Bereich:   ' + r.area,
    '',
    'Name:      ' + r.name,
    'E-Mail:    ' + r.email,
    'Telefon:   ' + (r.phone || '—'),
    'Anlass:    ' + (r.occasion || '—'),
    '',
    'Anmerkungen:',
    r.notes || '—',
    '',
    '— Diese Mail wurde automatisch vom Reservierungsformular erzeugt.',
    'Zum Antworten einfach auf diese Mail antworten, das geht direkt an den Gast.'
  ];
  return zeilen.join('\n');
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);

  let daten;
  try {
    daten = await request.json();
  } catch (e) {
    return json({ error: 'Anfrage konnte nicht gelesen werden.' }, 400);
  }

  // Honeypot: ein im Formular unsichtbares Feld. Menschen lassen es leer,
  // viele Spam-Bots füllen es aus. Wir tun so, als sei alles gut.
  if (text(daten.website)) return json({ ok: true }, 200);

  const { fehler, daten: r } = pruefe(daten || {});
  if (fehler) return json({ error: fehler }, 400);

  if (!env.SEND_EMAIL) {
    console.error('SEND_EMAIL-Binding fehlt — siehe ANLEITUNG.md, Schritt 6.');
    return json({ error: 'Der Mailversand ist noch nicht eingerichtet.' }, 500);
  }

  // ---------------------------------------------------------------------
  // EINZIGE STELLE, DIE GEGEN DIE CLOUDFLARE-DOKU ZU PRÜFEN IST.
  // Beim Schreiben war developers.cloudflare.com nicht erreichbar, die
  // Signatur stammt aus Sekundärquellen. Verlangt Cloudflare eine andere
  // Schreibweise, ist nur dieser Aufruf anzupassen — alles darüber ist
  // getestet (tests/reservierung.test.mjs).
  // ---------------------------------------------------------------------
  try {
    await env.SEND_EMAIL.send({
      to: EMPFAENGER,
      from: ABSENDER,
      replyTo: r.email,
      subject: 'Reservierung: ' + r.name + ' am ' + r.date.split('-').reverse().join('.') +
               ' um ' + r.time + ' (' + r.guests + ' Pers.)',
      text: alsMail(r)
    });
  } catch (e) {
    console.error('Mailversand fehlgeschlagen:', e && e.message);
    return json({ error: 'Die Anfrage konnte gerade nicht verschickt werden.' }, 502);
  }

  return json({ ok: true }, 200);
}
