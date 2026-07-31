# Bruno Café & Bar — Mockup-Webseite

Statische Mockup-Webseite für *Bruno Café & Bar* (Tübinger Straße, Stuttgart).
Sechs Seiten — Start, Speisekarte, Öffnungszeiten, Anfahrt, Kontakt und
Reservierung — als Single-Page-App mit clientseitigem Routing.

Die Seite läuft komplett offline: Schriften, Bilder und JavaScript-Bibliotheken
liegen im Repo, es gibt **keine** Requests an CDNs oder Google Fonts.

Gehostet auf Cloudflare Pages: ein Push auf `main` veröffentlicht die Seite
automatisch neu. **Wie alles eingerichtet wird, steht Schritt für Schritt in
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
```

## Aufbau

```
public/                        alles, was veröffentlicht wird
  index.html                   die Seite selbst (Markup, Styles, Logik)
  admin.html                   Speisekarten-Editor, passwortgeschützt
  impressum.html               Pflichtseite, Platzhalter noch auszufüllen
  datenschutz.html             Pflichtseite, Platzhalter noch auszufüllen
  assets/
    fonts/                     Instrument Serif + Outfit als woff2
    img/logo-light.png         Logo für das helle Theme
    img/logo-dark.png          Logo für das dunkle Theme
    rechtstexte.css            Gestaltung von Editor und Pflichtseiten
    speisekarte-standard.json  Startkarte für den Editor
    vendor/dc-runtime.js       Template-Runtime (siehe unten)
    vendor/image-slot.js       <image-slot>-Komponente
    vendor/react*.js           React 18.3.1 (UMD)
functions/api/
  reservierung.js              nimmt das Formular entgegen, verschickt die Mail
  karte.js                     liefert die gespeicherte Speisekarte aus
  admin.js                     Anmeldung, Sitzung und Speichern der Karte
tests/                         Prüfungen für Formular und Admin-Bereich
original/                      die ursprüngliche gebündelte Einzeldatei
```

Es gibt bewusst **keine** `wrangler.toml`: Sobald diese Datei existiert, zieht
Cloudflare sie den Einstellungen im Dashboard vor und verlangt, dass ihr
`name` exakt dem Projektnamen entspricht — passt er nicht, schlägt jeder Build
fehl. Alle Einstellungen stehen deshalb im Dashboard.

Alles außerhalb von `public/` geht nicht online — README, Tests und das alte
Bundle sind auf der Domain nicht abrufbar.

`public/index.html` ist in vier Blöcke gegliedert:

| Zeilen    | Inhalt                                                       |
| --------- | ------------------------------------------------------------ |
| 1 – 11    | `<head>` samt Pfaden zu den lokalen React-Kopien             |
| 17 – 125  | `@font-face`-Regeln                                          |
| 126 – 156 | Farb-Variablen für helles/dunkles Theme, Keyframes           |
| 159 – 543 | das Markup aller sechs Seiten                                |
| 545 – 878 | die Logik: Daten, Routing, Theme-Wechsel, Reservierungsformular |

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
| Öffnungszeiten              | `const HOURS` (ab Zeile 546)                      |
| Sitzbereiche der Reservierung | `const AREAS` (Zeile 559)                       |
| Telefon, E-Mail, Adresse    | Kontakt- und Anfahrt-Markup                       |
| Farben                      | die CSS-Variablen ab Zeile 126                    |
| Logo                        | `assets/img/logo-light.png` / `logo-dark.png`     |
| Empfänger der Formularmails | `functions/api/reservierung.js`, ganz oben        |

## Der Admin-Bereich

Unter `/admin.html` liegt ein passwortgeschützter Editor für die Speisekarte:
Kategorien und Gerichte anlegen, umbenennen, verschieben, löschen. Gespeichert
wird in Cloudflare KV, die Änderung ist sofort auf der Webseite sichtbar — ohne
Push, ohne Deploy.

Das Passwort steht in der Umgebungsvariable `ADMIN_PASSWORT` und niemals im
Code. Die Sitzung ist ein mit dem Passwort signiertes HttpOnly-Cookie, gültig
für acht Stunden; ein Passwortwechsel beendet alle offenen Sitzungen sofort.
Nach acht Fehlversuchen wird die IP-Adresse für 15 Minuten gesperrt.

`public/index.html` enthält in `const MENU` weiterhin eine fest eingebaute
Karte. Sie wird immer dann angezeigt, wenn im Admin-Bereich noch nichts
gespeichert wurde oder die API nicht erreichbar ist — die Seite zeigt also nie
eine leere Speisekarte. `assets/speisekarte-standard.json` ist dieselbe Karte
als JSON und dient dem Editor als Startpunkt.

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

Telefonnummer, Adresse, Öffnungszeiten und Preise stammen aus dem Mockup und
sind erfunden.

In der Browser-Konsole erscheint beim Laden ein 404 für
`.image-slots.state.json`. Diese Datei gehört zum Autorenmodus von
`<image-slot>` und wird im Betrieb nicht gebraucht.
