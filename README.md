# Bruno Café & Bar — Mockup-Webseite

Statische Mockup-Webseite für *Bruno Café & Bar* (Tübinger Straße, Stuttgart).
Sechs Seiten — Start, Speisekarte, Öffnungszeiten, Anfahrt, Kontakt und
Reservierung — als Single-Page-App mit clientseitigem Routing.

Die Seite läuft komplett offline: Schriften, Bilder und JavaScript-Bibliotheken
liegen im Repo, es gibt **keine** Requests an CDNs oder Google Fonts.

## Lokal ansehen

Ein statischer Webserver genügt:

```bash
python3 -m http.server 8000
# danach http://localhost:8000 im Browser öffnen
```

## Aufbau

```
index.html                  die komplette Seite (Markup, Styles, Logik)
assets/
  fonts/                    Instrument Serif + Outfit als woff2
  img/logo-light.png        Logo für das helle Theme
  img/logo-dark.png         Logo für das dunkle Theme
  vendor/dc-runtime.js      Template-Runtime (siehe unten)
  vendor/image-slot.js      <image-slot>-Komponente
  vendor/react*.js          React 18.3.1 (UMD)
original/                   die ursprüngliche gebündelte Einzeldatei
```

`index.html` ist in vier Blöcke gegliedert:

| Zeilen    | Inhalt                                                       |
| --------- | ------------------------------------------------------------ |
| 1 – 13    | `<head>` samt Pfaden zu den lokalen React-Kopien             |
| 17 – 125  | `@font-face`-Regeln                                          |
| 126 – 156 | Farb-Variablen für helles/dunkles Theme, Keyframes           |
| 159 – 538 | das Markup aller sechs Seiten                                |
| 540 – 844 | die Logik: Daten, Routing, Theme-Wechsel, Reservierungsformular |

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
| Speisekarte, Preise         | `const MENU` (ab Zeile 556)                       |
| Öffnungszeiten              | `const HOURS` (ab Zeile 541)                      |
| Sitzbereiche der Reservierung | `const AREAS` (Zeile 554)                       |
| Telefon, E-Mail, Adresse    | Kontakt- und Anfahrt-Markup                       |
| Farben                      | die CSS-Variablen ab Zeile 126                    |
| Logo                        | `assets/img/logo-light.png` / `logo-dark.png`     |

Das Theme wechselt automatisch nach Tageszeit (hell am Tag, dunkel abends) und
lässt sich über den Schalter in der Navigation überschreiben; die Sonnenauf-
und -untergangszeiten dafür stehen in `SUNRISE` und `SUNSET`.

## Hinweise

Das Reservierungsformular ist ein Mockup — es validiert die Eingaben und zeigt
eine Bestätigung an, verschickt aber nichts. Für echte Reservierungen muss ein
Backend oder ein Formulardienst angebunden werden.

In der Browser-Konsole erscheint beim Laden ein 404 für
`.image-slots.state.json`. Diese Datei gehört zum Autorenmodus von
`<image-slot>` und wird im Betrieb nicht gebraucht.
