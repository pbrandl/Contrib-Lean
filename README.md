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
| `audit.log` | one JSON line per change (bid, withdraw, PIN change, import, …) and per login, with `rev`, IP address, browser (`ua`) and the first 8 characters of the device id – every bid can be traced to a device. Never contains PINs. |
| `backups/database-YYYY-MM-DD.json` | state before the first change of each day (UTC date), 60 days kept |
| `backups/database-YYYY-MM-DD-HHh.json` | state before the first change of each hour (UTC), 48 hours kept |
| `backups/database-…-before-import.json` | state before every import |
| `session-secret` | signs login sessions. Deleting it logs everybody out. |

## Security model

- PINs are 4–6 digits, stored as scrypt hashes, never sent to the browser, exported or logged.
- Members the admin adds one by one get a random 4-digit start PIN, shown to the admin once. Members created by an import get the PIN from the file, otherwise the shared start PIN 1234 (everybody who knows it can log in to accounts that still use it; members should change it after their first login).
- Login returns a signed session token. Members stay logged in for 30 days, admins until the tab is closed (max. 12 h).
- Every browser sends a random device id (in the login and as `X-Device` header). After a right PIN it gets a signed "trusted device" credential for that account (180 days, bound to the device id and the current PIN).
- Changing a PIN ends all older sessions of that account and the trusted-device status of all its devices.
- Own device: 5 wrong PINs on one device lock that device for that account (1 min, doubling up to 1 h). Other phones are not affected, also in the same WLAN. Pages without a device id (an old cached version) are locked per network instead (IPv4 address or IPv6 /64).
- Whole account: wrong PINs from devices that are not trusted for the account are limited to 20, then one every 18 minutes (max. 100 a day). For the admin: 10, then one every 2 hours (max. 22 a day). After that only trusted devices can log in to that account until the limit refills. With a random 4-digit PIN this means about two months on average to guess a member PIN, over a year for the admin. A trusted device that types 5 wrong PINs in a row counts as new until its next right PIN.
- There is no limit per IP address, so a whole WLAN behind one address is never blocked (tested with 600 members and 336 typos behind one address).
- A new PIN from the admin lifts all locks of that account. If the admin is locked out on all devices, set a new PIN with `set-pin.js` (see below); the restart clears all locks. Log in as admin once before an event on the device you will use, so it is trusted.
- Locks live in memory; a restart resets them.
- At most 2 PIN checks run at the same time (more wait in a queue, beyond 200 the server answers 503), so a login rush does not slow down the bids.
- Each member can make 50 changes at once, then 10 per second, so a script cannot flood the write queue.
- Request bodies are limited to 16 kB (the import: 1 MB, read only after the admin session was checked).
- The pages send a strict Content-Security-Policy (no inline scripts; `frontend/.env` keeps the build free of them), refuse to be shown in frames of other sites and set `nosniff`, `Referrer-Policy` and `Permissions-Policy` (`frontend/public/.htaccess`). The API sets its own headers.
- All writes go through one queue and the server adds bid steps itself, so parallel clicks are never lost. The audit log is written inside that queue, in the order of the changes.

## Common tasks

Deploy a frontend change (the build reads `frontend/.env`, which must be there):

```bash
cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
```

Deploy a backend change (`npm ci` only when `package-lock.json` changed):

```bash
cd ~/fundraiser-app/backend && npm ci && supervisorctl restart fundraiser
```

Check the security headers of the live site:

```bash
curl -sI https://franz.uber.space/ | grep -iE 'content-security|x-frame|nosniff|referrer|permissions'
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
