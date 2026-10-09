#!/usr/bin/env node
// Vult de (lege) Firestore-emulator met een testaccount, twee ploegen, een
// seizoen aan uitslagen en twee back-ups, zodat `npm run dev:local` meteen
// iets te tonen heeft. Komt nooit aan de echte database.
import { firebaseConfig } from '../src/firebase-config.js'

const DOCS = `http://127.0.0.1:8080/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`
// "owner" gaat in de emulator voorbij de regels.
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }
const ACCOUNT = { sub: 'test-account', email: 'trainer@example.com', name: 'Test', email_verified: true }
const TEAM = 'Lummen United'
const DAY = 86_400_000

// Vaste "willekeur", zodat de testdata bij elke start dezelfde is.
let seed = 7
const random = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const pick = (list) => list[Math.floor(random() * list.length)]

const squad = (prefix, names) => names.map((name, i) => ({ id: `${prefix}-${i}`, name }))

const TEAMS = [
  {
    id: 'test-u9',
    ageGroup: 'U9',
    periodsCount: 4,
    periodMinutes: 15,
    players: squad('u9', ['Seppe', 'Rune', 'Lars', 'Mats', 'Finn', 'Noor', 'Jules', 'Wout']),
    opponents: ['KFC Diest', 'Herk FC', 'Sporting Hasselt', 'KVK Beringen', 'Tienen', 'Zonhoven'],
    matches: 8,
  },
  {
    id: 'test-u7',
    ageGroup: 'U7',
    periodsCount: 4,
    periodMinutes: 10,
    players: squad('u7', ['Lou', 'Mil', 'Bas', 'Ella', 'Vic']),
    opponents: ['Linkhout', 'Halen', 'Heusden-Zolder'],
    matches: 4,
  },
]

// Zelfde regel als analyseRuns in App.jsx: drie na elkaar van dezelfde speler.
function runLabels(goals) {
  const lens = []
  goals.forEach((g, i) => {
    lens[i] = g.playerId && i > 0 && goals[i - 1].playerId === g.playerId ? lens[i - 1] + 1 : g.playerId ? 1 : 0
  })
  return goals.map((_, i) => {
    let end = i
    while (end + 1 < goals.length && lens[end + 1] === lens[end] + 1 && lens[end] > 0) end++
    const len = lens[end]
    return lens[i] > 0 && len >= 3 ? (len === 3 ? 'hattrick' : `${len} op rij`) : null
  })
}

// Een afgewerkte wedstrijd in hetzelfde formaat als buildSummary + endMatch.
function finishedMatch(team, index) {
  const home = random() < 0.5
  const theirName = pick(team.opponents)
  const goals = []
  for (let period = 1; period <= team.periodsCount; period++) {
    const count = Math.floor(random() * 4)
    for (let n = 0; n < count; n++) {
      const ours = random() < 0.6
      goals.push({
        team: ours ? 'us' : 'them',
        period,
        clock: Math.floor(random() * team.periodMinutes * 60),
        playerId: ours && random() < 0.9 ? pick(team.players).id : null,
      })
    }
  }
  goals.sort((a, b) => a.period - b.period || a.clock - b.clock)
  // Eén echte hattrick in de eerste U9-wedstrijd.
  if (team.id === 'test-u9' && index === 0) {
    goals.push(...[60, 200, 410].map((clock) => ({ team: 'us', period: team.periodsCount, clock, playerId: 'u9-0' })))
    goals.sort((a, b) => a.period - b.period || a.clock - b.clock)
  }

  const labels = runLabels(goals)
  let us = 0
  let them = 0
  const events = goals.map((g, i) => {
    if (g.team === 'us') us++
    else them++
    const player = team.players.find((p) => p.id === g.playerId)
    return { team: g.team, period: g.period, us, them, name: g.team === 'us' ? (player?.name ?? null) : null, clock: g.clock, hatLabel: labels[i] }
  })

  const byPlayer = new Map()
  goals.forEach((g, i) => {
    if (!g.playerId) return
    const s = byPlayer.get(g.playerId) ?? { goals: 0, hattricks: 0 }
    s.goals++
    if (labels[i] === 'hattrick' && labels[i + 1] !== 'hattrick') s.hattricks++
    byPlayer.set(g.playerId, s)
  })
  const sorted = [...byPlayer]
    .map(([id, s]) => ({ name: team.players.find((p) => p.id === id).name, ...s }))
    .sort((a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name))
  const scorers = []
  for (const s of sorted) {
    const last = scorers[scorers.length - 1]
    if (last && last.goals === s.goals && last.hattricks === s.hattricks) last.names.push(s.name)
    else scorers.push({ names: [s.name], goals: s.goals, hattricks: s.hattricks })
  }
  for (const s of scorers) {
    s.name = s.names.length === 1 ? s.names[0] : `${s.names.slice(0, -1).join(', ')} & ${s.names.at(-1)}`
  }
  const unnamed = goals.filter((g) => g.team === 'us' && !g.playerId).length
  if (unnamed) scorers.push({ name: 'Own goal', goals: unnamed, hattricks: 0 })

  const finished = new Date(Date.now() - (team.matches - index) * 7 * DAY - 2 * DAY)
  const ours = { name: TEAM, goals: us, ours: true }
  const theirs = { name: theirName, goals: them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]
  return {
    id: `${team.id}-m${index}`,
    teamId: team.id,
    finishedAt: finished.toISOString(),
    date: finished.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
    ourName: TEAM,
    theirName,
    ageGroup: team.ageGroup,
    periodsCount: team.periodsCount,
    left,
    right,
    events,
    scorers,
    penalties: null,
  }
}

