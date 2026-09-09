/**
 * Hilfen für die Prüfungen: eine D1-Attrappe auf echtem SQLite und ein
 * einfacher Ersatz für Cloudflare KV.
 *
 * Echtes SQLite statt einer Nachbildung, damit auch die SQL-Anweisungen
 * wirklich geprüft werden und nicht nur der Code drumherum.
 */
import { DatabaseSync } from 'node:sqlite';

export function d1Attrappe() {
  const db = new DatabaseSync(':memory:');
  return {
    roh: db,
    async exec(sql) { db.exec(sql); },
    prepare(sql) {
      let werte = [];
      const api = {
        bind(...w) { werte = w; return api; },
        async first() { return db.prepare(sql).get(...werte) ?? null; },
        async all() { return { results: db.prepare(sql).all(...werte) }; },
        async run() {
          const r = db.prepare(sql).run(...werte);
          return { meta: { changes: Number(r.changes) } };
        }
      };
      return api;
    }
  };
}

export function kvAttrappe(start = {}) {
  const daten = new Map(Object.entries(start));
  return {
    daten,
    get: async (k) => (daten.has(k) ? daten.get(k) : null),
    put: async (k, v) => { daten.set(k, v); }
  };
}

export const KARTE_BEISPIEL = [
  { id: 'kaffee', name: 'Kaffee', note: '', items: [
    { name: 'Espresso', desc: '', price: '2,40' },
    { name: 'Cappuccino', desc: '', price: '3,60' },
    { name: 'Tageskaffee', desc: 'wechselnd', price: '' },       // ohne Preis
    { name: 'Cold Brew', desc: '', price: '4,50', out: true }    // heute aus
  ]},
  { id: 'bar', name: 'Bar', note: '', items: [
    { name: 'Gin Tonic', desc: '', price: '9,00' }
  ]}
];

/** Zählt Fehler über eine ganze Prüfdatei hinweg. */
export function pruefer() {
  let fehler = 0;
  const pruefe = (name, bedingung, zusatz = '') => {
    if (!bedingung) fehler++;
    console.log(`${bedingung ? 'OK  ' : 'FAIL'}  ${name}${zusatz ? '  — ' + zusatz : ''}`);
  };
  const ende = () => {
    console.log(fehler ? `\n${fehler} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
    process.exit(fehler ? 1 : 0);
  };
  return { pruefe, ende };
}
