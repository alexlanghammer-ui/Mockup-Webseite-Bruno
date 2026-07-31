# Von hier zur fertigen Webseite

Diese Anleitung führt dich einmal durch alles. Du brauchst kein Vorwissen, aber
etwa eine Stunde Zeit. Am Ende gilt: **du änderst etwas, pushst es zu GitHub,
und die Seite aktualisiert sich von selbst.**

Arbeite die Schritte der Reihe nach ab. Wenn etwas hakt, steht unten unter
[Wenn etwas nicht klappt](#wenn-etwas-nicht-klappt) das Übliche.

---

## Schritt 1 — Domain besorgen

Du brauchst eine eigene Adresse, zum Beispiel `bruno-stuttgart.de`.

Am einfachsten registrierst du sie direkt bei Cloudflare (Dashboard →
*Domain Registration* → *Register Domain*). Cloudflare verkauft Domains zum
Einkaufspreis, eine `.de` kostet dort ungefähr 10 € im Jahr. Der Vorteil: du
sparst dir den Umzug im nächsten Schritt.

Hast du die Domain schon woanders, geht das auch — dann musst du sie bei
Cloudflare hinzufügen und beim alten Anbieter die Nameserver umstellen.
Cloudflare führt dich durch das Formular.

> Die Domain ist der einzige Posten, der wirklich Geld kostet. Hosting,
> Zertifikat und Mailversand sind in dem Umfang, den diese Seite braucht,
> kostenlos.

---

## Schritt 2 — Cloudflare-Konto anlegen

Auf [dash.cloudflare.com](https://dash.cloudflare.com) registrieren. Kostenlos,
keine Kreditkarte nötig.

---

## Schritt 3 — Die Seite mit GitHub verbinden

Das ist der Schritt, der dir das automatische Veröffentlichen bringt.

1. Im Dashboard links auf **Workers & Pages** → **Create** → Reiter **Pages**
   → **Connect to Git**.
2. GitHub verbinden und dieses Repository auswählen
   (`alexlanghammer-ui/Mockup-Webseite-Bruno`).
3. Bei den Build-Einstellungen:

   | Feld | Wert |
   | --- | --- |
   | Framework preset | *None* |
   | Build command | **leer lassen** |
   | Build output directory | `public` |
   | Production branch | den Branch nehmen, den Cloudflare vorschlägt |

   Zum Production branch: Cloudflare trägt hier den Standard-Branch des
   Repositories ein. Bei diesem Projekt ist das
   `claude/neue-webseite-github-kqoq54` — es gibt **keinen** Branch namens
   `main`. Trag nichts von Hand ein, was in der Liste nicht auftaucht, sonst
   findet Cloudflare nichts zum Veröffentlichen.

   Das Feld **Build output directory** ist das wichtigste: Steht dort nicht
   `public`, sucht Cloudflare die Startseite im Hauptverzeichnis und findet
   keine — die Adresse zeigt dann einen Fehler statt der Webseite.

4. **Save and Deploy** klicken.

Nach etwa einer Minute ist die Seite unter einer Adresse wie
`bruno-cafe-bar.pages.dev` erreichbar. Ruf sie auf und klick dich durch — alles
außer dem Reservierungsformular funktioniert jetzt schon.

---

## Schritt 4 — Eigene Domain verbinden

Im Pages-Projekt → **Custom domains** → **Set up a custom domain** →
`bruno-stuttgart.de` eintragen.

Wenn die Domain bei Cloudflare liegt, ist das ein Klick. Das Schloss-Symbol
(HTTPS) richtet Cloudflare automatisch ein, meist innerhalb weniger Minuten.

---

## Schritt 5 — Postfach einrichten

Damit `hallo@bruno-stuttgart.de` bei dir ankommt:

1. Dashboard → deine Domain → **Email** → **Email Routing** → aktivieren.
2. Unter **Destination addresses** deine private Adresse eintragen
   (zum Beispiel deine Gmail-Adresse). Du bekommst eine Bestätigungsmail —
   **diesen Link musst du anklicken**, sonst gilt die Adresse als unbestätigt
   und Schritt 6 funktioniert nicht.
3. Unter **Routes** eine Weiterleitung anlegen:
   `hallo@bruno-stuttgart.de` → deine bestätigte Adresse.

Ab jetzt landet alles an `hallo@bruno-stuttgart.de` in deinem normalen
Posteingang.

> **Zur Erinnerung:** Cloudflare leitet Mails nur weiter. Du kannst aus deinem
> Mailprogramm heraus nicht ohne Weiteres *als* `hallo@bruno-stuttgart.de`
> antworten. Für den Anfang reicht das meist. Wenn du es später brauchst, ist
> ein Postfach bei einem klassischen Hoster (~5 €/Monat) die einfachste Lösung.

---

## Schritt 6 — Mailversand für das Formular freischalten

Damit das Reservierungsformular dir die Anfragen schicken kann:

1. Dashboard → **Workers & Pages** → dein Projekt → **Settings** →
   **Functions** → **Bindings** → **Add binding**.
2. Typ **Send email** wählen.
3. Variablenname: **`SEND_EMAIL`** — genau so geschrieben, in Großbuchstaben.
   Die Datei `functions/api/reservierung.js` sucht nach exakt diesem Namen.
4. Als Ziel die in Schritt 5 bestätigte Adresse auswählen.
5. Speichern und das Projekt einmal neu veröffentlichen
   (**Deployments** → beim letzten Eintrag **Retry deployment**).

**Bitte prüfe an dieser Stelle einmal die aktuelle Cloudflare-Doku.** Ich konnte
sie beim Erstellen dieser Anleitung nicht abrufen, der Aufruf in
`functions/api/reservierung.js` ist deshalb nach Sekundärquellen geschrieben:

```js
await env.SEND_EMAIL.send({ to, from, replyTo, subject, text });
```

Sollte Cloudflare inzwischen eine andere Schreibweise verlangen, ist das die
einzige Stelle, die angepasst werden muss — sie steht ganz unten in der Datei
und ist als solche markiert. Alles andere daran ist getestet.

---

## Schritt 7 — Absenderadresse prüfen

Das Formular verschickt die Mail von `webseite@bruno-stuttgart.de`. Diese
Adresse muss nicht existieren, aber sie muss zu deiner Domain gehören. Willst du
eine andere, ändere sie oben in `functions/api/reservierung.js`:

```js
const EMPFAENGER = 'hallo@bruno-stuttgart.de';
const ABSENDER = 'webseite@bruno-stuttgart.de';
```

---

## Schritt 8 — Testen

Ruf deine Seite auf, geh auf **Reservierung**, füll das Formular aus und schick
es ab. Innerhalb einer Minute sollte die Anfrage in deinem Posteingang liegen.

Kommt nichts an: im Dashboard unter deinem Projekt → **Functions** →
**Real-time Logs** siehst du, was passiert ist.

---

## Schritt 9 — Speicher für die Speisekarte anlegen

Damit die Speisekarte im Admin-Bereich geändert werden kann, braucht sie einen
Platz zum Liegen. Cloudflare nennt das KV — ein einfacher Speicher, im
benötigten Umfang kostenlos.

1. Dashboard → **Storage & Databases** → **KV** → **Create a namespace**.
2. Name: `bruno-karte` (der Name ist frei wählbar).
3. Zurück ins Pages-Projekt → **Settings** → **Functions** → **Bindings** →
   **Add binding** → Typ **KV namespace**.
4. Variablenname: **`KARTE`** — genau so, in Großbuchstaben. Als Namespace den
   eben angelegten auswählen.

Solange dieser Schritt fehlt, zeigt die Webseite einfach die fest eingebaute
Speisekarte an. Kaputt geht nichts, der Admin-Bereich kann dann nur nicht
speichern.

---

## Schritt 10 — Admin-Passwort setzen

1. Im Pages-Projekt → **Settings** → **Environment variables** →
   **Add variable**.
2. Name: **`ADMIN_PASSWORT`**, Wert: dein Wunschpasswort.
3. Wichtig: **Encrypt** anklicken. Dann ist der Wert auch für dich später nicht
   mehr lesbar und steht nirgends im Klartext.
4. Speichern und einmal neu veröffentlichen (**Deployments** → **Retry
   deployment**).

**Nimm ein langes Passwort**, mindestens 16 Zeichen, am besten aus einem
Passwortmanager. Es ist der einzige Schutz des Bereichs. Nach acht
Fehlversuchen wird die betreffende IP-Adresse für 15 Minuten gesperrt, aber ein
kurzes Passwort hilft das nicht aus.

Ändere das Passwort jederzeit an derselben Stelle — alle offenen Sitzungen
werden dadurch sofort ungültig.

### So bearbeitest du die Karte

Ruf `deine-domain.de/admin.html` auf und melde dich an. Dort kannst du
Kategorien und Gerichte anlegen, umbenennen, verschieben und löschen. Nach
**Speichern** ist die neue Karte sofort auf der Webseite zu sehen — ohne Push,
ohne Deploy.

Die Seite ist über `noindex` von Suchmaschinen ausgenommen und nirgends
verlinkt. Sie ist aber nicht geheim: Sicherheit kommt allein vom Passwort.

---

## Schritt 11 — Impressum und Datenschutz ausfüllen

**Das ist der wichtigste Schritt vor dem Livegang.** Öffne

- `public/impressum.html`
- `public/datenschutz.html`

und ersetze alle rot markierten Stellen durch deine echten Angaben. Auf der
Seite sind sie farbig hinterlegt, du kannst sie also nicht übersehen. Such im
Text nach `luecke`, dann findest du sie auch im Code.

Ein fehlendes Impressum ist das mit Abstand häufigste Abmahnrisiko bei
Geschäftsseiten. Für die Texte selbst lohnt sich ein Generator wie der von
e-recht24 oder eine kurze anwaltliche Prüfung — die vorbereiteten Texte
beschreiben die Seite technisch korrekt, sind aber keine Rechtsberatung.

Denk auch daran, die erfundenen Angaben in der Seite selbst zu ersetzen:
Telefonnummer, Adresse und Öffnungszeiten stammen aus dem Mockup.

---

## Ab jetzt: ändern und veröffentlichen

Das ist der Ablauf, den du dir gewünscht hast:

```
Änderung machen  →  git push  →  ~30 Sekunden warten  →  live
```

Konkret, egal ob du selbst oder Claude Code die Änderung macht:

```bash
git add -A
git commit -m "Preise angepasst"
git push
```

Cloudflare merkt den Push von selbst und veröffentlicht neu. Im Dashboard unter
**Deployments** siehst du den Fortschritt.

**Wenn du etwas kaputt machst, ist das nicht schlimm.** Unter *Deployments*
kannst du bei jeder früheren Version auf **Rollback** klicken, und die Seite ist
sofort wieder wie vorher.

---

## Lokal ausprobieren, bevor es online geht

```bash
cd public
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Das Reservierungsformular funktioniert so
nicht — es braucht den Cloudflare-Endpunkt. Alles andere schon.

Die Prüflogik von Formular und Admin-Bereich kannst du ohne Cloudflare testen:

```bash
node tests/reservierung.test.mjs
node tests/admin.test.mjs
```

---

## Wenn etwas nicht klappt

**Die Seite zeigt eine Dateiliste, "Nothing is here yet" oder einen 404.**
Das *Build output directory* steht nicht auf `public`. Zu ändern unter
Settings → **Build** → *Build output directory*. Danach unter **Deployments**
beim letzten Eintrag auf **Retry deployment**, sonst bleibt die alte Version
stehen.

**Die alte Version bleibt online, obwohl ich etwas gepusht habe.**
Cloudflare hält die letzte *erfolgreiche* Version online, wenn ein neuer Build
scheitert. Es sieht deshalb so aus, als käme der Push nicht an — in Wahrheit
ist der neue Build rot. Unter **Deployments** den obersten Eintrag anklicken
und ins Build-Protokoll schauen, dort steht der Grund.

Häufigster Grund: eine `wrangler.toml` im Repository, deren `name` nicht dem
Projektnamen entspricht. Diese Datei gehört hier nicht ins Projekt; falls sie
wieder auftaucht, lösch sie.

**Unter Deployments steht gar nichts.**
Das Repository ist zwar verbunden, der erste Deploy wurde aber nie ausgelöst —
oder der Production branch zeigt auf einen Branch, den es nicht gibt. Prüf
unter Settings → **Build** → *Production branch*, ob dort
`claude/neue-webseite-github-kqoq54` steht.

**Änderungen erscheinen nicht.**
Schau im Dashboard unter *Deployments*, ob der Deploy durchgelaufen ist. Wenn
ja, liegt es meist am Browser-Cache — einmal mit Strg+F5 neu laden.

**Das Formular meldet „Der Mailversand ist noch nicht eingerichtet."**
Das Binding aus Schritt 6 fehlt oder heißt anders als `SEND_EMAIL`.

**Das Formular meldet „Die Anfrage konnte gerade nicht verschickt werden."**
Cloudflare hat die Mail abgelehnt. Meist ist die Zieladresse nicht bestätigt
(Schritt 5, Punkt 2) oder die Absenderdomain passt nicht (Schritt 7). Die
*Real-time Logs* sagen dir, was genau.

**Impressum und Datenschutz sehen unformatiert aus.**
Dann fehlt `public/assets/rechtstexte.css`. Prüf, ob die Datei mit gepusht
wurde.

**Der Admin-Bereich meldet „Der Admin-Bereich ist noch nicht eingerichtet."**
Die Variable `ADMIN_PASSWORT` fehlt. Schritt 10.

**Der Admin-Bereich meldet „Der Speicher ist noch nicht eingerichtet."**
Das KV-Binding fehlt oder heißt anders als `KARTE`. Schritt 9.

**Ich habe mich ausgesperrt.**
Warte 15 Minuten, dann ist die Sperre weg. Hast du das Passwort vergessen,
setz in den Environment variables einfach ein neues.

**Die Speisekarte auf der Webseite ist noch die alte.**
Die Karte wird für eine Minute zwischengespeichert. Kurz warten und neu laden.
