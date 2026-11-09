# Neue Version einspielen (Uberspace)

So läuft ein Update ab:

1. Die neue Version kommt direkt von GitHub (die Release mit ihrem Tag, z. B. `v3.0.0`) in einen eigenen Ordner und wird dort getestet und gebaut. Die laufende App merkt davon nichts.
2. Für ein paar Sekunden wird der Dienst angehalten: Die Daten wandern in den neuen Ordner, dann werden die beiden Ordner getauscht.
3. Die alte Version bleibt vollständig liegen, samt Daten. Zurück geht es mit zwei Umbenennungen.

**Zwei Regeln:**

- Jeden Befehl einzeln kopieren und mit Enter abschicken. Nie mehrere Befehle in eine Zeile setzen.
- `rsync --delete` nur mit vollständigem Quell- und Zielpfad, so wie unten, und nie zusammen mit anderen Befehlen. Ein Tippfehler macht sonst aus dem letzten Wort das Ziel, und `--delete` leert diesen Ordner.

Die Befehle unten sind für Version 3.0.0 (`v3.0.0`). Für eine spätere Version überall `v3.0.0` durch den neuen Namen ersetzen, zum Beispiel `v3.1.0`.

## 0. Vorbereiten

**Auf GitHub, für jede Version:** Im Repo `pbrandl/Contrib-Lean` unter Releases → „Draft a new release“ den Tag `v3.0.0` neu anlegen (Ziel `main`), als Text den Abschnitt aus `CHANGELOG.md`, dann „Publish release“. Diesen Tag holt der Server. Der Release-Workflow prüft dabei die Versionsnummern und hängt die Demo-Seite an.

Einloggen:

```bash
ssh franz@antila.uberspace.de
```

**Einmalig: Zugang des Servers zu GitHub.** Der Server bekommt einen eigenen Schlüssel, der nur dieses Repo lesen darf (ein Deploy Key). Gibt es `~/.ssh/github_bietrunde` schon, ist das erledigt.

```bash
ssh-keygen -t ed25519 -N "" -C "uberspace-bietrunde" -f ~/.ssh/github_bietrunde
```

```bash
printf 'Host github-bietrunde\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/github_bietrunde\n  IdentitiesOnly yes\n' >> ~/.ssh/config
```

```bash
chmod 600 ~/.ssh/config
```

```bash
cat ~/.ssh/github_bietrunde.pub
```

Die ausgegebene Zeile (sie beginnt mit `ssh-ed25519`) auf GitHub eintragen: im Repo Settings → Deploy keys → „Add deploy key“, Titel „Uberspace“, die Zeile einfügen, „Allow write access“ **nicht** ankreuzen, „Add key“. Dann prüfen:

```bash
ssh -T github-bietrunde
```

Beim ersten Mal fragt ssh, ob es dem Server vertrauen soll. Der Fingerabdruck muss einer von GitHub sein (für ED25519 `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`, alle unter https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints); dann `yes`. Danach muss `Hi pbrandl/Contrib-Lean! You've successfully authenticated, but GitHub does not provide shell access.` kommen.

## 1. Stand notieren

```bash
curl -s https://franz.uber.space/api/public | grep -o '"totalRaised":[0-9.]*\|"contributorCount":[0-9]*\|"totalHours":[0-9.]*'
```

Die drei Zahlen notieren (Summe, Anzahl Gebote, Stunden). Nach dem Umschalten müssen dieselben herauskommen.

## 2. Node-Version (seit 3.0.0)

Version 3 braucht Node 22.12 oder neuer; auf dem Uberspace läuft Node 24. Einmalig umstellen, danach bleibt es so:

```bash
node -v
```

Steht dort schon `v24.…`, weiter mit Schritt 3. Sonst:

```bash
uberspace tools version use node 24
```

```bash
node -v
```

Jetzt muss `v24.…` stehen. Die laufende App merkt davon nichts; sie startet erst beim Umschalten in Schritt 6 mit Node 24. Auch die alte Version (2.0.2) läuft mit Node 24, der Rückweg bleibt also offen. Gibt es Node 24 auf dem Uberspace nicht, zeigt `uberspace tools version list node` die verfügbaren Versionen; 22 geht auch.

## 3. Neue Version holen

```bash
cd ~
```

```bash
ls -d ~/fundraiser-app-v3.0.0 ~/fundraiser-app-vor-v3.0.0
```

Hier muss zweimal `No such file or directory` kommen. Gibt es `~/fundraiser-app-v3.0.0` schon (von einem abgebrochenen Versuch), ist es nur die unfertige neue Version: `rm -rf ~/fundraiser-app-v3.0.0` und den Befehl noch einmal. Gibt es `~/fundraiser-app-vor-v3.0.0`, bitte nicht weitermachen und melden.