const history = TEAMS.flatMap((team) => Array.from({ length: team.matches }, (_, i) => finishedMatch(team, i)))
  .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))

const state = {
  teams: TEAMS.map(({ opponents, matches, ...team }) => ({
    ...team,
    home: true,
    opponent: '',
    events: [],
    penalties: [],
    period: 1,
    clocks: Array(team.periodsCount).fill(0),
    started: false,
    activePlayerIds: team.players.map((p) => p.id),
    runningSince: null,
    subMinutes: null,
    extraPeriods: 0,
    endedEarly: false,
  })),
  activeTeamId: 'test-u9',
  history,
}

// Een Google-account in de Auth-emulator; het verschijnt in het inlogvenster ervan.
const account = await fetch(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=emulator',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestUri: 'http://localhost',
      returnSecureToken: true,
      postBody: `id_token=${encodeURIComponent(JSON.stringify(ACCOUNT))}&providerId=google.com`,
    }),
  },
).then((r) => r.json())
if (!account.localId) throw new Error(`Testaccount aanmaken mislukt: ${JSON.stringify(account)}`)

async function put(path, fields) {
  const res = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields }) })
  if (!res.ok) throw new Error(`Testdata laden mislukt: ${res.status} ${await res.text()}`)
}

const updatedAt = Date.now() - DAY
await put(`users/${account.localId}`, {
  state: { stringValue: JSON.stringify(state) },
  updatedAt: { integerValue: String(updatedAt) },
  writeId: { stringValue: 'seed' },
  appVersion: { stringValue: 'seed' },
})

// Twee wekelijkse back-ups: een van vorige week (een wedstrijd minder) en
// een van twee weken geleden (twee minder), om terugzetten te proberen.
for (const weeks of [1, 2]) {
  const older = { ...state, history: state.history.slice(weeks) }
  await put(`users/${account.localId}/backups/seed-${weeks}`, {
    state: { stringValue: JSON.stringify(older) },
    createdAt: { integerValue: String(Date.now() - weeks * 7 * DAY) },
    reason: { stringValue: 'week' },
    teams: { integerValue: String(older.teams.length) },
    matches: { integerValue: String(older.history.length) },
    appVersion: { stringValue: 'seed' },
  })
}

console.log(`\n  Testdata geladen: ${state.teams.length} ploegen en ${history.length} wedstrijden voor ${ACCOUNT.email}.`)
console.log(`  Open http://localhost:5181, klik op "Inloggen met Google" en kies "${ACCOUNT.name}" in het venster van de emulator.\n`)
