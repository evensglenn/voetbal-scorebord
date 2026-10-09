# CLAUDE.md

Matchblad / "Scorebord": an offline-first PWA for tracking a youth football match from the
sideline (score, goalscorers, timeline, period clock, substitutions, penalty shoot-out,
match history and stats) for the club **Lummen United**. Everything runs in the browser and
is stored in `localStorage`. Signing in with Google is required and syncs that same state to
Firebase Firestore (see *Cloud sync*); with an empty Firebase config the app is purely local.

## Commands

```bash
npm install
npm run dev:local # app against the Firebase emulators with test data (http://localhost:5181, needs Java 21+)
npm run dev       # Vite dev server against the REAL Firebase project (http://localhost:5173)
npm run build     # stamps public/sw.js with the version, then vite build -> dist/
npm run preview   # serve dist/
npm test          # unit tests (Vitest)
npm run test:emulator  # unit + Firestore tests (sync, backups, rules) against the emulators; reuses a running dev:local
npm run test:e2e  # browser tests (Playwright, installed Chrome) at phone and desktop width; reuses a running dev:local
python3 tools/make_icons.py   # regenerate PNG icons in public/ (change CLUB colour there)
```

No linter or formatter is configured. Unit tests sit next to the code (`src/*.test.js`;
`match.js`, `cloud.js` and `storage.js` hold the pure logic they test), Firestore tests in
`src/firebase.emulator.test.js` (skipped without emulators), browser tests in `e2e/` with
fixtures that create a fresh emulator account per test. Tests find elements by their
visible Dutch labels, so update them when you rename UI text.

## Workflow

1. Branch from an up-to-date `main` (`fix/…`, `feat/…`, `chore/…`). Never commit to
   `main` directly; it is protected against force-push and deletion.
2. Make the change, bump the version (see below), run `npm run test:emulator`,
   `npm run test:e2e` and `npm run build`, and look at the result in `npm run dev:local`.
3. Ask before committing. Then push the branch and open a PR (summary + testing).
4. `.github/workflows/ci.yml` runs build, unit, Firestore and browser tests on the PR.
   Merge (`gh pr merge --merge`) only when it is green and the owner agrees.
5. A push to `main` deploys: first the Firestore rules (needs the repo secret
   `FIREBASE_SERVICE_ACCOUNT`), then the app to GitHub Pages. Watch the run.

While `~/.npm` has root-owned files, run npm with `--cache` pointing to a temp dir (or
the owner fixes it with `sudo chown -R $(whoami) ~/.npm`).

## Conventions

- **Bump `version` in `package.json` with every change.** The Settings screen shows it
  (`APP_VERSION` is imported straight from `package.json`), backups include it, and
  `scripts/stamp-sw.js` writes it into the `CACHE` name in `public/sw.js` on build. That
  changed `sw.js` is what makes browsers detect an update and show the "new version"
  prompt, so commit the stamped `public/sw.js` along with the version bump.
- **UI text and code comments are in Dutch (Flemish).** Keep new strings and comments in
  Dutch, in the same explanatory "why" style. Identifiers are English.
- **Commit messages** are short plain-English imperative sentences without a prefix, e.g.
  `Tick the clock on second boundaries and blink both colons together`.
- Style: no semicolons, single quotes, 2-space indent, trailing commas, function
  components with hooks. No TypeScript, no state library, no router, no CSS framework.
- Every `localStorage` access is wrapped in `try/catch`; keep it that way.
- Respect `prefers-reduced-motion` for any new animation (see existing `@media` blocks
  and the checks in `Presence` / `useDialog`).

## Layout

