# Update: neue PIN-Eingabe

## Was sich ändert

- Die PIN-Eingabe (Mitglieder und Admin) ist ein eigener blauer Bildschirm mit Schloss-Symbol.
- Jede Ziffer bekommt ein Kästchen. Sie blitzt kurz auf und wird dann zum Punkt, daneben erscheint das nächste leere Kästchen.
- Am Handy gibt es einen eigenen Ziffernblock, am Computer tippt man einfach los.
- PINs dürfen jetzt 4 bis 8 Ziffern haben (bisher 4 bis 6). Bestehende PINs gelten weiter.

## Einspielen auf dem Uberspace

Jeden Befehl **einzeln** eingeben, eine Zeile nach der anderen.

```bash
cp -a ~/fundraiser-app ~/fundraiser-app-vorher-$(date +%F-%H%M)
```
```bash
rm -rf ~/update-pin
```
```bash
unzip -o ~/fundraiser-app-pin.zip -d ~/update-pin
```
```bash
rsync -a --exclude node_modules --exclude backend/data ~/update-pin/fundraiser-app/ ~/fundraiser-app/
```
```bash
supervisorctl restart fundraiser
```
```bash
cd ~/fundraiser-app/frontend
```
```bash
npm run build
```
```bash
rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/
```

Prüfen:

```bash
ls ~/fundraiser-app/backend/data/
```
```bash
curl -s https://franz.uber.space/api/health
```

Im ersten Befehl muss `database.json` stehen. Danach am Handy einen Namen antippen: Der blaue PIN-Bildschirm mit Ziffernblock erscheint.
