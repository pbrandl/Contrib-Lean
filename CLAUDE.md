# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Bietrunde" of the FRANZ!werk Tübingen: members pick their name, log in with a PIN and set a money bid (netto, with cents) and the hours per month they can contribute, each on a full-screen sheet (keypad on touch devices, text field on computers). Admins manage members, PINs, the target ("Bedarf") and import/export at `/admin`. Live at https://franz.uber.space on an Uberspace host. `README.md` has the operations guide (data folder, backups, PIN reset, restore).

- `backend/`: Express 4, everything in `server.js`, no database (one JSON file).
- `frontend/`: Create React App (react-scripts 5) with React 19 and Tailwind 3.

User-facing text is German and uses "du". Server error messages are shown to users as they are (`HttpError` message → `ApiError` message in the frontend), so write them in German. Code and comments are in English.

## Commands

Backend (`backend/`):

```bash
npm ci
node server.js                      # env: PORT (3001), HOST, DATA_DIR (./data)
node test.js                        # copies data/database.json to a temp dir, starts the server on a random port
node test.js /nonexistent           # same, but against a fresh database (admin PIN 0000)
```

`test.js` is one sequential script: later checks reuse tokens and members from earlier ones, so a single check cannot run on its own. The admin checks log in with PIN `0000`. Against a copy of a real database where the admin PIN was changed they fail, so use a fresh database. It uses global `fetch` (Node 18+).
It replaces `Date.now` with an adjustable clock: every check starts 10 s later (that refills the write budgets), and lock checks move the clock forward instead of waiting.

Frontend (`frontend/`):

```bash
npm ci
CI=true npx react-scripts test --watchAll=false                      # all tests
CI=true npx react-scripts test --watchAll=false src/csv.test.js      # one file
CI=true npx react-scripts test --watchAll=false -t "round-trips"     # one test by name
CI=true npm run build               # ESLint runs inside the build; CI=true turns warnings into errors
```

`frontend/.env` sets `INLINE_RUNTIME_CHUNK=false`. Keep it: the Content-Security-Policy in `public/.htaccess` forbids inline scripts, and without it the built `index.html` would contain one.

There is no separate lint script. `npm start` has no dev proxy and the backend sends no CORS headers, so the dev server cannot reach the API. To run the whole app locally, serve the build from the backend's own `app`: require `backend/server.js`, add `express.static('frontend/build')` and a `/admin` route that sends `index.html`, then call `start()`.

Deploy on the Uberspace (from README):

```bash
cd ~/fundraiser-app/frontend && npm run build && rsync -a --delete build/ ~/html/
supervisorctl restart fundraiser
```

## Architecture

### Hosting

Apache serves the frontend build from `~/html`. `public/.htaccess` rewrites `/admin` to `index.html`, and `App.js` picks `AdminApp` or `MemberApp` from the path. The Uberspace web backend forwards `/api` **with the full path** to the supervisor service `fundraiser` on port 3001, so every route lives on the `/api` router. `trust proxy` is `1` (exactly one proxy), so `req.ip` is the client address from `X-Forwarded-For`.

### Data (`backend/data/`)

`database.json` contains `{ rev, users, contributions, hours, targetAmount }`:

- `users`: `{ id, name, pinHash, pinVersion, defaultPin }`. The admin is the user with id `admin`. Member ids are `Date.now()`-based strings.
- `contributions` / `hours`: maps from user id to value. They only hold values > 0; `setContribution`/`setHours` delete the key at 0.
- `rev`: grows with every write.

Next to it: `audit.log` (one JSON line per change and per login, with `rev`, `ip`, `ua` and an 8-character device prefix; never a PIN), `backups/` (daily and hourly copies, plus one before every import; a failing backup is logged and does not stop the write) and `session-secret` (only created when missing or shorter than 32 bytes; an unreadable file stops the start). `migrateDatabase()` runs at startup and converts the old plain-text-PIN format.

### Write path (keep these invariants)

