# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Bietrunde" of the FRANZ!werk Tübingen: members pick their name, log in with a PIN and set a money bid (netto, with cents) and the hours per month they can contribute, each on a full-screen sheet (keypad on touch devices, text field on computers). Admins manage members, PINs, the target ("Bedarf") and import/export at `/admin`. Live at https://franz.uber.space on an Uberspace host. Current version: 2.0.0 (`CHANGELOG.md`). `README.md` has the operations guide (data folder, backups, PIN reset, restore), `DEPLOY.md` (German, for the owner) the way to install a new version.

- `backend/`: Express 4, everything in `server.js`, no database (one JSON file).
- `frontend/`: Create React App (react-scripts 5) with React 19 and Tailwind 3.

User-facing text exists in German (main language, "du"), English and Spanish, all in `frontend/src/i18n/{de,en,es}.js`; never write a visible text into a component. Server errors carry a `code` and `params` (`HttpError(status, message, retryAfterMs, code, params)`), and the frontend shows `errors.<code>` in the page's language; the German `message` stays for the log and older pages. Code and comments are in English.

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

`frontend/.env` sets `INLINE_RUNTIME_CHUNK=false`. Keep it: the Content-Security-Policy in `public/.htaccess` forbids inline scripts, and without it the built `index.html` would contain one. It also sets `REACT_APP_DEMO=0`, so the flag is a build-time constant and the normal build drops the demo backend (and keeps the XLSX code as a lazy chunk, see `files.js`).

There is no separate lint script. `npm start` has no dev proxy and the backend sends no CORS headers, so the dev server cannot reach the API. To run the whole app locally, serve the build from the backend's own `app`: require `backend/server.js`, add `express.static('frontend/build')` and a `/admin` route that sends `index.html`, then call `start()`.

Demo (no server, example data, neutral branding; `src/demo.js` replaces the API in the browser when `REACT_APP_DEMO=1`):

```bash
npm run build:demo                  # frontend/build-demo/bietrunde-demo.html, one self-contained page
```

The owner publishes that page as a Claude artifact. It must not go on the live server: next to the real app it would lead visitors to the real member list.

Deploy on the Uberspace: `DEPLOY.md`. A new version is unpacked into its own folder (`~/fundraiser-app-vX`), gets `node_modules` copied (or `npm ci` when a lockfile changed), is tested and built there, and then the service is stopped, `backend/data` copied over and the folders swapped; the old folder stays as the way back. When you write commands for the owner:

- One command per line, never `&&` chains. Once a pasted line merged `~/html/` with the next `cd`, `rsync --delete build/ ~/html/cd ~/fundraiser-app/backend` took the backend folder as its target and emptied it, data included; it was restored from the copy made before the update.
- `rsync --delete` only with full source and target paths (`rsync -a --delete ~/fundraiser-app/frontend/build/ ~/html/`).
- Before any update, a full copy of `~/fundraiser-app` (code and data) must exist; the swap in `DEPLOY.md` keeps the old folder for that.
- The service is `~/etc/services.d/fundraiser.ini` (`directory=%(ENV_HOME)s/fundraiser-app/backend`, `command=node server.js`, `PORT="3001"`, `NODE_ENV="production"`, and `startsecs=30` set by Uberspace). So `supervisorctl start` only returns after about 30 seconds, while the app already answers after one; say so, or it looks hung. The path stays the same across the folder swap, so the ini never changes.

## Architecture

### Hosting

