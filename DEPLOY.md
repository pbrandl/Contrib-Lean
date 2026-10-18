# Neue Version einspielen (Uberspace)

So läuft ein Update ab:

1. Die neue Version wird in einem eigenen Ordner aufgebaut, getestet und gebaut. Die laufende App merkt davon nichts.
2. Für ein paar Sekunden wird der Dienst angehalten: Die Daten wandern in den neuen Ordner, dann werden die beiden Ordner getauscht.
3. Die alte Version bleibt vollständig liegen, samt Daten. Zurück geht es mit zwei Umbenennungen.

**Zwei Regeln:**

- Jeden Befehl einzeln kopieren und mit Enter abschicken. Nie mehrere Befehle in eine Zeile setzen.
- `rsync --delete` nur mit vollständigem Quell- und Zielpfad, so wie unten, und nie zusammen mit anderen Befehlen. Ein Tippfehler macht sonst aus dem letzten Wort das Ziel, und `--delete` leert diesen Ordner.

Die Befehle unten sind für Version 1 (`v1`). Für eine spätere Version überall `v1` durch den neuen Namen ersetzen, zum Beispiel `v1.1`.

## 0. Auf deinem Rechner: das Zip hochladen

Im Ordner, in dem das Zip liegt (meist `~/Downloads`):

```bash
scp fundraiser-app-v1.zip franz@antila.uberspace.de:~/
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
ls -d ~/fundraiser-app-v1 ~/fundraiser-app-vor-v1
```

Hier muss zweimal `No such file or directory` kommen. Gibt es `~/fundraiser-app-v1` schon (von einem abgebrochenen Versuch), ist es nur die unfertige neue Version: `rm -rf ~/fundraiser-app-v1` und den Befehl noch einmal. Gibt es `~/fundraiser-app-vor-v1`, bitte nicht weitermachen und melden.

```bash
unzip -q ~/fundraiser-app-v1.zip -d ~
```

```bash
ls ~/fundraiser-app-v1
```

Dort müssen unter anderem `backend`, `frontend` und `DEPLOY.md` stehen.

## 3. Pakete übernehmen

Die Paketversionen sind dieselben wie bisher, deshalb werden sie kopiert statt neu geladen:

```bash
cp -a ~/fundraiser-app/backend/node_modules ~/fundraiser-app-v1/backend/
```

```bash
cp -a ~/fundraiser-app/frontend/node_modules ~/fundraiser-app-v1/frontend/
```

(Hat sich in einer späteren Version eine `package-lock.json` geändert, steht das im `CHANGELOG.md`. Dann stattdessen im jeweiligen neuen Ordner `npm ci` ausführen.)

## 4. Testen und bauen

```bash
cd ~/fundraiser-app-v1/backend
```

```bash
node test.js /nonexistent
```

Das dauert etwa eine Minute und gibt viele Zeilen aus, darunter Hunderte `[login] wrong PIN …`: Die Tests probieren absichtlich falsche PINs. Am Ende muss `0 failed` stehen. Die Tests laufen mit einer eigenen, leeren Test-Datenbank und berühren die echten Daten nicht.

```bash
cd ~/fundraiser-app-v1/frontend
```

```bash
npm run build
```

Hier muss `Compiled successfully.` stehen.

## 5. Umschalten

Von `supervisorctl stop` bis zum Start ist die App nicht erreichbar, meist unter einer Minute. Am besten zu einer ruhigen Zeit. Wer genau dann speichert, bekommt eine Fehlermeldung und speichert danach einfach noch einmal.

```bash
cd ~
```

```bash
ls ~/fundraiser-app-v1/backend
```

Hier darf **kein** `data` stehen (sonst bitte melden und nicht weitermachen).

```bash
supervisorctl stop fundraiser
```

```bash
cp -a ~/fundraiser-app/backend/data ~/fundraiser-app-v1/backend/
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-vor-v1
```

```bash
mv ~/fundraiser-app-v1 ~/fundraiser-app
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

Dann am Handy die Seite neu laden: Die Mitglieder sind noch angemeldet, Gebote und Stunden stimmen. Einmal abmelden und wieder anmelden: Es kommt der blaue PIN-Bildschirm mit Kästchen und Ziffernblock. Zum Schluss `/admin` öffnen.

## Zurück zur alten Version

Nur falls etwas nicht stimmt. Die Daten, die seit dem Umschalten dazugekommen sind, nimmt der Rückweg mit.

```bash
supervisorctl stop fundraiser
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-v1-fehler
```

```bash
mv ~/fundraiser-app-vor-v1 ~/fundraiser-app
```

```bash
cp -a ~/fundraiser-app-v1-fehler/backend/data/. ~/fundraiser-app/backend/data/
```

```bash
supervisorctl start fundraiser
```

(Wieder etwa 30 Sekunden.)

```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

Achtung: Wer in der neuen Version eine 7- oder 8-stellige PIN gewählt hat, kommt mit der alten nicht mehr hinein (sie kennt nur 4 bis 6 Ziffern). Für diese Mitglieder im Admin-Bereich eine neue PIN setzen.

## Danach

Wenn die neue Version ein paar Tage gut läuft, am besten nach der Bietrunde:

```bash
rm -rf ~/fundraiser-app-vor-v1
```

```bash
rm ~/fundraiser-app-v1.zip
```
