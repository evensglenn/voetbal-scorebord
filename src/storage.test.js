import { describe, expect, it } from 'vitest'
import { formatBytes, MAX_STATE_BYTES, stateBytes, storageLevel, storageUsage } from './storage.js'

const state = (matches, size = 100) => ({
  teams: [{ id: 't1', players: [] }],
  activeTeamId: 't1',
  history: Array.from({ length: matches }, (_, i) => ({ id: `h${i}`, notes: 'x'.repeat(size) })),
})

describe('storage', () => {
  it('telt bytes zoals Firestore, dus letters met accenten dubbel', () => {
    expect(stateBytes('é')).toBe(stateBytes('e') + 1)
  })

  it('waarschuwt vanaf 75% en slaat alarm vanaf 90%', () => {
    expect(storageLevel(MAX_STATE_BYTES * 0.74)).toBe('ok')
    expect(storageLevel(MAX_STATE_BYTES * 0.75)).toBe('warn')
    expect(storageLevel(MAX_STATE_BYTES * 0.9)).toBe('full')
  })

  it('schat hoeveel wedstrijden er nog bij kunnen op basis van de gespeelde', () => {
    const usage = storageUsage(state(10, 10_000))
    expect(usage.level).toBe('ok')
    // ~10 kB per wedstrijd, ~100 kB gebruikt: nog plaats voor ~90 wedstrijden.
    expect(usage.matchesLeft).toBeGreaterThan(85)
    expect(usage.matchesLeft).toBeLessThan(91)
  })

  it('laat één uitzonderlijk grote wedstrijd de schatting niet scheeftrekken', () => {
    const s = state(5, 2000)
    s.history.push({ id: 'groot', notes: 'x'.repeat(500_000) })
    // Nog ~490 kB vrij aan ~2 kB per wedstrijd.
    expect(storageUsage(s).matchesLeft).toBeGreaterThan(200)
  })

  it('gaat uit van 2 kB per wedstrijd zolang er nog bijna niets gespeeld is', () => {
    const usage = storageUsage(state(0))
    expect(usage.matchesLeft).toBe(Math.floor((MAX_STATE_BYTES - usage.bytes) / 2000))
  })

  it('toont kB en MB leesbaar', () => {
    expect(formatBytes(120)).toBe('1 kB')
    expect(formatBytes(38_400)).toBe('38 kB')
    expect(formatBytes(1_000_000)).toBe('1,0 MB')
  })
})
