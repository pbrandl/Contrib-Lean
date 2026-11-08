# Änderungen

## Unveröffentlicht

Werkzeuge, Doku und Pakete; an der App ändert sich nichts Sichtbares, nichts muss sofort eingespielt werden.

- CI auf GitHub: Bei jedem Push laufen die Tests, ESLint, beide Builds und `npm audit`, auf Node 20, 22 und 24.
- Releases: Eine veröffentlichte GitHub-Release bekommt automatisch das Zip für `DEPLOY.md` und die Demo-Seite angehängt.
- Dependabot schlägt jede Woche Paket-Updates vor.
- Lokal entwickeln: `npm start` im Frontend leitet `/api` an das Backend weiter; `npm test` im Backend, `npm run lint` im Frontend.
- README neu für alle, die das Projekt nicht kennen (mit Handy-Screenshots), dazu `CONTRIBUTING.md`, `SECURITY.md`, eine Vorlage für Pull Requests, `.editorconfig` und `.nvmrc`.
- Demo-Seite: Sie lässt sich jetzt auch direkt als Datei öffnen (Zeichensatz und Handy-Darstellung waren nur im Artifact gesetzt).
- Frontend-Pakete: `lucide-react` 1.x (die Icons sehen gleich aus) und `@testing-library/jest-dom` 7; `web-vitals` und `@testing-library/user-event` entfernt, sie wurden nicht benutzt. Beim nächsten Einspielen im Frontend deshalb `npm ci` statt `node_modules` kopieren.

## 2.0.2 – 29.10.2026

Keine neuen Pakete: beim Einspielen `node_modules` in beiden Ordnern kopieren (siehe `DEPLOY.md`).

- PIN-Eingabe am Computer: Das nächste freie Kästchen ist immer da, mit weißem Rand und blinkendem Eingabestrich. Vorher stand vor der ersten Ziffer gar kein Kästchen da, und es war nicht zu sehen, dass man tippen kann. Am Handy bleibt alles wie bisher.

## 2.0.1 – 29.10.2026

Sicherheits-Updates der Pakete, die App selbst ist unverändert. Beim Einspielen in **beiden** Ordnern (`backend` und `frontend`) `npm ci` ausführen (siehe `DEPLOY.md`).

- Backend: `body-parser` 1.20.9 (in Express), schließt eine Lücke, mit der sich der Server durch präparierte Anfragen lahmlegen ließ.
- Frontend: React 19.3, aktuelle Versionen der übrigen Pakete. Das Build-Werkzeug (react-scripts 5) wird nicht mehr gepflegt; seine verwundbaren Unterpakete (postcss, nth-check, svgo, serialize-javascript, underscore, uuid, @tootallnate/once) sind über `overrides` in `frontend/package.json` auf korrigierte Versionen gesetzt. Offen bleiben Meldungen für den Entwicklungs-Server (nur `npm start`) und niedrige ohne Korrektur (`deepmerge`).
- Neu: `docs/beispieldaten.csv`, 24 ausgedachte Mitglieder (dieselben wie in der Demo) mit PIN 1234, zum Vorführen über den Import.

## 2.0.0 – 22.10.2026

Neues Paket im Frontend (`fflate`, für Excel-Dateien): Beim Einspielen im Ordner `frontend` `npm ci` ausführen statt `node_modules` zu kopieren (siehe `DEPLOY.md`). Das Backend hat keine neuen Pakete.

**Für alle**

- Einstellungen auf jeder Seite (Zahnrad oben rechts): Darstellung hell, dunkel oder wie das System, Sprache und Beträge netto oder brutto. Pro Gerät gemerkt; die Netto/Brutto-Wahl aus Version 1 wird übernommen. Der Netto/Brutto-Knopf auf der Gebotskarte entfällt, dort steht nur noch, was gerade gilt.
- Karten heben sich deutlicher vom Hintergrund ab.
- Neue Kopfzeile auf der Mitglieder- und der Admin-Seite: links ein Zurück-Pfeil, in der Mitte der Name, rechts die Einstellungen. Der Pfeil und die Zurück-Taste des Browsers führen zurück zur Namensliste bzw. zur Admin-Anmeldung und melden dabei ab.
- PIN-Eingabe: oben nur der Zurück-Pfeil und die Einstellungen, das Schloss steht in einem helleren Kreis vor dem Namen. Ein Kästchen erscheint erst mit seiner Ziffer, so bleibt keines leer.
- Die App gibt es auf Deutsch, Englisch und Spanisch. Beim ersten Besuch gilt die Sprache des Browsers, sonst Deutsch. Zahlen erscheinen im Format der Sprache (1.585,50 oder 1,585.50), auch beim Eintippen.
- Dunkelmodus für alle Seiten.
- Der Entwurf der Gebotseingabe (`docs/gebotseingabe-entwurf.html`) ist entfernt; die Demo zeigt die ganze App.
- Fehlermeldungen des Servers erscheinen in der eingestellten Sprache.

