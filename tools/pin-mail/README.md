# PIN-Mails für die Bietrunde

Schickt jedem Mitglied eine Mail mit seiner PIN. Nur Python 3, keine weiteren Pakete.

1. **CSV vorbereiten** mit den Spalten `Username`, `Password` (die PIN, 4 bis 8 Ziffern) und `Mail`, getrennt mit Komma oder Semikolon. `Username` muss genau so geschrieben sein wie in der App. Dieselbe Datei (mit denselben PINs) importierst du vorher im Admin-Bereich.
2. **`mail_vorlage.html` anpassen.** Das hier ist nur ein Beispiel. `{name}` und `{pin}` werden für jedes Mitglied eingesetzt. Die Textfassung der Mail erzeugt das Skript selbst.
3. **SMTP-Zugang** oben in `send_pins.py` eintragen (`SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SENDER_EMAIL`, `SUBJECT`). Das Passwort fragt das Skript beim Start ab.
4. **Ausprobieren, dann senden:**

   ```bash
   python3 send_pins.py mitglieder.csv --vorschau
   ```

   Prüft die CSV und schreibt die ersten drei Mails nach `vorschau/`. Sendet nichts.

   ```bash
   python3 send_pins.py mitglieder.csv --test du@example.org
   ```

   Schickt die ersten zwei Mails an dich.

   ```bash
   python3 send_pins.py mitglieder.csv
   ```

   Schickt an alle, erst nach der Eingabe von `ja`.

Wer angeschrieben wurde, steht in `versendet.txt`. Bricht der Versand ab, schickt ein neuer Lauf nur noch den Rest. Fehler stehen in `error_log.txt`.

CSV-Dateien, `versendet.txt`, `error_log.txt` und `vorschau/` sind von Git ausgeschlossen: Sie enthalten PINs oder Adressen. Die CSV nach dem Versand löschen oder sicher wegschließen.
