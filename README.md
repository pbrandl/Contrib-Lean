# Bietrunde – FRANZ!werk Tübingen

Members open https://franz.uber.space, pick their name, log in with their PIN and set their bid
(euros netto, with cents) and their hours per month (no target) on a full-screen sheet: a keypad on
phones and tablets, a text field on computers. A text button switches the display between netto and
brutto (× 1.19); what is stored is always netto.
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
| `database.json` | members (PINs only as scrypt hashes), bids netto (`contributions`), hours per month (`hours`), target netto. Written atomically. |
| `audit.log` | one JSON line per change (bid, withdraw, PIN change, import, …) and per login, with `rev`, IP address, browser (`ua`) and the first 8 characters of the device id – every bid can be traced to a device. Never contains PINs. |
| `backups/database-YYYY-MM-DD.json` | state before the first change of each day (UTC date), 60 days kept |
| `backups/database-YYYY-MM-DD-HHh.json` | state before the first change of each hour (UTC), 48 hours kept |
| `backups/database-…-before-import.json` | state before every import |
| `session-secret` | signs login sessions. Deleting it logs everybody out. |

## Security model

- PINs are 4–8 digits, stored as scrypt hashes, never sent to the browser, exported or logged.
- Members the admin adds one by one get a random 4-digit start PIN, shown to the admin once. Members created by an import get the PIN from the file, otherwise the shared start PIN 1234 (everybody who knows it can log in to accounts that still use it; members should change it after their first login).
- Login returns a signed session token. Members stay logged in for 30 days, admins until the tab is closed (max. 12 h).
  A member is logged out earlier by "Abmelden", by the back gesture on their own page (on purpose, so nobody stays logged in on a borrowed phone), by any PIN change (it ends all other sessions of that account) and by clearing the browser data or a private window.
  The login is stored per browser: a member who opened the link from the mail inside the mail app's own browser (Gmail, Outlook) and later opens the page in Safari or Chrome has to type the PIN again there.
- Every browser sends a random device id (in the login and as `X-Device` header). After a right PIN it gets a signed "trusted device" credential for that account (180 days, bound to the device id and the current PIN).
- Changing a PIN ends all older sessions of that account and the trusted-device status of all its devices.
- Own device: 5 wrong PINs on one device lock that device for that account (1 min, doubling up to 1 h). Other phones are not affected, also in the same WLAN. Pages without a device id (an old cached version) are locked per network instead (IPv4 address or IPv6 /64).
- Per account and network (IPv4 address or IPv6 /64): wrong PINs from devices that are not trusted for the account are limited to 20, then one every 18 minutes. For the admin: 10, then one every 2 hours. An attacker elsewhere therefore only uses up the budget of their own network, never the one of the meeting.
- Per account across all networks, against guessing with many addresses: 100, then 100 a day (admin: 30, then one an hour). This does not apply to the network the admin logged in from in the last 24 hours, i.e. the meeting's WLAN once the admin has logged in there. With a random 4-digit PIN this means about seven weeks on average to guess a member PIN, more than half a year for the admin.
- When a budget is used up, only trusted devices can log in to that account from there until it refills. A trusted device that types 5 wrong PINs in a row counts as new until its next right PIN. Only one PIN check per device and account runs at a time.
- There is no limit per IP address alone, so a whole WLAN behind one address is never blocked (tested with 600 members and 336 typos behind one address).
- A new PIN from the admin lifts all locks of that account. If the admin is locked out on all devices, set a new PIN with `set-pin.js` (see below); the restart clears all locks.
- At an event: log in as admin once on the device you will use (it becomes trusted), and once over the meeting's WLAN at the start (that network becomes exempt from the account-wide limit).
- Locks live in memory; a restart resets them.
- At most 2 PIN checks (logins and new PINs) run at the same time; more wait in a queue where trusted devices and new devices take turns. If the expected wait is over 8 s or more than 200 are waiting, the server answers 503, so a login rush does not slow down the bids. Logins whose page has already given up are skipped.
- Each member can make 50 changes at once, then 10 per second, so a script cannot flood the write queue.
- Request bodies are limited to 16 kB (the import: 1 MB, read only after the admin session was checked).
- The pages send a strict Content-Security-Policy (no inline scripts; `frontend/.env` keeps the build free of them), refuse to be shown in frames of other sites and set `nosniff`, `Referrer-Policy` and `Permissions-Policy` (`frontend/public/.htaccess`). The API sets its own headers.
- All writes go through one queue, and the audit log is written inside it, in the order of the changes. A bid is sent as the new total (netto), not as a step, so a page that gets no answer simply sends it again and nothing is doubled. Pages loaded before the October 2026 update still send steps with a request id; the server keeps accepting those and counts each step once.
- Admin pages from before an update (no device id) still get the start PIN 1234 when they add a member, because that is what they show.

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
