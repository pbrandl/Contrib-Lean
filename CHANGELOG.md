# Änderungen

## 1.0.0 – 18.10.2026

Die erste fertige Version, gebaut für die Bietrunde im Oktober 2026. Pakete (`package-lock.json`) unverändert gegenüber dem bisherigen Stand, beim Einspielen reicht das Kopieren von `node_modules` (siehe `DEPLOY.md`).

**Mitglieder**

- Beitrag (netto, mit Cent) und Stunden pro Monat werden auf einem eigenen Bildschirm eingegeben: Ziffernblock auf Handy und Tablet, großes Eingabefeld am Computer. Der Balken oben zeigt die Änderung vorab in Grau.
- Netto/Brutto-Anzeige, pro Gerät gemerkt. Ein brutto eingegebener Betrag bleibt genau so stehen (10 € bleiben 10 €).
- PIN-Eingabe auf eigenem Bildschirm: ein Kästchen pro Ziffer, Ziffernblock am Handy. PINs haben 4 bis 8 Ziffern.
- Meldungen oben, grün für Gespeichertes und rot für Fehler. Ladekreisel nur, wenn etwas länger als 0,2 Sekunden dauert.
- Passt ohne Scrollen auf alle Handys, auch quer gehalten und auf kleinen iPhones.

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
