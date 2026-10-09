// Tests tegen de Firebase-emulators: opslaan met conflictcontrole, de
// back-ups en de Firestore-regels. Draaien met `npm run test:emulator`.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db, listBackups, pushState, saveBackup } from './firebase.js'

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'
const DENIED = { code: 'permission-denied' }

async function signInAs(email) {
  await signOut(auth)
  try {
    return (await createUserWithEmailAndPassword(auth, email, 'wachtwoord')).user.uid
  } catch {
    return (await signInWithEmailAndPassword(auth, email, 'wachtwoord')).user.uid
  }
}

const state = (matches = 0) => ({
  teams: [{ id: 't1', ageGroup: 'U9', players: [] }],
  activeTeamId: 't1',
  history: Array.from({ length: matches }, (_, i) => ({ id: `h${i}` })),
})

// Elke test een eigen account, zodat niets gewist hoeft te worden en een
// draaiende `npm run dev:local` (met zijn testaccount) ongemoeid blijft.
let run = 0
const fresh = (name) => `${name}-${Date.now()}-${++run}@example.com`

describe.skipIf(!useEmulators)('Firestore (emulator)', () => {
  let uid

  beforeEach(async () => {
    uid = await signInAs(fresh('trainer'))
  })

  afterAll(() => signOut(auth))

  describe('pushState', () => {
    it('schrijft de eerste versie en daarna verder op die versie', async () => {
      const first = await pushState(uid, 0, state(1), 'w1')
      expect(first.updatedAt).toBeGreaterThan(0)
      const second = await pushState(uid, first.updatedAt, state(2), 'w2')
      expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
      const stored = (await getDoc(doc(db, 'users', uid))).data()
      expect(JSON.parse(stored.state).history).toHaveLength(2)
      expect(stored.writeId).toBe('w2')
    })

    it('weigert te schrijven als een ander toestel intussen bewaard heeft', async () => {
      const first = await pushState(uid, 0, state(1), 'gsm')
      await pushState(uid, first.updatedAt, state(2), 'tablet')
      // De gsm bouwt nog verder op de eerste versie.
      const result = await pushState(uid, first.updatedAt, state(5), 'gsm')
      expect(result.conflict.writeId).toBe('tablet')
      expect(result.conflict.state.history).toHaveLength(2)
      const stored = JSON.parse((await getDoc(doc(db, 'users', uid))).data().state)
      expect(stored.history).toHaveLength(2)
    })

    it('weigert een staat die te groot is voor één document', async () => {
      const huge = { ...state(), history: [{ id: 'x', notes: 'a'.repeat(1_100_000) }] }
      await expect(pushState(uid, 0, huge, 'w')).rejects.toMatchObject({ code: 'too-large' })
    })
  })

  describe('back-ups', () => {
    it('bewaart er hoogstens 8, nieuwste eerst', async () => {
      for (let i = 1; i <= 10; i++) await saveBackup(uid, state(i), { reason: 'manual' })
      const backups = await listBackups(uid)
      expect(backups).toHaveLength(8)
      expect(backups.map((b) => b.matches)).toEqual([10, 9, 8, 7, 6, 5, 4, 3])
      expect(JSON.parse(backups[0].state).history).toHaveLength(10)
    })

    it('slaat de wekelijkse kopie over als er al een recente is', async () => {
      const first = await saveBackup(uid, state(1), { reason: 'week' })
      const again = await saveBackup(uid, state(2), { reason: 'week', ifOlderThan: 7 * 86_400_000 })
      expect(again).toBe(first)
      expect(await listBackups(uid)).toHaveLength(1)
    })
  })

  describe('regels', () => {
    it('laat niemand anders aan je gegevens of back-ups', async () => {
      await pushState(uid, 0, state(1), 'w')
      await saveBackup(uid, state(1), { reason: 'manual' })
      await signInAs(fresh('iemand-anders'))
      await expect(getDoc(doc(db, 'users', uid))).rejects.toMatchObject(DENIED)
      await expect(setDoc(doc(db, 'users', uid), { state: '{}' })).rejects.toMatchObject(DENIED)
      await expect(listBackups(uid)).rejects.toMatchObject(DENIED)
      await expect(setDoc(doc(db, 'users', uid, 'backups', 'x'), { state: '{}' })).rejects.toMatchObject(DENIED)
    })

    it('laat niemand binnen zonder in te loggen', async () => {
      await pushState(uid, 0, state(1), 'w')
      await signOut(auth)
      await expect(getDoc(doc(db, 'users', uid))).rejects.toMatchObject(DENIED)
    })

    it('laat geen andere documenten toe dan je eigen gegevens en back-ups', async () => {
      await expect(setDoc(doc(db, 'users', uid, 'iets', 'x'), { a: 1 })).rejects.toMatchObject(DENIED)
      await expect(setDoc(doc(db, 'clubs', 'lummen'), { a: 1 })).rejects.toMatchObject(DENIED)
    })
  })
})
