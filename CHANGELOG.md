# Änderungen

## 2.0.0 – 22.10.2026

Neues Paket im Frontend (`fflate`, für Excel-Dateien): Beim Einspielen im Ordner `frontend` `npm ci` ausführen statt `node_modules` zu kopieren (siehe `DEPLOY.md`). Das Backend hat keine neuen Pakete.

**Für alle**

- Einstellungen auf jeder Seite (Zahnrad oben rechts): Darstellung hell, dunkel oder wie das System, Sprache und Beträge netto oder brutto. Pro Gerät gemerkt; die Netto/Brutto-Wahl aus Version 1 wird übernommen. Der Netto/Brutto-Knopf auf der Gebotskarte entfällt, dort steht nur noch, was gerade gilt.
- Karten heben sich deutlicher vom Hintergrund ab.
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
