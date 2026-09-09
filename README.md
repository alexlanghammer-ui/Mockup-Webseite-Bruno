# Webseiten-Vorlage für Cafés und Bars

Vorzeigefertige Vorlage ohne Markenbezug. Sechs Seiten — Start, Speisekarte,
Öffnungszeiten, Anfahrt, Kontakt und Reservierung — als Single-Page-App mit
clientseitigem Routing, in drei Sprachen, mit Reservierungsformular und einem
passwortgeschützten Editor für die Speisekarte.

Sie läuft mit Platzhaltern („Musterlokal", „Musterstraße 12") und lässt sich
für einen konkreten Kunden in einer halben Stunde umbauen — siehe
[Für einen Kunden anpassen](#für-einen-kunden-anpassen).

Die Seite läuft komplett offline: Schriften und JavaScript-Bibliotheken liegen
im Repo, es gibt **keine** Requests an CDNs oder Google Fonts. Das erspart dem
Kunden das Cookie-Banner.

Gehostet auf Cloudflare Pages: ein Push auf den Produktions-Branch
veröffentlicht die Seite automatisch neu. **Wie alles eingerichtet wird, steht Schritt für Schritt in
[ANLEITUNG.md](ANLEITUNG.md).**

## Lokal ansehen

Ein statischer Webserver genügt:

```bash
cd public
python3 -m http.server 8000
# danach http://localhost:8000 im Browser öffnen
```

Reservierungsformular und Admin-Bereich brauchen die Cloudflare-Endpunkte und
funktionieren so nicht. Ihre Logik lässt sich trotzdem prüfen:

```bash
node tests/reservierung.test.mjs
node tests/admin.test.mjs
node tests/bestellung.test.mjs
```

## Aufbau

```
public/                        alles, was veröffentlicht wird
  index.html                   die Seite selbst (Markup, Styles, Logik)
  admin.html                   Speisekarten-Editor, passwortgeschützt
  bestellen.html               Bestellseite für den Gast (QR-Ziel)
  tresen.html                  Live-Display für die Bedienung
  tische.html                  druckbare QR-Codes je Tisch
  impressum.html               Pflichtseite, Platzhalter noch auszufüllen
  datenschutz.html             Pflichtseite, Platzhalter noch auszufüllen
  assets/
    fonts/                     Instrument Serif + Outfit als woff2
    rechtstexte.css            Gestaltung von Editor und Pflichtseiten
    speisekarte-standard.json  Startkarte für den Editor
    vendor/dc-runtime.js       Template-Runtime (siehe unten)
    vendor/image-slot.js       <image-slot>-Komponente
    vendor/react*.js           React 18.3.1 (UMD)
    vendor/qrcode.js           QR-Erzeugung (MIT)
functions/api/
  reservierung.js              nimmt das Formular entgegen, verschickt die Mail
  karte.js                     liefert die gespeicherte Speisekarte aus
  admin.js                     Anmeldung, Sitzung und Speichern der Karte
  bestellung.js                nimmt Bestellungen vom Tisch entgegen
  tresen.js                    Bestellliste und Status für die Bedienung
lib/                           von den Functions gemeinsam genutzter Code
tests/                         Prüfungen für Formular, Admin und Bestellungen
original/                      die ursprüngliche gebündelte Einzeldatei
```

Es gibt bewusst **keine** `wrangler.toml`: Sobald diese Datei existiert, zieht
Cloudflare sie den Einstellungen im Dashboard vor und verlangt, dass ihr
`name` exakt dem Projektnamen entspricht — passt er nicht, schlägt jeder Build
fehl. Alle Einstellungen stehen deshalb im Dashboard.

Alles außerhalb von `public/` geht nicht online — README, Tests und das alte
Bundle sind auf der Domain nicht abrufbar.

`public/index.html` ist in sieben Blöcke gegliedert:

| Zeilen    | Inhalt                                                       |
| --------- | ------------------------------------------------------------ |
| 1 – 11      | `<head>` samt Pfaden zu den lokalen React-Kopien             |
| 17 – 125    | `@font-face`-Regeln                                         |
| 126 – 169   | Farb-Variablen, Keyframes, Handy-Regeln                     |
| 172 – 565   | das Markup aller sechs Seiten                               |
| 574 – 867   | `TEXTE`: alle Texte in drei Sprachen                        |
| 869 – 879   | `LOKAL`: Name, Adresse und Kontakt des Betriebs             |
| 881 – 1318  | die Logik: Daten, Routing, Sprache, Theme, Formular         |

## Wie das Templating funktioniert

Das Markup steht in `<x-dc>`, die Logik in `<script type="text/x-dc">` als
Klasse `Component`. `assets/vendor/dc-runtime.js` verbindet beides:

- `{{ name }}` fügt einen Wert aus `renderVals()` ein — als Text, Style oder
  Event-Handler.
- `<sc-if value="{{ flag }}">` blendet einen Block abhängig von `flag` ein.
- `<sc-for ...>` wiederholt einen Block für jeden Eintrag einer Liste.
- `sc-camel-on-click` ist die Schreibweise für `onClick`; die Runtime setzt
  solche `sc-camel-*`-Attribute zurück in camelCase (`sc-camel-view-box` →
  `viewBox`).

`renderVals()` am Ende der Datei stellt alle Werte zusammen, die das Markup
verwendet — der beste Startpunkt, um zu verstehen, woher eine Anzeige kommt.

## Häufige Anpassungen

| Was                         | Wo                                                |
| --------------------------- | ------------------------------------------------- |
| Speisekarte, Preise         | im Admin-Bereich unter `/admin.html`              |
| Öffnungszeiten              | `const HOURS` (ab Zeile 881)                      |
| Sitzbereiche der Reservierung | `const AREAS` (Zeile 897)                     |
| Texte der Seite             | `const TEXTE` (ab Zeile 574)                      |
| Farben                      | die CSS-Variablen ab Zeile 126                    |
| Name, Adresse, Kontakt      | `const LOKAL`, ganz oben in der Logik             |
| Logo                        | `LOKAL.logo` auf einen Bildpfad setzen            |
| Empfänger der Formularmails | `functions/api/reservierung.js`, ganz oben        |

## Für einen Kunden anpassen

Die Vorlage ist so gebaut, dass für einen konkreten Betrieb nur wenige Stellen
angefasst werden müssen.

**1. Angaben des Lokals** — `const LOKAL` ganz oben in der Logik von
`public/index.html`:

```js
const LOKAL = {
  name: 'Musterlokal',          // erscheint als Schriftzug im Kopf
  logo: null,                   // Pfad zu einer Bilddatei, sonst null
  strasse: 'Musterstraße 12',
  ort: '70000 Musterstadt',
  telefon: '0000 / 000 00 00',
  telefonLink: '+490000000000', // für den Anruf-Link, ohne Leerzeichen
  email: 'hallo@musterlokal.de'
};
```

Damit sind Kopf, Anfahrt, Kontakt, Fußzeile und die Bestätigung nach dem
Absenden erledigt.

**2. Empfänger der Formularmails** — oben in
`functions/api/reservierung.js`.

**3. Öffnungszeiten** — `const HOURS`, sieben Zeilen von Montag bis Sonntag.

**4. Speisekarte** — im Admin-Bereich unter `/admin.html`, oder für den
Startzustand `public/assets/speisekarte-standard.json`.

**5. Texte** — `const TEXTE`. Die Beschreibungen des Lokals („Was uns
ausmacht", die drei Tageszeiten) sind allgemein gehalten und funktionieren für
die meisten Betriebe unverändert. Was betriebsspezifisch ist, sollte angepasst
werden — jeweils in allen drei Sprachen.

**6. Fotos** — die beiden Bildflächen auf Startseite und Anfahrt sind
`<image-slot>`-Platzhalter und lassen sich direkt im Browser befüllen.

**7. Farben** — die CSS-Variablen. Für einen anderen Betrieb lohnt es sich,
mindestens `--rose` und `--green` zu variieren, damit nicht zwei Kunden
dieselbe Seite bekommen.

**8. Impressum und Datenschutz** — die farbig markierten Lücken in
`public/impressum.html` und `public/datenschutz.html` füllen. Ohne das sollte
keine Seite online gehen.

## Sprachen

Die Seite gibt es auf **Deutsch, Englisch und Französisch**. Umgeschaltet wird
über die Schalter `DE EN FR` unter der Navigation.

Beim ersten Besuch wählt die Seite die Sprache selbst: zuerst nach einer früher
getroffenen Wahl, sonst nach der Browsersprache, sonst Deutsch. Die Wahl bleibt
im Browser gespeichert. Passend dazu wird `<html lang>` gesetzt — wichtig für
Vorlesewerkzeuge und Suchmaschinen.

Alle Texte stehen in **einem** Objekt `TEXTE` in `public/index.html`, direkt
über `const HOURS`, mit je einem Block pro Sprache und identischen Schlüsseln.
Im Markup steht dafür `{{ t.schluessel }}`. Einen Text ändern heißt also: die
Stelle in `TEXTE` suchen und in allen drei Sprachen anpassen.

Zwei Dinge werden bewusst **nicht** übersetzt:

- **Die Speisekarte.** Sie wird im Admin-Bereich gepflegt und erscheint in der
  Sprache, in der sie dort eingetragen wurde. Kategorien wie „Frühstück"
  bleiben also auch auf der englischen Seite deutsch.
- **Impressum und Datenschutzerklärung.** Allein die deutsche Fassung ist
  rechtlich verbindlich. Auf beiden Seiten steht ein dreisprachiger Hinweis
  darauf.

Die Sitzbereiche der Reservierung werden zwar übersetzt angezeigt, aber immer
auf Deutsch gespeichert und verschickt — im Postfach steht also verlässlich
„Draußen", egal in welcher Sprache der Gast gebucht hat.

## Der Admin-Bereich

Unter `/admin` liegt ein passwortgeschützter Editor für die Speisekarte:
Kategorien und Gerichte anlegen, umbenennen, verschieben, löschen, Preise
ändern. Gespeichert wird in Cloudflare KV, die Änderung ist sofort auf der
Webseite sichtbar — ohne Push, ohne Deploy.

Je Eintrag gibt es zwei Häkchen:

- **Heute aus** — der Artikel bleibt auf der Karte, wird ausgegraut und ist
  nicht bestellbar. Die häufigste Änderung im Alltag.
- **Empfehlung** — der Artikel wird Gästen im Warenkorb vorgeschlagen, sobald
  etwas drin liegt. Höchstens drei insgesamt, sonst lehnt der Server das
  Speichern ab: mehr wäre keine Empfehlung mehr, sondern eine zweite
  Speisekarte.

Das Passwort steht in der Umgebungsvariable `ADMIN_PASSWORT` und niemals im
Code. Die Sitzung ist ein mit dem Passwort signiertes HttpOnly-Cookie, gültig
für acht Stunden; ein Passwortwechsel beendet alle offenen Sitzungen sofort.
Nach acht Fehlversuchen wird die IP-Adresse für 15 Minuten gesperrt.

`public/index.html` enthält in `const MENU` weiterhin eine fest eingebaute
Karte. Sie wird immer dann angezeigt, wenn im Admin-Bereich noch nichts
gespeichert wurde oder die API nicht erreichbar ist — die Seite zeigt also nie
eine leere Speisekarte. `assets/speisekarte-standard.json` ist dieselbe Karte
als JSON und dient dem Editor als Startpunkt.

## Bestellen am Tisch

Optionaler Teil: Gäste scannen einen QR-Code am Tisch, wählen aus und die
Bedienung sieht die Bestellung auf einem Display.

| Seite | Wofür |
| --- | --- |
| `/tische` | druckbare Aufsteller mit QR-Code je Tisch |
| `/bestellen?tisch=7` | was der Gast nach dem Scannen sieht |
| `/tresen` | Display für die Bedienung, passwortgeschützt |

**Bezahlt wird bewusst nicht über das System.** Sobald ein System Geld
einnimmt, ist es eine Kasse im Sinne der Kassensicherungsverordnung und
braucht eine zertifizierte TSE. So bleibt die vorhandene Kasse des Betriebs
die Kasse, und an der Fiskalisierung ändert sich nichts.

Die Bestellungen liegen in **Cloudflare D1** statt in KV: Bei einer
Bestellliste zählen Sekunden, und KV ist nur „eventually consistent". Die
Tabelle legt das System beim ersten Aufruf selbst an.

Preise werden **serverseitig** aus der gespeicherten Speisekarte geholt — was
der Gast mitschickt, wird ignoriert. Artikel ohne Preis und als „heute aus"
markierte sind nicht bestellbar.

Gegen Missbrauch, von wirksam nach ergänzend:

- **Geheimcode je Tisch.** Der QR enthält `?tisch=7&code=…`, abgeleitet per HMAC
  aus einem Geheimnis, das beim ersten Gebrauch erzeugt und in KV abgelegt
  wird. Ohne gültigen Code nimmt der Server nichts an — Tischnummern
  durchprobieren geht damit nicht. Deshalb ist `/tische` passwortgeschützt.
- **Turnstile**, wenn `TURNSTILE_SITEKEY` und `TURNSTILE_SECRET` gesetzt sind.
  Sonst abgeschaltet, und die Seite lädt nichts von fremden Servern.
- **12 Bestellungen pro Stunde und Absender.** Gespeichert wird ein HMAC der
  IP-Adresse, nie die Adresse selbst.
- 10 Artikel und 100 € je Bestellung, 3 gleichzeitig offene je Tisch.
- Die Bedienung bestätigt jede Bestellung, und das Bestellen lässt sich am
  Tresen sperren.

Was bleibt: Wer den Aufsteller einmal gesehen hat, kann später von außerhalb
bestellen. Dagegen hilft nur, die Karte für diesen Tisch neu zu drucken — der
Code ändert sich damit. Die Bedienung merkt es ohnehin beim Hinbringen.


## Theme

Das Theme wechselt automatisch nach Tageszeit (hell am Tag, dunkel abends) und
lässt sich über den Schalter in der Navigation überschreiben; die Sonnenauf-
und -untergangszeiten dafür stehen in `SUNRISE` und `SUNSET`.

## Das Reservierungsformular

Das Formular schickt seine Eingaben an `/api/reservierung`. Dahinter steht
`functions/api/reservierung.js` — eine Cloudflare Pages Function, die die
Angaben prüft und als Mail an das Postfach des Cafés weiterreicht. Geprüft
werden Pflichtfelder, das Format von E-Mail, Datum und Uhrzeit, ob das Datum
in der Zukunft liegt und die Personenzahl. Ein unsichtbares Feld im Formular
fängt einen Teil der Spam-Bots ab.

Der Gast bekommt **keine** automatische Bestätigungsmail — das ginge nur mit
dem kostenpflichtigen Workers-Plan. Die Seite sagt das auch so: „Wir bestätigen
kurz per Mail."

Vor dem Livegang muss der Mailversand einmalig eingerichtet werden, siehe
[ANLEITUNG.md](ANLEITUNG.md), Schritt 6.

## Hinweise

Impressum und Datenschutzerklärung sind vorbereitet, aber **noch nicht
ausgefüllt**. Die offenen Stellen sind auf den Seiten farbig markiert. Ohne
korrektes Impressum sollte die Seite nicht öffentlich gehen.

Name, Adresse, Telefonnummer, Öffnungszeiten und Preise sind Platzhalter.

Für eine reine Vorführ-Version, die nicht bei Google landen soll, gehört
`<meta name="robots" content="noindex">` in den `<head>` von
`public/index.html` — und muss vor dem echten Livegang wieder raus.

In der Browser-Konsole erscheint beim Laden ein 404 für
`.image-slots.state.json`. Diese Datei gehört zum Autorenmodus von
`<image-slot>` und wird im Betrieb nicht gebraucht.