- **Every change goes through `mutate(change)`.** It is a single promise queue: it re-reads the file, runs `change(data, log)`, increments `rev`, makes the backups and writes atomically (tmp file + fsync + rename). Throwing an `HttpError` inside `change` aborts without writing. Reads (`authenticate`, `/public`) read the file directly, outside the queue.
- **Audit lines are recorded with `log(event, details)` inside `change`**; `mutate` writes them after the database, still inside the queue, with the new `rev`. Add `...requestInfo(req)` (ip, ua, device prefix) to every line. Login and failed login are logged with `audit()` directly (they change no data).
- **scrypt never runs inside the queue:** routes hash a new PIN first and pass it as `setPin(user, pin, { hash })`. Only `migrateDatabase` and the import still hash inside.
- Member write routes go through `limitWrites` (per-member budget: 50, then 10 per second, else 429).
- **Bids and hours are absolute values:** `PUT /me/contribution {amount}` (netto, rounded to cents) and `PUT /me/hours {hours}` (rounded to 0.1 h). Writing the same value twice changes nothing, so `MemberPage.save` retries a request without an answer (status 0) up to 3 times.
- **Old pages:** `POST /me/contribution {delta, request}` and `POST /me/contribution/withdraw` stay only for pages loaded before the October 2026 update. Their steps are idempotent per request id (the last 20 per member in `data.requests`) and limited to `MAX_STEP`. The current frontend does not use them.
- **Every state response carries `rev` and `boot`.** Responses can overtake each other, and the frontend's `apply()` (MemberApp and AdminApp, via `isNewer` in `lib.js`) drops any response whose `rev` is older than what it shows, unless `boot` changed (server restart, e.g. after restoring a backup with a lower `rev`). New endpoints that return state must include `summary(data)`.

### Sessions and login

- Tokens are stateless HMAC-signed payloads `{ uid, pv, role, exp }`. `authenticate(role)` checks the signature, the role and that `pv` equals the user's current `pinVersion`, so every PIN change (`setPin`) ends all older sessions.
- PIN-change endpoints return a fresh `session`, and the frontend must store it. `AdminApp.logout` ignores a 401 from a request that used an older token.
- Members keep the token in `localStorage` (30 days), admins in `sessionStorage` (12 h); see `memberSession`/`adminSession` in `lib.js`.
- **Login throttling** (in memory, lost on restart; README "Security model" has the numbers). Never key anything by IP alone: the whole meeting shares one address.
  - Every browser sends a device id (`deviceId()` in `lib.js`, 22 base64url characters, in the login body and as `X-Device` header).
  - Own-device lock: `deviceFailures`, keyed `userId|d:<device>`; pages without a device id fall back to `userId|n:<IPv4 or IPv6 /64>` (`networkOf`).
  - Budgets for devices that are not trusted, taken before scrypt and given back on a right PIN (`takeAttempt`/`returnAttempt`): `networkBudgets` per account and network, and `accountBudgets` per account across all networks except `trustedNetworks` (where the admin logged in within 24 h). Never make a budget that the meeting's network shares with the rest of the internet: a remote attacker could then lock out the meeting.
  - `loginsInFlight`: one PIN check per lock key at a time.
  - Trusted device: after a right PIN the login returns `trust`, signed with `trustKey` (derived from the session secret) over `{uid, did, pv, exp}`. The frontend keeps it per account (`rememberTrust`/`trustFor`) and sends it with the next login; it skips the account budget, not the own-device lock.
  - Everything that rejects an attempt runs before scrypt. `withPinSlot` runs at most 2 scrypt at a time for logins (`checkPinLimited`) and new PINs (`hashPinLimited`). Trusted and new devices take turns; it answers 503 when the expected wait exceeds 8 s or 200 are waiting, and it skips requests whose connection is gone.
  - An admin PIN reset (`clearFailedLogins`) lifts all locks and refills the budget.
- Members the admin adds get a random start PIN (`randomStartPin`, never 1234/0000), returned once as `added.startPin` and shown in `AdminApp` until closed. Imported members get the PIN from the file (the owner puts random ones there; nobody has 1234), and only without one `DEFAULT_PIN`. File PINs do not count as start PINs (`defaultPin` false).

### Response shapes and privacy

- `summary()`, `memberView()` and `adminView()` build every response. `/public` returns the member names and the totals only.
- **Individual bids are anonymous by design.** The admin screen must not show who bid what; only the export contains single bids.
- No response or export may ever contain `pin`/`pinHash`; `test.js` checks this.

### Import and export

