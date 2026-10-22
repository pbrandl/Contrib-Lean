# Neue Version einspielen (Uberspace)

So läuft ein Update ab:

1. Die neue Version wird in einem eigenen Ordner aufgebaut, getestet und gebaut. Die laufende App merkt davon nichts.
2. Für ein paar Sekunden wird der Dienst angehalten: Die Daten wandern in den neuen Ordner, dann werden die beiden Ordner getauscht.
3. Die alte Version bleibt vollständig liegen, samt Daten. Zurück geht es mit zwei Umbenennungen.

**Zwei Regeln:**

- Jeden Befehl einzeln kopieren und mit Enter abschicken. Nie mehrere Befehle in eine Zeile setzen.
- `rsync --delete` nur mit vollständigem Quell- und Zielpfad, so wie unten, und nie zusammen mit anderen Befehlen. Ein Tippfehler macht sonst aus dem letzten Wort das Ziel, und `--delete` leert diesen Ordner.

Die Befehle unten sind für Version 2 (`v2`). Für eine spätere Version überall `v2` durch den neuen Namen ersetzen, zum Beispiel `v2.1`.

## 0. Auf deinem Rechner: das Zip hochladen

Im Ordner, in dem das Zip liegt (meist `~/Downloads`):

```bash
scp fundraiser-app-v2.zip franz@antila.uberspace.de:~/
```

Dann einloggen:

```bash
ssh franz@antila.uberspace.de
```

## 1. Stand notieren

```bash
curl -s https://franz.uber.space/api/public | grep -o '"totalRaised":[0-9.]*\|"contributorCount":[0-9]*\|"totalHours":[0-9.]*'
```

Die drei Zahlen notieren (Summe, Anzahl Gebote, Stunden). Nach dem Umschalten müssen dieselben herauskommen.

## 2. Neue Version auspacken

```bash
cd ~
```

```bash
ls -d ~/fundraiser-app-v2 ~/fundraiser-app-vor-v2
```

Hier muss zweimal `No such file or directory` kommen. Gibt es `~/fundraiser-app-v2` schon (von einem abgebrochenen Versuch), ist es nur die unfertige neue Version: `rm -rf ~/fundraiser-app-v2` und den Befehl noch einmal. Gibt es `~/fundraiser-app-vor-v2`, bitte nicht weitermachen und melden.

```bash
unzip -q ~/fundraiser-app-v2.zip -d ~
```

```bash
ls ~/fundraiser-app-v2
```

Dort müssen unter anderem `backend`, `frontend` und `DEPLOY.md` stehen.

## 3. Pakete übernehmen

Im Backend sind die Pakete dieselben wie bisher, sie werden kopiert:

```bash
cp -a ~/fundraiser-app/backend/node_modules ~/fundraiser-app-v2/backend/
```

Das Frontend hat in Version 2 ein neues Paket (für Excel-Dateien), deshalb werden seine Pakete neu geladen:

```bash
cd ~/fundraiser-app-v2/frontend
```

```bash
npm ci
```

Das dauert ein bis drei Minuten. Am Ende steht `added … packages`. Hinweise wie `npm warn deprecated` oder `vulnerabilities` sind normal und kein Fehler.

(Welche Pakete sich in einer Version geändert haben, steht im `CHANGELOG.md`: unverändert heißt `node_modules` kopieren, geändert heißt im jeweiligen neuen Ordner `npm ci`.)

## 4. Testen und bauen

```bash
cd ~/fundraiser-app-v2/backend
```

```bash
node test.js /nonexistent
```

Das dauert etwa eine Minute und gibt viele Zeilen aus, darunter Hunderte `[login] wrong PIN …`: Die Tests probieren absichtlich falsche PINs. Am Ende muss `0 failed` stehen. Die Tests laufen mit einer eigenen, leeren Test-Datenbank und berühren die echten Daten nicht.

```bash
cd ~/fundraiser-app-v2/frontend
```

```bash
npm run build
```

Hier muss `Compiled successfully.` stehen.

## 5. Umschalten

Von `supervisorctl stop` bis zum Start ist die App nicht erreichbar, meist unter einer Minute. Am besten zu einer ruhigen Zeit. Offene Seiten zeigen so lange „Gleich wieder da“ und laufen danach von selbst weiter. Wer genau dann speichert, speichert danach einfach noch einmal.

```bash
cd ~
```

```bash
ls ~/fundraiser-app-v2/backend
```

Hier darf **kein** `data` stehen (sonst bitte melden und nicht weitermachen).

```bash
supervisorctl stop fundraiser
```

```bash
cp -a ~/fundraiser-app/backend/data ~/fundraiser-app-v2/backend/
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-vor-v2
```

```bash
mv ~/fundraiser-app-v2 ~/fundraiser-app
```

```bash
supervisorctl start fundraiser
```

Das dauert etwa 30 Sekunden, bis `fundraiser: started` kommt: Uberspace wartet so lange, ob der Dienst stabil läuft. Die App antwortet schon vorher.

```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

## 6. Prüfen

```bash
supervisorctl status fundraiser
```

Muss `RUNNING` zeigen.

```bash
ls -la ~/fundraiser-app/backend/data/
```

Dort müssen `database.json`, `session-secret`, `audit.log` und `backups` stehen.

```bash
curl -s https://franz.uber.space/api/health
```

```bash
curl -s https://franz.uber.space/api/public | grep -o '"totalRaised":[0-9.]*\|"contributorCount":[0-9]*\|"totalHours":[0-9.]*'
```

Dieselben Zahlen wie in Schritt 1 (außer jemand hat in der Zwischenzeit geboten).

Dann am Handy die Seite neu laden: Die Mitglieder sind noch angemeldet, Gebote und Stunden stimmen. Oben rechts ist jetzt das Zahnrad für die Einstellungen. Zum Schluss `/admin` öffnen, auf ein Mitglied tippen (Name und PIN erscheinen, mit „Abbrechen“ wieder schließen) und einmal exportieren.

## Zurück zur alten Version

Nur falls etwas nicht stimmt. Die Daten, die seit dem Umschalten dazugekommen sind, nimmt der Rückweg mit.

```bash
supervisorctl stop fundraiser
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-v2-fehler
```

```bash
mv ~/fundraiser-app-vor-v2 ~/fundraiser-app
```

```bash
cp -a ~/fundraiser-app-v2-fehler/backend/data/. ~/fundraiser-app/backend/data/
```

```bash
supervisorctl start fundraiser
```

(Wieder etwa 30 Sekunden.)

```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

Die alte Version liest alles, was die neue gespeichert hat, auch geänderte Namen und PINs. Sie zeigt aber wieder nur Deutsch und kennt die Einstellungen nicht.

## Danach

Wenn die neue Version ein paar Tage gut läuft, am besten nach der Bietrunde:

```bash
rm -rf ~/fundraiser-app-vor-v2
```

```bash
rm ~/fundraiser-app-v2.zip
```
