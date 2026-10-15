# Bietrunde – FRANZ!werk Tübingen

Members open https://franz.uber.space, pick their name, log in with their PIN and set their bid
(euros, counted up with buttons) and their hours per month (typed in, no target).
Admins manage members, PINs, the target ("Bedarf") and import/export at https://franz.uber.space/admin.

## Layout on the Uberspace

| Part | Where |
|---|---|
| Backend (Express, no database) | `~/fundraiser-app/backend/server.js`, supervisor service `fundraiser`, port 3001, web backend `/api` |
| Data | `~/fundraiser-app/backend/data/` (see below) |
| Frontend (React + Tailwind) | source in `~/fundraiser-app/frontend/src`, build served by Apache from `~/html` |

### Data folder

| File | Purpose |
|---|---|
| `database.json` | members (PINs only as scrypt hashes), bids (`contributions`), hours per month (`hours`), target. Written atomically. |
| `audit.log` | one JSON line per change (bid, withdraw, PIN change, import, …) – every bid can be traced |
| `backups/database-YYYY-MM-DD.json` | state before the first change of each day, 60 days kept |
| `backups/database-…-before-import.json` | state before every import |
| `session-secret` | signs login sessions. Deleting it logs everybody out. |

## Security model

- PINs are 4–6 digits, stored as scrypt hashes, never sent to the browser or exported.
- Login returns a signed session token. Members stay logged in for 30 days, admins until the tab is closed (max. 12 h).
- Changing a PIN ends all older sessions of that account.
- 5 wrong PINs from one device lock that device for that account (1 min, doubling up to 1 h). Other devices are not affected. A new PIN from the admin lifts the lock.
- All writes go through one queue and the server adds bid steps itself, so parallel clicks are never lost.

## Common tasks

Deploy a frontend change:

```bash
cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
```

Deploy a backend change:

```bash
supervisorctl restart fundraiser
```

Run the tests:

```bash
cd ~/fundraiser-app/backend && node test.js
cd ~/fundraiser-app/frontend && CI=true npx react-scripts test --watchAll=false
```

`node test.js` runs against a temporary copy of `database.json`; the real data is never touched.

Admin PIN lost: log in on the Uberspace and set a new one (replace `4711`):

```bash
cd ~/fundraiser-app/backend && supervisorctl stop fundraiser && node set-pin.js admin 4711; supervisorctl start fundraiser
```

Restore a backup:

```bash
supervisorctl stop fundraiser
cp ~/fundraiser-app/backend/data/backups/database-2026-10-12.json ~/fundraiser-app/backend/data/database.json
supervisorctl start fundraiser
```