- CSV is parsed and written in the browser (`frontend/src/csv.js`). It accepts `,` or `;`, German number formats and a BOM, and guards against spreadsheet formulas. The browser always sends JSON to `POST /admin/import`.
- The import replaces all members, bids and hours. It matches existing members by id, then by name (case-insensitive, `sameName`). Matched members keep their PIN unless the file sets one; new members get `DEFAULT_PIN`. A backup is written first.

### Frontend structure

- `lib.js`: the `api()` wrapper (throws `ApiError` with `status`, `retryAfter` and `timeout`; 401 means log out; status 0 means no answer, after 15 s at the latest), device id and trusted-device storage, `loginWithPin`, `isNewer`, session storage, de-DE formatting (`formatNumber` with cents, `formatWhole` for totals), netto/brutto (`toGross`, `toNet`, `inMode`, `useAmountMode` stores the display mode per device), `parseAmount`, `usePolling` (pauses while the tab is hidden and refreshes when it becomes visible again) and `useNotice`.
- `ui.js`: shared components (`Band` header, `TopBar`, `Progress`, `ModeToggle`, `PinLogin`, `PinChange`, `Callout`, `Notice` banner at the top).
- `entry.js`: the typing rules of the sheet (`pressKey`, `sanitize`, `fromText`, `toRaw`, `formatRaw`, limits in `KINDS`). `AmountSheet.js`: the full-screen sheet with the totals preview; `usesKeypad()` picks the keypad (`pointer: coarse`) or the text field.
- `MemberApp.js`:
  - `FrontPage`: name list, search, PIN step.
  - `MemberPage`: bid and hours card, the sheet, PIN change.
  - Both use the History API so the phone's back gesture works: the PIN step pushes an entry, an open sheet pushes one (back closes it), and leaving the member page logs out.
- Polling intervals: front page 15 s (paused in the PIN step), member page 10 s (skipped while saving), admin 15 s.
- Styling: Tailwind with a custom palette in German names (`gelb`, `werkblau`, `blau`, `tinte`, `ziegel`, `papier`, `gruen`, …) and component classes in `index.css` (`.btn-*`, `.card`, `.field`, `.wrap` for the 16 px gutter, `.topbar*`, `.stat-*`, `.big-btn`, `.text-button`, `.sheet*`, `.key`, `.save`, `.notice*`, `.collapse-head`). The root font size is 106.25 %, and inputs stay at 16 px or more so iOS does not zoom.
- The layout must work down to 320 px width. Check 320, 360 and 375 px, not just 390 px.

### Rules duplicated between client and server

If you change one of these, update both sides:

| Rule | Server | Client |
|---|---|---|
| PIN 4–6 digits | `PIN_PATTERN` | `isPin`, `csv.js` |
| Max. hours 744 | `MAX_HOURS` | `MAX_HOURS` in `entry.js` |
| Device id: 22 base64url characters | `DEVICE_PATTERN` | `DEVICE_PATTERN`, `randomDeviceId` in `lib.js` |
| Name max. 60 characters | `MAX_NAME_LENGTH` | `maxLength` in `AdminApp` |
| Start PIN 1234, admin PIN 0000 | `DEFAULT_PIN`, `ADMIN_DEFAULT_PIN` | texts in `AdminApp` |
| Max. bid 1,000,000 € netto | `MAX_AMOUNT` | `KINDS.money.maxInt` (6 digits) in `entry.js` |
| Cents for euros, 0.1 h for hours | `requireAmount`, `requireHours` | `KINDS` in `entry.js`, `round1` in `AmountSheet.js` |
| Brutto = netto × 1.19 in whole cents | `VAT_PERCENT`, `toGross` | `VAT_PERCENT`, `toGross` in `lib.js` |

## Product decisions

- The features are sufficient for now; do not add new ones unless asked.
- Anonymity of bids is intended (see above).
- The public name list is acceptable because the app is used only temporarily.
- Hours have no target. The maximum stays 744 h per month.
- Amounts are netto. Brutto (× 1.19) is only a display option for members and the admin; exports contain both.
- The bidding takes place **at a members' meeting where everyone is on the same WLAN**, so many phones share one public IP and log in at the same time.

## Open work (agreed October 2026)

Remove items here once they are done.

1. JSON import preview: the total only reads `contributions[id]`, while the server also accepts `contribution` per user. Also show the hours sum in the CSV and JSON preview.
2. Small fixes:
   - Backup file names use the UTC date and hour.
   - `set-pin.js` always sets `defaultPin: false`.