Apache serves the frontend build from `~/html`. `public/.htaccess` rewrites `/admin` to `index.html` and serves `index.html` as `ErrorDocument 404`; `App.js` picks `AdminApp`, `MemberApp` or `NotFoundPage` from the path. While the service is stopped, the Uberspace proxy answers `/api` with 502/503/504 and HTML; `api()` turns that (and only that, the server's own errors are JSON) into `ApiError.maintenance`, and the pages show `MaintenancePage`, which retries every 5 s. The Uberspace web backend forwards `/api` **with the full path** to the supervisor service `fundraiser` on port 3001, so every route lives on the `/api` router. `trust proxy` is `1` (exactly one proxy), so `req.ip` is the client address from `X-Forwarded-For`.

### Data (`backend/data/`)

`database.json` contains `{ rev, users, contributions, grossBids, hours, targetAmount }`:

- `users`: `{ id, name, pinHash, pinVersion, defaultPin }`. The admin is the user with id `admin`. Member ids are `Date.now()`-based strings.
- `contributions` / `hours`: maps from user id to value. They only hold values > 0; `setContribution`/`setHours` delete the key at 0. `contributions` is always netto and is what every sum uses.
- `grossBids`: the brutto amount for members who typed their bid brutto. That amount is leading: it is shown and exported as typed, and `contributions` holds the netto derived from it (`toNet`, rounded up). A netto bid or a withdrawal (amount 0) removes the entry (`setContribution`). `grossOf()` gives the brutto of any bid.
- `rev`: grows with every write.

Next to it: `audit.log` (one JSON line per change and per login, with `rev`, `ip`, `ua` and an 8-character device prefix; never a PIN), `backups/` (daily and hourly copies, plus one before every import; a failing backup is logged and does not stop the write) and `session-secret` (only created when missing or shorter than 32 bytes; an unreadable file stops the start). `migrateDatabase()` runs at startup and converts the old plain-text-PIN format.

### Write path (keep these invariants)

- **Every change goes through `mutate(change)`.** It is a single promise queue: it re-reads the file, runs `change(data, log)`, increments `rev`, makes the backups and writes atomically (tmp file + fsync + rename). Throwing an `HttpError` inside `change` aborts without writing. Reads (`authenticate`, `/public`) read the file directly, outside the queue.
- **Audit lines are recorded with `log(event, details)` inside `change`**; `mutate` writes them after the database, still inside the queue, with the new `rev`. Add `...requestInfo(req)` (ip, ua, device prefix) to every line. Login and failed login are logged with `audit()` directly (they change no data).
- **scrypt never runs inside the queue:** routes hash a new PIN first and pass it as `setPin(user, pin, { hash })`. Only `migrateDatabase` and the import still hash inside.
- Member write routes go through `limitWrites` (per-member budget: 50, then 10 per second, else 429).
- **Bids and hours are absolute values:** `PUT /me/contribution {amount}` (netto, rounded to cents) or `{gross}` (brutto typed by the member, stored in `grossBids`), and `PUT /me/hours {hours}` (rounded to 0.1 h). Responses carry `contribution` (netto), `contributionGross` and `totalRaisedGross` next to `totalRaised`. Writing the same value twice changes nothing, so `MemberPage.save` retries a request without an answer (status 0) up to 3 times.
- The step-wise routes of the first version (`POST /me/contribution {delta, request}`, `POST /me/contribution/withdraw`) and the start PIN 1234 for admin pages without a device id were removed in 1.0.0; `readDatabase` drops the old `requests` key.
- **Every state response carries `rev` and `boot`.** Responses can overtake each other, and the frontend's `apply()` (MemberApp and AdminApp, via `isNewer` in `lib.js`) drops any response whose `rev` is older than what it shows, unless `boot` changed (server restart, e.g. after restoring a backup with a lower `rev`). New endpoints that return state must include `summary(data)`.

### Sessions and login

- Tokens are stateless HMAC-signed payloads `{ uid, pv, role, exp }`. `authenticate(role)` checks the signature, the role and that `pv` equals the user's current `pinVersion`, so every PIN change (`setPin`) ends all older sessions.
- PIN-change endpoints return a fresh `session`, and the frontend must store it. `AdminApp.logout` ignores a 401 from a request that used an older token.
- Members keep the token in `localStorage` (30 days), admins in `sessionStorage` (12 h); see `memberSession`/`adminSession` in `lib.js`. Earlier logouts: the back arrow or the browser's back button on the member page, any PIN change, cleared browser data. The token is per browser, so a mail app's built-in browser and Safari/Chrome log in separately.
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

- `frontend/src/files.js` lists the export formats (`EXPORT_FORMATS`: XLSX, CSV, JSON; the admin page offers them in a select next to "Herunterladen", the choice is kept in `localStorage`) and reads import files: `readImportFile` decides by the first bytes (zip = XLSX, `{`/`[` = JSON, old `.xls` gets an explanation, everything else is CSV, UTF-8 or Windows-1252). A new format is one entry there.
- XLSX (`xlsx.js`, with `fflate` for the zip, loaded on demand): `writeXlsx` writes one sheet with inline strings, numbers, a bold frozen header row and the default cell style Excel expects; `readXlsx` reads the first sheet (shared or inline strings, cell references) into the same `{ line, cells }` rows as the CSV parser. CSV and XLSX share `memberRows`/`membersFromRows` in `csv.js`, so both have the same columns and import again.
- CSV is parsed and written in the browser (`frontend/src/csv.js`). It accepts `,` or `;`, German number formats and a BOM, and guards against spreadsheet formulas. The browser always sends JSON to `POST /admin/import`.
- Export: `contributionsGross` and `enteredAs` (`brutto`/`netto`) per bid; the CSV has `contribution_gross` and `entered_as`. The import keeps a brutto amount only where `enteredAs` is `brutto`; otherwise it reads the netto value.
- The import replaces all members, bids and hours. It matches existing members by id, then by name (case-insensitive, `sameName`). Matched members keep their PIN unless the file sets one; new members get `DEFAULT_PIN`. A backup is written first.

### Languages, settings and theme

- `i18n/index.js`: `LANGUAGES` (code, name, `Intl` locale, messages), `t(key, params)` with `{placeholders}` and `{ one, other }` plurals (via `Intl.PluralRules`), fallback to German. A new language: copy `de.js`, translate, add one line; `i18n.test.js` checks that every language has the same keys and placeholders as German. Number formats follow the language (`locale()` in `lib.js`); typing amounts too (`decimalSign`/`groupSign`, `fromField`, `isDecimalKey` in `entry.js`: in English only "." is decimal).
- `settings.js`: `SETTINGS` describes the per-device settings (`theme`: system/light/dark, `language`, `amounts`: netto/brutto) with their initial values (browser language, the version-1 `franzwerk.mode`); stored in `franzwerk.settings`. `SettingsProvider` (in `App.js`) applies the theme (class `dark` on `<html>`, following the device for `system`) and the language; `useT()` gives `t` and re-renders on a language change, `useAmountMode()` replaces the old per-page mode. A new setting: one entry in `SETTINGS` plus texts `settings.<key>.label/.hint/.<option>`; `SettingsPage.js` renders it.
- The settings page shows one card with a row per setting; the options are plain text (the chosen one dark and underlined in `akzent`), radio inputs underneath. No segmented buttons: the owner finds them ugly.
- The settings page lies over every page (`Shell` in `App.js`, the page below is `inert` and keeps its state) and has its own history entry; `SettingsButton` (gear) sits in the top bar, the front page header, the PIN screen, the status screens and the offline page. `FrontPage`'s popstate handler keeps the PIN step when only the settings entry is popped.
- Dark mode: the palette in `tailwind.config.js` reads CSS variables (`--c-*`, RGB channels) defined in `index.css` for `:root` and `.dark`. Cards stand off the page with a 1 px `ring-tinte/[0.07]` and `shadow-card`; keep that contrast (the owner asked for it). Use the palette (`bg-flaeche` for cards and fields instead of `bg-white`, `text-akzent` for brand-blue text on light surfaces, `text-tinte`, `bg-papier`) and new components follow the theme by themselves. The dark blue screens (PIN, sheet, status) and the header look the same in both.
- Tests render pages with `render` from `src/test-utils.js` (inside `SettingsProvider`); `setupTests.js` makes the browser ask for German and resets the settings before every test.

### Frontend structure

- `lib.js`: the `api()` wrapper (throws `ApiError` with `status`, `retryAfter`, `timeout` and `code`, the message already translated by `errorMessage`; 401 means log out; status 0 means no answer, after 15 s at the latest), device id and trusted-device storage, `loginWithPin`, `isNewer`, session storage, formatting in the page's language (`formatNumber` with cents, `formatWhole` for totals), netto/brutto (`toGross`, `toNet`, `inMode`), `parseAmount`, `usePolling` (pauses while the tab is hidden and refreshes when it becomes visible again) and `useNotice`.
- `ui.js`: shared components (`Band` header, `TopBar`, `SettingsButton`, `Progress`, `PinLogin`, `PinChange`, `Callout`, `Notice` banner at the top, `BusyButton`, `Spinner`, `LoadingPage`).
- **Every button that waits for the server is a `BusyButton`** (`busy`, `busyLabel` for screen readers, `disabled` only for "not possible yet"). While busy it looks the same and ignores clicks; after 0.2 s (`useDelayed`) a spinner replaces its content and the button keeps its width. No "Wird … …" texts on buttons.
- `entry.js`: the typing rules of the sheet (`pressKey`, `sanitize`, `fromText`, `toRaw`, `formatRaw`, limits in `KINDS`). `AmountSheet.js`: the full-screen sheet with the totals preview. `usesKeypad()` in `lib.js` picks the keypad (`pointer: coarse`) or the keyboard, for the sheet and the PIN entry.
- Admin member list: a tap on a row opens `MemberEditor` (name, new PIN, delete behind a question); it saves with `PATCH /api/admin/users/:id { name?, pin? }`, one write and audit line(s) `user_renamed`/`pin_changed`. The old `PUT .../pin` stays for the admin's own PIN.
- `demo.js`: the demo backend (routes, responses and error codes of `server.js` in the browser, 24 example members, state in `localStorage`); `App.js` shows a demo strip and switches to the admin view with `#admin`. `scripts/demo-inline.py` turns the demo build into one page.
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
| PIN 4–8 digits | `PIN_PATTERN` | `isPin`, `csv.js` |
| Max. hours 744 | `MAX_HOURS` | `MAX_HOURS` in `entry.js` |
| Device id: 22 base64url characters | `DEVICE_PATTERN` | `DEVICE_PATTERN`, `randomDeviceId` in `lib.js` |
| Name max. 60 characters | `MAX_NAME_LENGTH` | `maxLength` in `AdminApp` |
| Start PIN 1234, admin PIN 0000 | `DEFAULT_PIN`, `ADMIN_DEFAULT_PIN` | texts in `AdminApp` |
| Max. bid 1,000,000 € netto | `MAX_AMOUNT` | `KINDS.money.maxInt` (6 digits) in `entry.js` |
| Cents for euros, 0.1 h for hours | `requireAmount`, `requireHours` | `KINDS` in `entry.js`, `round1` in `AmountSheet.js` |
| Brutto = netto × 1.19 in whole cents; brutto typed → netto rounded up | `VAT_PERCENT`, `toGross`, `toNet` | `VAT_PERCENT`, `toGross`, `toNet` in `lib.js` |
| Error codes and their params | `HttpError(…, code, params)` | `errors.<code>` in every `i18n/*.js`, `errorMessage` in `lib.js`, `DemoError` in `demo.js` |
| Wait times ("in 3 Minuten") | `waitText` | `waitText` in `lib.js` |

## Product decisions

- The features are sufficient for now; do not add new ones unless asked.
- Anonymity of bids is intended (see above).
- The public name list is acceptable because the app is used only temporarily.
- Hours have no target. The maximum stays 744 h per month.
- Amounts are netto. Brutto (× 1.19) is a display option for members and the admin; exports contain both. A bid typed brutto is leading as typed (10 € brutto stays 10 €, not 10,01 €).
- The bidding takes place **at a members' meeting where everyone is on the same WLAN**, so many phones share one public IP and log in at the same time.

## Open work (agreed October 2026)

Remove items here once they are done.

1. JSON import preview: the total only reads `contributions[id]`, while the server also accepts `contribution` per user. Also show the hours sum in the CSV and JSON preview.
2. Small fixes:
   - Backup file names use the UTC date and hour.
   - `set-pin.js` always sets `defaultPin: false`.

Done: see `CHANGELOG.md` (1.0.0: the UI spec below, the security hardening for the meeting, the measured performance).

Deferred or not wanted:

- Random start PINs generated by the import itself: not needed, the owner sets random PINs in the import file.
- CSV export for German Excel (semicolon and decimal comma): not wanted.
- Longer admin PIN than 8 digits: not wanted.

## UI spec (agreed October 2026)

Implemented in 1.0.0 (`AmountSheet.js`, `entry.js`, `MemberPage`, `PinLogin`, `AdminApp`). This section is the spec: change the app and this text together.

The design prototype the bid entry was built from (`docs/gebotseingabe-entwurf.html`) was removed in 2.0.0: the demo build shows the whole app.

### Amounts

- Everything is summed **netto**. Brutto is netto × 1.19, rounded to the cent, except for bids typed brutto (see below).
- Members type euros with up to 2 decimals (e.g. 10,87) and hours with 1 decimal. The maximum stays 744 h; the server rounds hours to 0.1 h instead of 0.5 h.
- The typed value **replaces** the previous bid. 0 withdraws the bid, so the Reset button goes away.
- In brutto mode the member types brutto, and **that brutto amount is leading**: it is stored (`grossBids`) and shown and exported exactly as typed. The netto value is brutto / 1.19, rounded **up** to the cent, and counts for the sums. Not every brutto amount is netto × 1.19 of some netto amount (15 € brutto lies between 12,60 € and 12,61 € netto), so the brutto amount has to be stored; recomputing it from netto showed 10,01 € for 10 €. In brutto mode the totals use the typed brutto amounts too (`totalRaisedGross`).
- The total of all bids and the Bedarf next to it (header and keypad sheet) are shown rounded to whole euros. Own bids keep their cents. The server keeps the exact sum.

### Backend

- `PUT /me/contribution {amount}` (netto) or `{gross}` (brutto as typed): 0 to `MAX_AMOUNT`, rounded to cents, like `PUT /me/hours`.
- `rev` in the response and the audit line with from/to.
- Export: CSV gets `contribution_gross` and `entered_as` columns next to `contribution` (netto), JSON `contributionsGross` and `enteredAs` maps next to `contributions`. The import reads the netto values, and for `entered_as` brutto the brutto amount, so a re-import keeps it.

### Member page

- **Header:**
  - Total of all bids with "von X €" (no "Bedarf", no "netto").
  - Total hours with "pro Monat"; this is the only "pro Monat" on the page.
  - Progress bar.
  - It must fit down to 320 px: numbers wrap to a new line instead of being cut off.
  - Generous spacing between the top bar, the numbers, the bar and the line below it, so it does not look crowded. The values are in the prototype CSS (`.topbar`, `.stats`, `.track`, `.meta`, `.band-inner`).
  - Top bar (since 2.0.0, the same on the admin page, `TopBar` in `ui.js`): a back arrow left, the member's name (or "Admin") centered, the settings gear right; no logo and no "Abmelden" text. The arrow does what the browser's back button does: the page has its own history entry (`{ member: true }` / `{ admin: true }`), and leaving it logs out (screen readers hear "Abmelden"). Back on the admin page leads to the admin PIN screen.
  - The total hours are beige, like the start-PIN notice (`#FFF8D2` at 85 %).
  - Outside the page (overscroll, the phone's safe areas) the light page colour continues below the content, never a blue strip at the bottom. Android and desktop browsers show blue above the page; iOS paints both edges in one colour (the body's), so there the top is light too. That is accepted: a blue body would bring back the blue strip at the bottom.
- **Card "Dein Beitrag"** (the same word as the keypad title; texts about the own bid say "Beitrag", the header count stays "N Gebote"):
  - Heading left; right on the same line the current mode as plain grey text ("Netto"/"Brutto"), not a button (2.0.0).
  - Below it: own bid (€) left and own hours (h) right, in the same font size and without labels.
  - Below that: two equal buttons "Beitrag ändern" (left) and "Stunden ändern" (right), both light blue (`blau-hell`), not yellow, text only without icons.
- **Netto/brutto** (since 2.0.0 only on the settings page, setting `amounts`):
  - It switches every amount on every page, including the keypad sheet; what the member types counts in that mode.
  - The choice is stored per device; default is netto.
  - On the member page the card heading shows the mode as plain grey text; there are no other "netto"/"brutto" labels there.
- **What goes away:**
  - The old PIN card and the start-PIN hint ("Du nutzt noch die Start-PIN"): not needed, because every member has a random PIN. "PIN ändern" stays as a plain grey text button centered below the card, grey like the mode label on the card.
  - The separate `HoursCard`. This replaces the old open items about the clipped hours field and the clipped header.
- **Front page before login:** its header says "von X € netto" (or "brutto", from the settings).

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
- **Short phones in portrait** (less than 540 px high, e.g. 320 pt iPhones in Safari with about 460 px): less spacing, a smaller amount and button, so it fits with key rows of at least 48 px. Check fit at browser heights (320×460, 375×553), not screen heights.
- **Phones in landscape** (less than 540 px high): the amount is on the left, the keypad and "Speichern" on the right, so it still fits. Should a screen be too short even for that, the sheet scrolls.

### PIN entry (member PIN step and admin login, `PinLogin` in `ui.js`)

- A screen of its own in the dark blue, white only (no yellow). The top row holds only the back arrow (`BackButton`, icon without text; screen readers hear "Anderer Name" or "Zur Startseite") and the settings gear, like the header rows of the member and admin pages. The lock sits in a round light circle (white at 20 % with a 30 % edge, so it stands out on the blue) in front of the name, on the same line (since 2.0.0; it used to sit above the name and took space).
- One box per digit, left-aligned, up to 8. A box appears together with its digit (since 2.0.0; there is no empty box, so none stays open at the end, and before the first digit an invisible box keeps the row's height). Every digit shows briefly (0.7 s), then turns into a round dot. The box of the newest digit has a white edge that is highlighted outward once, in one smooth movement, when it appears.
- Touch devices get the page's own keypad (digits, backspace); on computers a visually hidden field (`#pin`, label "PIN") takes the keys, Enter logs in. "Anmelden" is enabled from 4 digits.
- PINs have 4 to 8 digits (server, app, CSV import and mail script).
- While the PIN is checked, "Anmelden" stays as it is; only after 0.2 s it shows a spinner. The page start (`LoadingPage`) works the same way: the blue top, and a spinner only after 0.2 s. No "Lädt …" or "Wird geprüft …" texts.
- It fits on one screen like the bid sheet: on short screens the intro and the hint go away and the keypad shrinks (rows of at least 44 px).

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