**Admin**

- Ein Tipp auf ein Mitglied öffnet Name und PIN zum Ändern, beides in einem Schritt. Löschen sitzt dort hinter einer Rückfrage.
- Export mit einem Knopf: links „Herunterladen“, rechts das Format (Excel/XLSX, CSV oder JSON). Das gewählte Format wird gemerkt.
- Import über einen Knopf: Die App erkennt selbst, ob die Datei Excel (XLSX), CSV oder JSON ist, auch CSV aus dem deutschen Excel. Ein Hinweis nennt die erlaubten Dateitypen.

**Für spätere Erweiterungen**

- Alle Texte stehen in je einer Datei pro Sprache (`frontend/src/i18n/`). Eine neue Sprache ist eine neue Datei und eine Zeile.
- Einstellungen, Exportformate und Farben sind je an einer Stelle beschrieben; neue Einträge erscheinen dann von selbst auf der Einstellungsseite, in der Formatauswahl und im Dunkelmodus.

## 1.0.0 – 18.10.2026

Die erste fertige Version, gebaut für die Bietrunde im Oktober 2026. Pakete (`package-lock.json`) unverändert gegenüber dem bisherigen Stand, beim Einspielen reicht das Kopieren von `node_modules` (siehe `DEPLOY.md`).

**Mitglieder**

- Beitrag (netto, mit Cent) und Stunden pro Monat werden auf einem eigenen Bildschirm eingegeben: Ziffernblock auf Handy und Tablet, großes Eingabefeld am Computer. Der Balken oben zeigt die Änderung vorab in Grau.
- Netto/Brutto-Anzeige, pro Gerät gemerkt. Ein brutto eingegebener Betrag bleibt genau so stehen (10 € bleiben 10 €).
- PIN-Eingabe auf eigenem Bildschirm: ein Kästchen pro Ziffer, Ziffernblock am Handy. PINs haben 4 bis 8 Ziffern.
- Meldungen oben, grün für Gespeichertes und rot für Fehler. Ladekreisel nur, wenn etwas länger als 0,2 Sekunden dauert.
- Passt ohne Scrollen auf alle Handys, auch quer gehalten und auf kleinen iPhones.
- Wartungsseite „Gleich wieder da“, solange der Server nicht antwortet (etwa beim Einspielen): Sie prüft alle 5 Sekunden und geht von selbst zurück zur App. Ein offener Eingabe-Bildschirm bleibt dabei stehen.
- Seite „Seite nicht gefunden“ für unbekannte Adressen, mit Status 404.

**Admin**

- Einklappbare Mitgliederliste, zufällige Start-PIN für neu eingetragene Mitglieder, Bereich „Einstellungen“ mit Netto/Brutto.
- Export mit netto, brutto und Eingabeart (`entered_as`); ein Import liest das wieder ein.

**Sicherheit und Betrieb**

- Falsche PINs sperren nur das eigene Gerät, nicht das ganze WLAN. Dazu Grenzen pro Netzwerk und Konto und vertrauenswürdige Geräte. Getestet mit 600 Mitgliedern hinter einer Adresse.
- Sicherheits-Header, Größen- und Schreibgrenzen, ein Protokoll jeder Änderung mit Adresse, Browser und Gerät, stündliche Sicherungen.
- Kein Gebot geht bei schlechtem WLAN verloren oder zählt doppelt.
- Gemessen: Anmelde-Ansturm, 600 Handys im Dauerbetrieb und Laden über langsames Netz liegen weit unter den Grenzen.

**Entfernt**

- Die Übergangslösungen für Seiten von vor dem Oktober-Update: Gebote in Schritten (`POST /me/contribution`, `/withdraw`) und die Start-PIN 1234 für Admin-Seiten ohne Geräte-Kennung.

**Werkzeuge**

- Demo ohne Server mit Beispieldaten: `npm run build:demo` im Ordner `frontend`.
- `tools/pin-mail/`: verschickt jedem Mitglied seine PIN per Mail.
