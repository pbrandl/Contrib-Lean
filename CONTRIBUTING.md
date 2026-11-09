# Contributing

Thanks for helping. This app runs a real pledge round with real members' money, so changes are
small, tested and documented. Setup and the checks are in the [README](README.md#development);
the architecture, the invariants and the UI spec are in [CLAUDE.md](CLAUDE.md). Read the parts of
`CLAUDE.md` that cover what you change before you start.

## Workflow

1. Branch off `main`. One topic per branch and pull request.
2. Change code, tests and docs together. `CLAUDE.md` is the spec: when behaviour changes, its text
   changes in the same pull request.
3. Run the checks locally (`npm test` in `backend/`; `npm run lint`, `npm test` and
   `npm run build` in `frontend/`). CI runs them again on Node 22 and 24.
4. Add a line to `CHANGELOG.md` (German, it is read by the people who run the round) under
   "Unveröffentlicht".
5. Open a pull request; the template has a short checklist.

## Rules that are easy to miss

- **Texts:** every visible text lives in `frontend/src/i18n/de.js`, `en.js` and `es.js`, never in a
  component. `i18n.test.js` fails when a key or placeholder is missing in one language.
- **Server errors** carry a `code` (and `params`) that the pages translate (`errors.<code>`). A new
  code needs texts in all three languages and a case in `frontend/src/demo.js` if the demo can hit it.
- **Writes** go through `mutate()` in `backend/server.js`; audit lines are recorded inside it.
  scrypt never runs inside that queue.
- **Rules that exist on both sides** (PIN length, maximum hours, VAT, …) are listed in a table in
  `CLAUDE.md`. Change both sides.
- **Privacy:** no response or export may contain a PIN or PIN hash, and the admin screen never shows
  who pledged what. `backend/test.js` checks the first.
- **Layout:** check 320, 360 and 375 px width, in light and dark mode. Buttons that wait for the
  server are a `BusyButton`.
- **Product scope:** the features are agreed with the people who run the round. Ask in an issue
  before adding a new one.

## Tests

- `backend/test.js` is one sequential script: later checks reuse tokens and members from earlier
  ones, and it moves a fake clock instead of waiting. Add new checks at the end of the matching
  section.
- Frontend tests run in Vitest with React Testing Library and render pages with `render` from
  `src/test-utils.jsx`. Some check visual states (CSS classes of the PIN boxes), so
  `no-node-access` and `no-container` are switched off for test files in `eslint.config.js`.
- Styles: Tailwind 4 with our own classes as plain CSS in `index.css`; read the Tailwind part of
  `CLAUDE.md` before changing them (layer order, no `@apply` of our own classes).

## Dependencies

- Dependabot opens weekly pull requests (grouped minor and patch updates, majors one by one,
  GitHub Actions separately). Merge them when CI is green.
- `npm audit` is clean in both folders, and CI fails on any finding. `frontend/package.json` pins a
  fixed `minimatch` for the lint tooling under `overrides`; drop it once
  `@typescript-eslint/typescript-estree` depends on a fixed version itself.
- ESLint stays on 9 until `eslint-plugin-react` and `eslint-plugin-jsx-a11y` support 10; Dependabot
  skips that major on purpose.
- Actions in the workflows are pinned to commit SHAs, with the version in a comment.

## Releases

1. Make sure `main` is green and `CHANGELOG.md` has the new version's entry (turn
   "Unveröffentlicht" into "X.Y.Z – date").
2. Set the version in `backend/package.json`, `frontend/package.json` (and the lockfiles:
   `npm version X.Y.Z --no-git-tag-version` in both folders) and `frontend/src/version.js`, and the
   names in `DEPLOY.md`.
3. On GitHub: Releases, "Draft a new release", new tag `vX.Y.Z` on `main`, notes from the changelog,
   "Publish". The release workflow checks that the versions match the tag, runs the tests and
   attaches the demo page.
4. Install it on the server with [`DEPLOY.md`](DEPLOY.md): the server clones the tag with a read-only
   deploy key.
