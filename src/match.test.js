import { describe, expect, it } from 'vitest'
import { analyseRuns, buildSummary, emptyTeam, fromStored, normalizeTeam } from './App.jsx'

let n = 0
const goal = (team, playerId = null, extra = {}) => ({ id: `e${++n}`, team, playerId, period: 1, clock: 0, ...extra })

describe('analyseRuns (hattricks)', () => {
  it('telt drie doelpunten na elkaar van dezelfde speler als hattrick', () => {
    const events = [goal('us', 'a'), goal('us', 'a'), goal('us', 'a')]
    const runs = analyseRuns(events)
    expect(runs.hattricks).toEqual({ a: 1 })
    expect(events.every((e) => runs.hat[e.id])).toBe(true)
    expect(runs.live).toEqual({ playerId: 'a', len: 3 })
  })

  it.each([
    ['een ploegmaat', goal('us', 'b')],
    ['de tegenstander', goal('them')],
    ['een doelpunt zonder naam', goal('us')],
  ])('laat de reeks breken door %s', (_, between) => {
    const events = [goal('us', 'a'), goal('us', 'a'), between, goal('us', 'a')]
    const runs = analyseRuns(events)
    expect(runs.hattricks).toEqual({})
    expect(Object.values(runs.hat).some(Boolean)).toBe(false)
  })

  it('telt een reeks van vier als één hattrick, met alle vier gemarkeerd', () => {
    const events = [goal('us', 'a'), goal('us', 'a'), goal('us', 'a'), goal('us', 'a')]
    const runs = analyseRuns(events)
    expect(runs.hattricks).toEqual({ a: 1 })
    expect(runs.streak[events[3].id]).toBe(4)
    expect(events.every((e) => runs.hat[e.id])).toBe(true)
  })
})

describe('buildSummary', () => {
  const match = (overrides = {}) => ({
    ...emptyTeam('U9'),
    opponent: 'KFC Diest',
    players: [
      { id: 'a', name: 'Seppe' },
      { id: 'b', name: 'Rune' },
    ],
    ...overrides,
  })

  it('zet Lummen United links bij een thuiswedstrijd en rechts bij een uitwedstrijd', () => {
    const events = [goal('us', 'a'), goal('them')]
    const home = buildSummary(match({ home: true, events }))
    expect(home.left).toMatchObject({ name: 'Lummen United', goals: 1, ours: true })
    expect(home.right).toMatchObject({ name: 'KFC Diest', goals: 1, ours: false })
    const away = buildSummary(match({ home: false, events }))
    expect(away.left.name).toBe('KFC Diest')
    expect(away.right.name).toBe('Lummen United')
  })

  it('groepeert doelpuntenmakers met evenveel goals en telt doelpunten zonder naam apart', () => {
    const summary = buildSummary(
      match({ events: [goal('us', 'a'), goal('us', 'b'), goal('us'), goal('us', 'a'), goal('us', 'b')] }),
    )
    expect(summary.scorers).toEqual([
      { name: 'Rune & Seppe', names: ['Rune', 'Seppe'], goals: 2, hattricks: 0 },
      { name: 'Own goal', goals: 1, hattricks: 0 },
    ])
  })

  it('houdt de tussenstand en de hattrick bij in de tijdslijn', () => {
    const summary = buildSummary(match({ events: [goal('them'), goal('us', 'a'), goal('us', 'a'), goal('us', 'a')] }))
    expect(summary.events.map((e) => `${e.us}-${e.them}`)).toEqual(['0-1', '1-1', '2-1', '3-1'])
    expect(summary.events.at(-1)).toMatchObject({ name: 'Seppe', hatLabel: 'hattrick' })
    expect(summary.scorers[0]).toMatchObject({ name: 'Seppe', goals: 3, hattricks: 1 })
  })

  it('vat strafschoppen samen', () => {
    const summary = buildSummary(
      match({
        penalties: [
          { id: 'p1', team: 'us', playerId: 'a', scored: true },
          { id: 'p2', team: 'them', scored: false },
          { id: 'p3', team: 'us', playerId: 'b', scored: false },
        ],
      }),
    )
    expect(summary.penalties.us).toEqual({ scored: 1, total: 2 })
    expect(summary.penalties.them).toEqual({ scored: 0, total: 1 })
    expect(summary.penalties.attempts[1].name).toBe('KFC Diest')
  })
})

describe('fromStored', () => {
  it('geeft null voor iets dat geen app-staat is', () => {
    expect(fromStored(null)).toBeNull()
    expect(fromStored('tekst')).toBeNull()
    expect(fromStored({ iets: 1 })).toBeNull()
  })

  it('zet het oude platte formaat (één match, vóór meerdere ploegen) om naar een ploeg', () => {
    const state = fromStored({
      ageGroup: 'U7',
      players: [{ id: 'a', name: 'Seppe' }],
      events: [goal('us', 'a')],
      history: [{ id: 'h1' }],
    })
    expect(state.teams).toHaveLength(1)
    expect(state.teams[0]).toMatchObject({ ageGroup: 'U7', started: true, activePlayerIds: ['a'] })
    expect(state.activeTeamId).toBe(state.teams[0].id)
    expect(state.history).toEqual([{ id: 'h1' }])
  })

  it('vult ontbrekende velden aan en valt terug op de eerste ploeg', () => {
    const state = fromStored({ teams: [{ id: 't1', ageGroup: 'U9', players: [] }], activeTeamId: 'weg' })
    expect(state.activeTeamId).toBe('t1')
    expect(state.teams[0]).toMatchObject({ penalties: [], subMinutes: null, extraPeriods: 0, endedEarly: false })
    expect(state.history).toEqual([])
  })
})

describe('normalizeTeam', () => {
  it('houdt klokken en periode in lijn met het aantal periodes', () => {
    const team = normalizeTeam({ ...emptyTeam('U9'), periodsCount: 2, period: 4, clocks: [60, 120, 180, 240] })
    expect(team.clocks).toHaveLength(2)
    expect(team.period).toBeLessThanOrEqual(2)
  })
})