```bash
git -c advice.detachedHead=false clone -q --depth 1 --branch v3.0.0 github-bietrunde:pbrandl/Contrib-Lean.git ~/fundraiser-app-v3.0.0
```

```bash
grep '"version"' ~/fundraiser-app-v3.0.0/backend/package.json
```

Hier muss `"version": "3.0.0",` stehen. (Der Ordner ist ein Git-Checkout; `backend/data` gehört nicht dazu und kommt in Schritt 6 aus der alten Version.)

## 4. Pakete laden

Version 3.0.0 hat neue Pakete in Backend (Express 5) und Frontend (Vite, Vitest, Tailwind 4), deshalb werden beide neu geladen:

```bash
cd ~/fundraiser-app-v3.0.0/backend
```

```bash
npm ci
```

```bash
cd ~/fundraiser-app-v3.0.0/frontend
```

```bash
npm ci --include=dev
```

Das dauert ein bis zwei Minuten. Am Ende steht `added … packages` und `found 0 vulnerabilities`. (`--include=dev`: Das Werkzeug, das die Seiten baut, gehört zu den Entwicklungs-Paketen und muss mit.)

(Welche Pakete sich in einer Version geändert haben, steht im `CHANGELOG.md`: unverändert heißt `node_modules` kopieren, geändert heißt im jeweiligen neuen Ordner `npm ci`.)

## 5. Testen und bauen

```bash
cd ~/fundraiser-app-v3.0.0/backend
```

```bash
node test.js /nonexistent
```

Das dauert etwa eine Minute und gibt viele Zeilen aus, darunter Hunderte `[login] wrong PIN …`: Die Tests probieren absichtlich falsche PINs. Am Ende muss `0 failed` stehen. Die Tests laufen mit einer eigenen, leeren Test-Datenbank und berühren die echten Daten nicht.

```bash
cd ~/fundraiser-app-v3.0.0/frontend
```

```bash
npm run build
```

Hier muss am Ende `✓ built in …` stehen.

## 6. Umschalten

Von `supervisorctl stop` bis zum Start ist die App nicht erreichbar, meist unter einer Minute. Am besten zu einer ruhigen Zeit. Offene Seiten zeigen so lange „Gleich wieder da“ und laufen danach von selbst weiter. Wer genau dann speichert, speichert danach einfach noch einmal.

```bash
cd ~
```

```bash
ls ~/fundraiser-app-v3.0.0/backend
```

Hier darf **kein** `data` stehen (sonst bitte melden und nicht weitermachen).

```bash
supervisorctl stop fundraiser
```

```bash
cp -a ~/fundraiser-app/backend/data ~/fundraiser-app-v3.0.0/backend/
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-vor-v3.0.0
```

```bash
mv ~/fundraiser-app-v3.0.0 ~/fundraiser-app
```

```bash
supervisorctl start fundraiser
```

Das dauert etwa 30 Sekunden, bis `fundraiser: started` kommt: Uberspace wartet so lange, ob der Dienst stabil läuft. Die App antwortet schon vorher.

```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

## 7. Prüfen

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

```bash
ls ~/html/assets/
```

Dort liegen jetzt die gebauten Dateien (`index-….js`, `index-….css`, Schriften); der alte Ordner `static` ist weg.

Dann am Handy die Seite neu laden: Die Mitglieder sind noch angemeldet, Gebote und Stunden stimmen, die Seite sieht aus wie vorher. Zum Schluss `/admin` öffnen, auf ein Mitglied tippen (Name und PIN erscheinen, mit „Abbrechen“ wieder schließen) und einmal als Excel exportieren.

## Zurück zur alten Version

Nur falls etwas nicht stimmt. Die Daten, die seit dem Umschalten dazugekommen sind, nimmt der Rückweg mit.

```bash
supervisorctl stop fundraiser
```

```bash
mv ~/fundraiser-app ~/fundraiser-app-v3.0.0-fehler
```

```bash
mv ~/fundraiser-app-vor-v3.0.0 ~/fundraiser-app
```

```bash
cp -a ~/fundraiser-app-v3.0.0-fehler/backend/data/. ~/fundraiser-app/backend/data/
```

```bash
supervisorctl start fundraiser
```

(Wieder etwa 30 Sekunden.)

```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

Die alte Version liest alles, was die neue gespeichert hat: 3.0.0 hat am Datenformat nichts geändert. Node 24 bleibt eingestellt, 2.0.2 läuft damit.

## Danach

Wenn die neue Version ein paar Tage gut läuft, am besten nach der Bietrunde:

```bash
rm -rf ~/fundraiser-app-vor-v3.0.0
```
