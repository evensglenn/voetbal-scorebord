import { test as base, expect } from '@playwright/test'
import { firebaseConfig } from '../src/firebase-config.js'

const DOCS = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`
// "owner" gaat in de emulator voorbij de regels.
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

const player = (id, name) => ({ id, name })

export const team = (id, ageGroup, players, extra = {}) => ({
  id,
  ageGroup,
  periodsCount: 4,
  periodMinutes: 15,
  home: true,
  opponent: '',
  players,
  events: [],
  penalties: [],
  period: 1,
  clocks: [0, 0, 0, 0],
  started: false,
  activePlayerIds: players.map((p) => p.id),
  runningSince: null,
  subMinutes: null,
  extraPeriods: 0,
  endedEarly: false,
  ...extra,
})

export const finished = (id, teamId, theirName, us, them, daysAgo) => ({
  id,
  teamId,
  finishedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  date: '1 oktober 2026',
  ourName: 'Lummen United',
  theirName,
  ageGroup: 'U9',
  periodsCount: 4,
  left: { name: 'Lummen United', goals: us, ours: true },
  right: { name: theirName, goals: them, ours: false },
  events: [],
  scorers: [],
  penalties: null,
})

/** Een ploeg U9 met drie spelers en twee gespeelde wedstrijden. */
export const ACCOUNT_STATE = {
  teams: [team('u9', 'U9', [player('p1', 'Seppe'), player('p2', 'Rune'), player('p3', 'Lars')])],
  activeTeamId: 'u9',
  history: [finished('h2', 'u9', 'Herk FC', 3, 1, 7), finished('h1', 'u9', 'KFC Diest', 2, 2, 14)],
}

/** Een Google-account in de Auth-emulator; het verschijnt in het inlogvenster ervan. */
async function createAccount(email) {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=emulator',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestUri: 'http://localhost',
        returnSecureToken: true,
        postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: email, email, name: email.split('@')[0], email_verified: true }))}&providerId=google.com`,
      }),
    },
  )
  const account = await res.json()
  if (!account.localId) throw new Error(`Testaccount aanmaken mislukt: ${JSON.stringify(account)}`)
  return account.localId
}

async function put(path, fields) {
  const res = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields }) })
  if (!res.ok) throw new Error(`Testdata laden mislukt: ${res.status} ${await res.text()}`)
}

/** Zet de staat van een account rechtstreeks in Firestore. */
export async function seedState(uid, state) {
  await put(`users/${uid}`, {
    state: { stringValue: JSON.stringify(state) },
    updatedAt: { integerValue: String(Date.now() - 60_000) },
    writeId: { stringValue: 'seed' },
  })
}

/** Een back-up van zoveel dagen geleden. */
export async function seedBackup(uid, id, state, daysAgo) {
  await put(`users/${uid}/backups/${id}`, {
    state: { stringValue: JSON.stringify(state) },
    createdAt: { integerValue: String(Date.now() - daysAgo * 86_400_000) },
    reason: { stringValue: 'week' },
    teams: { integerValue: String(state.teams.length) },
    matches: { integerValue: String(state.history.length) },
  })
}

/** Wat er online in het account staat. */
export async function readState(uid) {
  const res = await fetch(`${DOCS}/users/${uid}`, { headers: ADMIN })
  if (!res.ok) return null
  return JSON.parse((await res.json()).fields.state.stringValue)
}

/** De staat zoals de app ze op dit toestel bewaard heeft. */
export const localState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('matchblad.v1')))

/** Zet gegevens op het "toestel" nog voor de app opent (zoals een gsm die de app al gebruikte). */
export async function seedDevice(page, state) {
  await page.addInitScript((json) => {
    if (sessionStorage.getItem('seeded')) return
    localStorage.setItem('matchblad.v1', json)
    sessionStorage.setItem('seeded', '1')
  }, JSON.stringify(state))
}

export async function signIn(page, email) {
  await page.goto('/')
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Inloggen met Google' }).click(),
  ])
  await popup.waitForLoadState()
  // Het emulatorvenster heeft even nodig voor een klik op een account aankomt.
  const choice = popup.getByText(email)
  await choice.waitFor()
  await popup.waitForTimeout(400)
  await choice.click()
}

/** Tabs in de tabbalk: 0 Start, 1 Ploeg, 2 Uitslagen, 3 Statistieken, 4 Instellingen. */
export const tab = (page, index) => page.locator('nav.tabs .tab').nth(index).click()

export const test = base.extend({
  // Overschrijfbaar per test met test.use({ accountState: ... }); null = leeg account.
  accountState: [ACCOUNT_STATE, { option: true }],
  account: async ({ accountState }, use, testInfo) => {
    const email = `e2e-${testInfo.testId}-${Date.now()}@example.com`.toLowerCase()
    const uid = await createAccount(email)
    if (accountState) await seedState(uid, accountState)
    await use({ uid, email })
  },
  signedIn: async ({ page, account }, use) => {
    await signIn(page, account.email)
    await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 20_000 })
    await use(page)
  },
})

export { expect }
