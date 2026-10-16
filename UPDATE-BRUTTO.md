# Update: Brutto-Gebote bleiben, wie sie eingegeben wurden

## Was sich ändert

- **Wer im Brutto-Modus bietet, sieht genau den eingegebenen Betrag.** 10 € brutto bleiben 10 € und werden nicht mehr zu 10,01 €.
- **Gespeichert wird der eingegebene Bruttobetrag mit.** Er ist führend. Netto wird daraus berechnet (brutto / 1,19, auf den Cent aufgerundet) und zählt wie bisher für die Summe und den Bedarf.
- Wer netto bietet, für den ändert sich nichts.
- Im Brutto-Modus zählt auch die Summe oben die Bruttobeträge so, wie sie eingegeben wurden.
- **Export:** Die CSV hat die neue Spalte `entered_as` (`brutto` oder `netto`). Bei `brutto` steht in `contribution_gross` genau der eingegebene Betrag. Ein Import einer exportierten Datei behält ihn.
- Bisher abgegebene Gebote bleiben unverändert. Wer schon brutto geboten hat, sieht seinen Betrag weiter aus netto × 1,19 berechnet, bis er ihn neu speichert.

## Einspielen auf dem Uberspace

Backend und Frontend haben sich geändert. Erst das Backend, dann das Frontend.

```bash
cp -a ~/fundraiser-app ~/fundraiser-app-vorher-$(date +%F-%H%M)
rm -rf ~/update-brutto && unzip -o ~/fundraiser-app-brutto.zip -d ~/update-brutto
rsync -a --exclude node_modules --exclude backend/data ~/update-brutto/fundraiser-app/ ~/fundraiser-app/
supervisorctl restart fundraiser
cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
```

Optional die Tests (am Ende muss `40 passed, 0 failed` stehen):

```bash
cd ~/fundraiser-app/backend && node test.js /nonexistent
```

Danach am Handy prüfen: auf „Netto“ tippen, damit „Brutto“ dasteht, dann „Beitrag ändern“, 10 eingeben, „Speichern“. Die Karte muss 10 zeigen.