| Path | What it is |
| --- | --- |
| `src/App.jsx` | The `App` component: state, clock, alerts, sync hook-up and which screen is open |
| `src/match.js` | Pure domain: `AGE_CONFIG`, `emptyTeam`, `normalizeTeam`, `fromStored`, `load`, `analyseRuns`, `buildSummary`, `mmss`, … |
| `src/results.js` | Pure results/stats helpers (`resultOf`, `playedBy`, `teamStats`, …) |
| `src/device.js` | Speech, vibration, notifications, theme preference, device type, `reducedMotion` |
| `src/ui.jsx` | Shared UI: `Presence`, `useModal`, `useDialog`, `Confirm`, `SwitchRow`, `NumberSelect` |
| `src/icons.jsx` | All SVG icon components |
| `src/Home.jsx`, `Match.jsx`, `Scoreboard.jsx`, `BigBoard.jsx`, `StartMatch.jsx`, `SummaryView.jsx` | Match screen parts: start screen, timeline/penalties, header board, landscape board, new-match dialog, summary dialog |
| `src/Squad.jsx`, `History.jsx`, `Stats.jsx`, `Settings.jsx` | The other tabs (`Settings` also holds the backup file export/import) |
| `src/Account.jsx` | Login screen, first-login choice, account card, storage meter, account backups |
| `src/summary.js` | Canvas drawing of the shareable match summary image (`drawSummary`, `heightFor`) |
| `src/cloud.js` | `useCloudSync`: optional sync of the whole state with Firebase (merge, retry, status) |
| `src/firebase.js` | The only file that touches the Firebase SDK; dynamically imported by `cloud.js` |
| `src/storage.js` | Size of the state in bytes vs. the 1 MB Firestore limit; level `ok`/`warn` (75%)/`full` (90%) |
| `src/EnvBadge.jsx` | Badge at the top in dev: green "Lokaal · testdata" (emulators), red "Lokaal · echte gegevens" (`npm run dev`) |
| `src/firebase-config.js` | Public Firebase web config; empty `apiKey` = feature hidden |
| `firestore.rules` | Firestore security rules (deployed automatically on push to `main`) |
| `firebase.json`, `scripts/emulators.mjs`, `scripts/seed-emulator.mjs` | `dev:local`: Auth + Firestore emulators, seeded with a "Test" account, 2 teams, 12 matches, 2 backups |
| `src/main.jsx` | React root + service worker registration and update detection |
| `src/styles.css` | All styles (~3300 lines), theme tokens on `:root` |
| `public/sw.js` | Service worker (offline cache, notification click) |
| `public/manifest.webmanifest`, icons, `club-logo.png` | PWA assets |
| `scripts/stamp-sw.js` | Pre-build: writes the package version into `sw.js` |
| `index.html` | Sets the saved theme before React mounts (no flash), loads Google Font *Barlow Semi Condensed* |
| `.github/workflows/deploy.yml` | On push to `main`: deploy `firestore.rules`, then build and deploy to GitHub Pages |
| `.github/workflows/ci.yml` | On every PR: build, unit, Firestore and browser tests |
| `vitest.config.js`, `playwright.config.js`, `e2e/` | Test setup (see Workflow) |
| `_bmad/`, `_bmad-output/`, `.claude/skills/` | Local BMAD tooling, git-ignored; not part of the app |

`vite.config.js` derives `base` from `GITHUB_REPOSITORY` (`/<repo>/` for project pages,
`/` otherwise). Always build asset URLs with `import.meta.env.BASE_URL`; in `index.html`
use `%BASE_URL%`.

Each module exports what others need; there are no import cycles (only `App.jsx` imports
the screens). New screens get their own file; pure logic goes into `match.js`/`results.js`
so it can be unit-tested.

## App architecture

**State** lives in a single `useState(load)` in `App` and is persisted wholesale as JSON
under `localStorage['matchblad.v1']` on every change:

```js
{ teams: [Team], activeTeamId, history: [FinishedMatch] }
```

- A **Team** (created by `emptyTeam(ageGroup)`) also holds the *current* match: `players`,
  `events` (goals, `team: 'us' | 'them'`, optional `playerId`, `period`, `clock`),
  `penalties`, `period`, `clocks[]` (seconds per period), `runningSince` (timestamp while
  the clock runs, so elapsed time survives backgrounding/reloads), `started`,
  `activePlayerIds`, `subMinutes` (`null` = halfway each period, `0` = off), `home`,
  `opponent`, `periodsCount`, `periodMinutes`, `extraPeriods`, `endedEarly`.
- `setMatch(updater)` updates the active team and always runs it through
  `normalizeTeam`, which keeps `clocks`/`period` consistent with `periodsCount` and fills
  defaults. **When adding a field to Team, add its default to both `emptyTeam` and
  `normalizeTeam`** so old stored data and backups still load.
- `fromStored` migrates stored data and backups, including the legacy flat single-match
  format. Keep it backwards compatible; users have real match history on their phones.
- Ending a match prepends a `buildSummary(match)` result to `history`. The same summary
  object feeds the summary image, History and Stats.
- Team switching is blocked while a match is in progress.

