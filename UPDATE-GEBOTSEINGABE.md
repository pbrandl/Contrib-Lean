# Update: neue Gebotseingabe

## Was sich ändert

**Mitgliederseite**

- Die Karte heißt „Dein Beitrag“. Darin stehen der eigene Beitrag in Euro und die eigenen Stunden, darunter die Knöpfe „Beitrag ändern“ und „Stunden ändern“.
- Ein Tipp auf einen der Knöpfe öffnet eine dunkelblaue Seite über den ganzen Bildschirm:
  - Auf Handys und Tablets mit einem eigenen Ziffernblock.
  - Am Computer mit einem großen Eingabefeld und blinkendem Strich.
  - Der aktuelle Wert ist schon eingetragen.
  - Der Balken oben zeigt in Grau, wie sich die Summe aller Gebote ändert.
  - „Speichern“ geht erst, wenn sich der Wert geändert hat.
- Beiträge gehen jetzt mit Cent (z. B. 10,87 €), Stunden mit einer Nachkommastelle (z. B. 2,5 h). Der Server rundet Stunden auf 0,1 h statt bisher 0,5 h.
- Ein neuer Betrag ersetzt den alten, er wird nicht mehr dazugezählt. 0 € zieht den Beitrag zurück; den Reset-Knopf gibt es nicht mehr.
- **Netto/Brutto:** Rechts neben „Dein Beitrag“ steht grau „Netto“. Ein Tipp darauf schaltet alle Beträge der Seite auf brutto (× 1,19) um und zurück. Jedes Gerät merkt sich die Wahl.
  - Gespeichert wird immer netto.
  - Wer im Brutto-Modus tippt, tippt brutto. Der Server bekommt netto, auf den Cent aufgerundet. Wieder als brutto angezeigt, kann der Betrag 1 Cent höher sein.
- Oben steht die Summe aller Gebote in ganzen Euro, „von X €“ und die Stunden pro Monat. Die Startseite schreibt „von X € netto“.
- „PIN ändern“ ist ein grauer Textknopf unter der Karte. Der Hinweis zur Start-PIN entfällt, weil alle eine zufällige PIN haben.
- Die Zurück-Geste am Handy schließt die Eingabeseite. Sie meldet nicht mehr ab, wenn die Eingabeseite offen ist.

**Meldungen** erscheinen jetzt oben: grün mit Haken für Gespeichertes, rot für Fehler. Ein Tipp schließt sie.

**Admin-Seite**

- Die Mitgliederliste ist eingeklappt und öffnet sich mit einem Tipp auf „Mitglieder“. Leer ist sie gleich offen.
- Neu: **„Einstellungen“** mit demselben Netto/Brutto-Schalter (gilt nur für deine Ansicht) und „Admin-PIN ändern“.
- Den Bedarf gibst du immer netto ein.
- Exporte enthalten jedes Gebot netto und brutto: in der CSV die neue Spalte `contribution_gross`, im JSON `contributionsGross`. Der Import liest weiter die Netto-Spalte `contribution` und überspringt die Brutto-Spalte. Eine exportierte Datei lässt sich also unverändert wieder importieren.

Seiten, die schon vor dem Update offen waren, zeigen bis zum Neuladen die alten Knöpfe. Die funktionieren weiter.

## Einspielen auf dem Uberspace

Den Ordner `data/` mit Datenbank, Protokoll und Sicherungen fasst das Update nicht an. **Erst das Backend, dann das Frontend:** Die neue Seite braucht den neuen Server, der alte Server kennt die neue Art zu speichern noch nicht.

1. **Alles sichern**, auch die Daten:

   ```bash
   cp -a ~/fundraiser-app ~/fundraiser-app-vorher-$(date +%F-%H%M)
   ```

2. **Das Zip hochladen und den Code übernehmen** (in einen neuen, leeren Ordner):

   ```bash
   rm -rf ~/update-gebot && unzip -o fundraiser-app-gebotseingabe.zip -d ~/update-gebot
   rsync -a --exclude node_modules --exclude backend/data ~/update-gebot/fundraiser-app/ ~/fundraiser-app/
   ```

3. **Backend neu starten.** Neue Pakete gibt es nicht, `npm ci` ist nicht nötig:

   ```bash
   supervisorctl restart fundraiser
   ```

   Angemeldete Mitglieder bleiben angemeldet.

4. **Frontend bauen und veröffentlichen:**

   ```bash
   cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
   ```

5. **Prüfen:**

   ```bash
   curl -s https://franz.uber.space/api/health
   ```

   Danach die Seite auf dem Handy öffnen, anmelden, „Beitrag ändern“ antippen: Es muss der Ziffernblock kommen. Am Computer kommt das Eingabefeld.

6. **Optional, die Tests auf dem Server**, gegen eine leere Test-Datenbank:

   ```bash
   cd ~/fundraiser-app/backend && node test.js /nonexistent
   ```

   Am Ende muss `39 passed, 0 failed` stehen.

**Zurück zur alten Version**, falls nötig (`DATUM` durch den Ordnernamen aus Schritt 1 ersetzen). Die Daten bleiben dabei, wie sie sind; die alte Version kann Beträge mit Cent und Stunden mit Nachkommastelle lesen:

```bash
supervisorctl stop fundraiser
rsync -a --delete --exclude backend/data ~/fundraiser-app-vorher-DATUM/ ~/fundraiser-app/
cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
supervisorctl start fundraiser
```
