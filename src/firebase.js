// Alles wat Firebase rechtstreeks aanspreekt. Wordt pas ingeladen (dynamische
// import in cloud.js) na de eerste weergave, zodat de app aan de zijlijn even
// snel opent als vroeger.
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore'
import { firebaseConfig } from './firebase-config.js'
import { version as APP_VERSION } from '../package.json'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
auth.languageCode = 'nl'
const db = getFirestore(app)

// Firestore bewaart een document tot 1 MiB; hou wat marge.
const MAX_SIZE = 1_000_000

// Eén document per gebruiker, met de hele app-staat als JSON-tekst erin. Zo
// hoeft het dataformaat niet in Firestore-velden vertaald te worden en blijft
// fromStored (zelfde als voor localStorage en back-ups) de enige ingang.
const userDoc = (uid) => doc(db, 'users', uid)
// Back-ups: losse kopieën van de hele staat, naast het hoofddocument.
const backupsOf = (uid) => collection(db, 'users', uid, 'backups')
const KEEP_BACKUPS = 8

const toJson = (state) => {
  const json = JSON.stringify(state)
  if (json.length > MAX_SIZE) throw Object.assign(new Error('te groot'), { code: 'too-large' })
  return json
}

export const watchUser = (callback) =>
  onAuthStateChanged(auth, (user) =>
    callback(
      user
        ? { uid: user.uid, name: user.displayName, email: user.email, photo: user.photoURL }
        : null,
    ),
  )

export async function signIn() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    // Venster geblokkeerd of niet mogelijk (sommige als-app-geïnstalleerde
    // browsers): dan via een omweg langs de Google-pagina zelf.
    if (
      e?.code === 'auth/popup-blocked' ||
      e?.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      await signInWithRedirect(auth, provider)
      return
    }
    // Zelf weggeklikt: geen fout.
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') {
      return
    }
    throw e
  }
}

export const signOut = () => firebaseSignOut(auth)

const readRemote = (data) => {
  try {
    return { state: JSON.parse(data.state), updatedAt: data.updatedAt, writeId: data.writeId }
  } catch {
    return null
  }
}

// Meldt elke versie die echt van de server komt. Tussenstanden uit de lokale
// cache (bv. offline) slaan we over: die zeggen niets over wat er online staat.
export const watchState = (uid, onRemote, onError) =>
  onSnapshot(
    userDoc(uid),
    (snap) => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return
      onRemote(snap.exists() ? readRemote(snap.data()) : null)
    },
    onError,
  )

// Schrijft de staat weg, maar enkel als de online versie nog die is waarop
// deze staat verder bouwt (base). Anders heeft een ander toestel intussen iets
// bewaard en krijgt de oproeper die versie terug om eerst samen te voegen.
export async function pushState(uid, base, state, writeId) {
  const json = toJson(state)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(userDoc(uid))
    const remote = snap.exists() ? snap.data() : null
    if (remote && remote.updatedAt !== base) return { conflict: readRemote(remote) }
    const updatedAt = Math.max(Date.now(), (remote?.updatedAt ?? 0) + 1)
    tx.set(userDoc(uid), { state: json, updatedAt, writeId, appVersion: APP_VERSION })
    return { updatedAt }
  })
}

// Nieuwste eerst. Met de inhoud erbij, zodat terugzetten geen extra ophaling vraagt.
export async function listBackups(uid) {
  const snap = await getDocs(query(backupsOf(uid), orderBy('createdAt', 'desc')))
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      createdAt: data.createdAt,
      reason: data.reason ?? 'week',
      teams: data.teams ?? 0,
      matches: data.matches ?? 0,
      state: data.state,
    }
  })
}

// Bewaart een kopie en ruimt alles op voorbij de laatste KEEP_BACKUPS. Met
// ifOlderThan gebeurt er niets als er al een recentere kopie is (bv. net
// gemaakt door een ander toestel); dan komt die datum terug.
export async function saveBackup(uid, state, { reason, ifOlderThan } = {}) {
  const existing = await listBackups(uid)
  if (ifOlderThan && existing[0] && existing[0].createdAt > Date.now() - ifOlderThan) {
    return existing[0].createdAt
  }
  const createdAt = Date.now()
  await setDoc(doc(backupsOf(uid)), {
    state: toJson(state),
    createdAt,
    reason,
    teams: state.teams.length,
    matches: state.history.length,
    appVersion: APP_VERSION,
  })
  await Promise.all(
    existing.slice(KEEP_BACKUPS - 1).map((b) => deleteDoc(doc(backupsOf(uid), b.id))),
  )
  return createdAt
}