Done in October 2026: the new bidding flow (see the next section), and the security hardening for the meeting: login locks per device instead of per IP, per-account limit with trusted devices, scrypt limiter, audit log with address/browser/device inside the write queue, `npm audit` clean (express 4.22.3), security headers and CSP, request timeout, random start PIN for admin-added members, body limits, write budget, hourly backups, input normalization.

Deferred or not wanted:

- Random start PINs generated by the import itself: not needed, the owner sets random PINs in the import file.
- CSV export for German Excel (semicolon and decimal comma): not wanted.
- Longer admin PIN: not wanted; the admin should simply choose 6 digits.

## New bidding flow (agreed spec)

Implemented in October 2026 (`AmountSheet.js`, `entry.js`, `MemberPage`, `AdminApp`). The section stays as the spec: change the app and this text together.

Reference prototype: `docs/gebotseingabe-entwurf.html`. It is a standalone page with example data; open it in a browser. It was reviewed on a phone, and its layout and its `pressKey`, `sanitize`, `evaluate` and `toNet` functions are the agreed behavior. The FRANZ!werk logo is left out of it on purpose; the app keeps its logo.

### Amounts

- Everything is stored, sent, imported and summed **netto**. Brutto is netto × 1.19, rounded to the cent, and is for display only.
- Members type euros with up to 2 decimals (e.g. 10,87) and hours with 1 decimal. The maximum stays 744 h; the server rounds hours to 0.1 h instead of 0.5 h.
- The typed value **replaces** the previous bid. 0 withdraws the bid, so the Reset button goes away.
- In brutto mode the member types brutto. The netto value is brutto / 1.19, rounded **up** to the cent. A 1-cent difference when it is shown as brutto again is accepted.
- The total of all bids and the Bedarf next to it (header and keypad sheet) are shown rounded to whole euros. Own bids keep their cents. The server keeps the exact sum.

### Backend

- `PUT /me/contribution {amount}`: netto, 0 to `MAX_AMOUNT`, rounded to cents, like `PUT /me/hours`. The old delta routes stay for cached pages only (see "Write path").
- `rev` in the response and the audit line with from/to.
- Export: CSV gets a `contribution_gross` column next to `contribution` (netto), JSON a `contributionsGross` map next to `contributions`. The import keeps reading the netto values and ignores the brutto ones.

### Member page

