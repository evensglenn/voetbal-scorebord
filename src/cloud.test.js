import { describe, expect, it } from 'vitest'
import { isEmpty, merge, withActiveTeam } from './cloud.js'

const team = (id, players = []) => ({ id, ageGroup: 'U9', players, started: false })
const match = (id, finishedAt) => ({ id, finishedAt })

describe('isEmpty', () => {
  it('is waar voor een nieuw toestel zonder spelers of uitslagen', () => {
    expect(isEmpty({ teams: [team('t1')], history: [] })).toBe(true)
  })

  it('is onwaar zodra er een speler, een uitslag of een lopende wedstrijd is', () => {
    expect(isEmpty({ teams: [team('t1', [{ id: 'p', name: 'Seppe' }])], history: [] })).toBe(false)
    expect(isEmpty({ teams: [team('t1')], history: [match('h1')] })).toBe(false)
    expect(isEmpty({ teams: [{ ...team('t1'), started: true }], history: [] })).toBe(false)
  })
})

describe('merge', () => {
  const local = {
    teams: [team('t1', [{ id: 'p1', name: 'Lokaal' }]), team('t3')],
    activeTeamId: 't3',
    history: [match('h1', '2026-10-01'), match('h3', '2026-10-08')],
  }
  const remote = {
    teams: [team('t1', [{ id: 'p1', name: 'Online' }]), team('t2')],
    activeTeamId: 't2',
    history: [match('h1', '2026-10-01'), match('h2', '2026-10-05')],
  }
  const merged = merge(local, remote)

  it('houdt ploegen van beide kanten, met de lokale versie bij dezelfde ploeg', () => {
    expect(merged.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(merged.teams[0].players[0].name).toBe('Lokaal')
  })

  it('houdt alle uitslagen één keer, nieuwste eerst', () => {
    expect(merged.history.map((h) => h.id)).toEqual(['h3', 'h2', 'h1'])
  })

  it('laat de open ploeg van dit toestel staan', () => {
    expect(merged.activeTeamId).toBe('t3')
  })
})

describe('withActiveTeam', () => {
  it('valt terug op de online keuze als de lokale ploeg niet meer bestaat', () => {
    const next = { teams: [team('t1'), team('t2')], activeTeamId: 't2', history: [] }
    expect(withActiveTeam(next, { activeTeamId: 'weg' }).activeTeamId).toBe('t2')
    expect(withActiveTeam(next, { activeTeamId: 't1' }).activeTeamId).toBe('t1')
  })
})