**Domain rules**
- `AGE_CONFIG` maps U6–U21 to format (2v2 … 11v11), periods and minutes (Voetbal
  Vlaanderen defaults; U7 is deliberately 4 × 10' to match club practice). These are only
  defaults; periods and minutes stay editable.
- Hattrick = three consecutive goals by the same player; any other goal (teammate,
  opponent, unnamed) breaks the run. See `analyseRuns`.

**Screens**: `screen` state switches between `match` (shows `Home` until a match is
started), `squad`, `history`, `stats` and `settings`, via an icon tab bar. Modals and
dialogs use `Presence`, `useModal`, `useDialog` and `Confirm`.

**Device features** (all optional and feature-detected): Wake Lock while the clock runs,
speech synthesis (`say`) and vibration (`vibrate`) for period and substitution alerts,
notifications through the service worker registration (`notify`), and a `BigBoard`
full-screen scoreboard that opens on landscape rotation on phones (orientation lock,
`useAutoRotateOff`) or by hand on tablets/PCs. Per-device preferences use their own
`scorebord-*` localStorage keys (`theme`, `speech`, `vibrate`, `last-backup`, `cloud`).

**Backup**: the account keeps copies in Firestore `users/{uid}/backups` (see *Cloud
sync*). Settings also still exports/imports a JSON file `{ app: 'scorebord', version,
exportedAt, data: state }` (share on iOS, download elsewhere); import goes through
`fromStored`.

## Cloud sync

`useCloudSync(state, setState, fromStored)` in `App` keeps `localStorage` as the source of
truth and mirrors the whole state as a JSON string into Firestore `users/{uid}`
(`{ state, updatedAt, writeId, appVersion }`). Sync bookkeeping lives in
`localStorage['scorebord-cloud']`: `base` (the online `updatedAt` the local state builds
on), `dirty` (local changes not yet uploaded), `uid`, `writeId`, `syncedAt`.

- Uploads are debounced and go through a transaction that only writes when the online
  `updatedAt` still equals `base`; otherwise the online version comes back and is merged.
- `merge` unions teams and history by id (local wins for the same team id). Deletions made
  on one device while another device edited concurrently can come back; accepted trade-off.
- Sign-in is required: `App` renders `Login` while `cloud.locked`. A device that was signed
  in before (`signedIn` in the meta) goes straight into the app, also offline.
- First link of a device to an account (`joined: false`): an empty device adopts the online
  state; a device with data shows `JoinChoice` (take along = merge, or wipe after a second
  confirmation). Nothing is uploaded until that choice is made.
- Signing out locks the app but keeps the data and `base`; the same account continues
  seamlessly, a different account triggers the join choice again.
- State applied from online is tracked in a ref so it is not marked dirty again; our own
  write echoes are recognised by `writeId`.
- `activeTeamId` stays per device.
- Storage: Settings → Account shows the used share of 1 MB as a percentage and an estimate of matches
  left (median match size). From 75% a warning and a dot on the Instellingen tab; pushes
  above the limit fail with `too-large`.
- Backups: once the state is synced and `backupAt` is older than a week, a copy goes to
  `users/{uid}/backups` (`saveBackup` skips it when another device made one recently and
  prunes to the newest 8). `CloudBackups` in Settings lists them, makes one on demand, and
  restores one after first saving the current state as a `restore` copy.
- Firebase is loaded lazily after the first render; the service worker ignores
  cross-origin requests so Firestore/auth traffic is never cached.

## Theming

Colour tokens are CSS variables on `:root` in `styles.css`, overridden under
`@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` and
`:root[data-theme='dark']`. The theme choice (`auto`/`light`/`dark`) sets
`data-theme` on `<html>`. Club orange is `#e4600a`, dark ink `#11161b`. `summary.js` uses
its own fixed palette since the image is always dark.

## Service worker

`public/sw.js`: network-first for pages, manifest and icons (cache as fallback);
cache-first for hashed files under `/assets/`. Old caches are deleted on activate.
`main.jsx` polls for updates hourly and when the page becomes visible, and dispatches
`scorebord:update-available`, which `App` turns into an update prompt. The SW only works
over https (GitHub Pages), not on a plain-http test server.

## Notes

- `README.md` is Dutch and written for the owner: features first, then development.
  Keep it in sync when features change.
- `dist/` is build output and git-ignored.