- **Header:**
  - Total of all bids with "von X €" (no "Bedarf", no "netto").
  - Total hours with "pro Monat"; this is the only "pro Monat" on the page.
  - Progress bar.
  - It must fit down to 320 px: numbers wrap to a new line instead of being cut off.
  - Generous spacing between the top bar, the numbers, the bar and the line below it, so it does not look crowded. The values are in the prototype CSS (`.topbar`, `.stats`, `.track`, `.meta`, `.band-inner`).
  - Top bar: wordmark/logo left, the member's name centered, "Abmelden" right. "Abmelden" is plain text without padding or highlight, in the same font size as the name.
  - "Abmelden" and the total hours are beige, like the start-PIN notice (`#FFF8D2` at 85 %).
  - Outside the page (overscroll, the phone's safe areas) only the top is blue; below the content the light page colour continues, never a blue strip at the bottom.
- **Card "Dein Beitrag"** (the same word as the keypad title; texts about the own bid say "Beitrag", the header count stays "N Gebote"):
  - Heading left, netto/brutto toggle right on the same line.
  - Below it: own bid (€) left and own hours (h) right, in the same font size and without labels.
  - Below that: two equal buttons "Beitrag ändern" (left) and "Stunden ändern" (right), both light blue (`blau-hell`), not yellow, text only without icons.
- **Netto/brutto toggle:**
  - A plain text button that shows the current mode ("Netto"/"Brutto"), slightly smaller than body text and grey.
  - No padding (the text ends flush with the card edge), no background, no hover highlight.
  - It switches every amount on the member page, including the keypad sheet. The sheet has no toggle of its own: what the member types counts in the mode set on the member page.
  - The choice is stored per device; default is netto.
  - There are no other "netto"/"brutto" labels on the member page.
- **What goes away:**
  - The old PIN card and the start-PIN hint ("Du nutzt noch die Start-PIN"): not needed, because every member has a random PIN. "PIN ändern" stays as a plain grey text button centered below the card, styled like the Netto toggle.
  - The separate `HoursCard`. This replaces the old open items about the clipped hours field and the clipped header.
- **Front page before login:** it has no toggle, so its header says "von X € netto".

### Keypad sheet (touch devices, `pointer: coarse`, including tablets)

A tap on "Beitrag ändern" or "Stunden ändern" opens a full-screen dark blue sheet. It must fit on one screen without scrolling on every touch device.

- **Top:** close button (X) and the title "Dein Beitrag" / "Dein Stundenbeitrag".
- **Totals strip:**
  - Euros: the total of all bids as "X € von Y €" with a thin progress bar.
  - Hours: "N h pro Monat", without bar.
  - No "Alle Gebote" label.
  - The number and "von Y €" are centered.
  - While the member types, the strip previews the change in grey. The number shows the new total in grey (the others' sum plus the new value, converted to netto in brutto mode). The yellow bar shows the smaller of the saved and the new total, so it shrinks when the bid goes down. A grey bar behind it reaches to the larger of the two: it shows the added amount when the bid goes up and the removed amount when it goes down. The yellow bar always keeps its rounded end. Both bars animate their width together (about 0.3 s). While nothing changed, the grey bar is only hidden at the width of the current total, not shrunk to 0, so it never grows in from the left. With an empty or unchanged input everything is yellow and shows the current totals. Hours work the same way (number only, no bar).
- **Entered value:**
  - Shown large. It starts with the current bid (or hours) already filled in, so a small change needs only a few keys: backspace, then the new digits. When everything is deleted it shows a dimmed "0" and counts as 0, the same as typing 0: the preview leaves the own bid out, and "Speichern" withdraws it.
  - No hint lines below it. Hours above 744 cannot be typed at all: the key is ignored.
- **Keypad:**
  - The page's own keypad, not the phone keyboard: 1–9, comma, 0, backspace.
  - Euros: at most 6 integer digits and 2 decimals. Hours: at most 3 integer digits and 1 decimal.
  - The rows shrink on short screens, but not below 44 px.
- **Bottom right:** "Speichern" (yellow), disabled until the value is valid and differs from the current one.
- **Physical keys** also work: digits, comma or period, Backspace, Enter saves, Esc closes.
- **Phones in landscape** (less than 540 px high): the amount is on the left, the keypad and "Speichern" on the right, so it still fits. Should a screen be too short even for that, the sheet scrolls.

### Banners (whole app: member page, front page and admin)

The notices from `useNotice`/`Notice` in `ui.js` change:

- **Position:** at the top of the screen instead of the bottom, below the safe area, sliding in from above.
- **Colour:**
  - Saved changes: dark green (`#23774A`) with white text and a white check mark.
  - Errors: `ziegel` with white text.
  - Never white on the white page.
- **Texts:** no "Gespeichert:" prefix, because the check mark already says it. For example "Dein Beitrag ist jetzt 1.600 €.", "Dein Beitrag ist zurückgezogen.", "Dein Stundenbeitrag ist jetzt 12 h.".
- **Behaviour:** confirmations still disappear on their own; a tap closes a banner.

### Desktop (fine pointer)

The same full-screen sheet as on touch devices (title, totals strip with preview bar, "Speichern" bottom right), without the keypad. In place of the keypad's amount display the amount is a text field:
- It gets the focus when the sheet opens and starts with the current value, centered like the keypad's amount.
- A blinking yellow bar right after the number shows that you can type: square ends, from the top of the digits to a little below the baseline. The browser's own cursor is hidden, and the cursor always stays at the end.
- Digits, comma or period (both mean the decimal comma) and Backspace follow the keypad's rules (`pressKey`): the same limits and the thousands separator while typing. Arrow keys do nothing, other characters are ignored, and paste keeps the valid part.
- Enter saves, Esc closes. A click anywhere on the sheet puts the cursor back into the field.
- There are no hint lines, and hours above 744 cannot be typed.

### Admin page

- **"Einstellungen":**
  - A new section holding the same netto/brutto text toggle, plus the Admin-PIN change.
  - The toggle only affects the admin's own display.
  - The Bedarf is always entered netto ("Neuer Bedarf in Euro (netto)").
- **Member list:**
  - Collapsible, and collapsed by default.
  - Its header shows "N Mitglieder, M davon mit Start-PIN".
- **Anonymity is unchanged:** the admin sees no individual bids outside the export.
