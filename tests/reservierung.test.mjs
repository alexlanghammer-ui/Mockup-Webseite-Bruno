import { onRequest } from '../functions/api/reservierung.js';

const gueltig = {
  date: '2099-08-15', time: '19:30', guests: 2, name: 'Alex Langhammer',
  email: 'gast@example.com', phone: '0170 1234567', occasion: 'Geburtstag',
  notes: 'Bitte am Fenster', area: 'Draußen'
};

let gesendet = null;
const env = { SEND_EMAIL: { send: async (m) => { gesendet = m; } } };

async function ruf(body, method = 'POST') {
  gesendet = null;
  const request = new Request('https://beispiel.de/api/reservierung', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
  const res = await onRequest({ request, env });
  return { status: res.status, body: await res.json() };
}

const faelle = [
  ['gültige Anfrage',          gueltig,                                      200],
  ['GET statt POST',           null,                                         405],
  ['Name fehlt',               { ...gueltig, name: '' },                     400],
  ['E-Mail kaputt',            { ...gueltig, email: 'keine-mail' },          400],
  ['Datum fehlt',              { ...gueltig, date: '' },                     400],
  ['Datum in Vergangenheit',   { ...gueltig, date: '2020-01-01' },           400],
  ['Uhrzeit unsinnig',         { ...gueltig, time: 'abends' },               400],
  ['zu viele Gäste',           { ...gueltig, guests: 99 },                   400],
  ['Gäste keine Zahl',         { ...gueltig, guests: 'viele' },              400],
  ['unbekannter Bereich',      { ...gueltig, area: 'Dach' },                 200],
  ['Honeypot ausgefüllt',      { ...gueltig, website: 'spam.ru' },           200]
];

let fehler = 0;
for (const [name, body, erwartet] of faelle) {
  const method = body === null ? 'GET' : 'POST';
  const { status, body: out } = await ruf(body, method);
  const ok = status === erwartet;
  if (!ok) fehler++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(24)} ${status}  ${out.error || ''}`);
}

// Honeypot darf keine Mail auslösen
await ruf({ ...gueltig, website: 'spam.ru' });
console.log(`${gesendet === null ? 'OK  ' : 'FAIL'}  Honeypot verschickt keine Mail`);
if (gesendet !== null) fehler++;

// Unbekannter Bereich wird auf "Egal" korrigiert
await ruf({ ...gueltig, area: 'Dach' });
console.log(`${/Bereich:   Egal/.test(gesendet.text) ? 'OK  ' : 'FAIL'}  Bereich fällt auf "Egal" zurück`);

// Header-Injection: Zeilenumbrüche dürfen nicht in Betreff/Reply-To landen
await ruf({ ...gueltig, name: 'Böse\nBcc: opfer@example.com', email: 'a@b.de' });
const sauber = !/[\r\n]/.test(gesendet.subject) && !/[\r\n]/.test(gesendet.replyTo);
console.log(`${sauber ? 'OK  ' : 'FAIL'}  Keine Zeilenumbrüche in Betreff/Reply-To`);
if (!sauber) fehler++;

// Fehlendes Binding meldet sich sauber statt zu crashen
const request = new Request('https://beispiel.de/api/reservierung', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gueltig)
});
const ohne = await onRequest({ request, env: {} });
console.log(`${ohne.status === 500 ? 'OK  ' : 'FAIL'}  Fehlendes Binding -> 500 statt Absturz`);

// Kaputtes JSON
const req2 = new Request('https://beispiel.de/api/reservierung', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{kaputt'
});
const j = await onRequest({ request: req2, env });
console.log(`${j.status === 400 ? 'OK  ' : 'FAIL'}  Kaputtes JSON -> 400`);

console.log('\n--- Beispielmail ---');
await ruf(gueltig);
console.log('An:      ', gesendet.to);
console.log('Von:     ', gesendet.from);
console.log('Reply-To:', gesendet.replyTo);
console.log('Betreff: ', gesendet.subject);
console.log(gesendet.text);

process.exit(fehler ? 1 : 0);
