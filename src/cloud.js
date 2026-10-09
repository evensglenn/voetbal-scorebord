// Synchronisatie met het Google-account (Firebase). localStorage blijft de
// echte opslag: de app werkt dus nog altijd volledig zonder netwerk. Wie
// ingelogd is, krijgt elke wijziging na een paar seconden ook online, en
// wijzigingen van een ander toestel komen vanzelf binnen.
//
// Elke online versie heeft een updatedAt. We onthouden op welke versie de
// lokale staat verder bouwt (base) en of er sindsdien lokaal iets veranderde
// (dirty). Wegschrijven lukt enkel als online nog altijd base staat; anders
// voegen we eerst samen (zie merge) en proberen opnieuw.
//
// Inloggen is verplicht. De eerste keer dat een toestel met gegevens aan een
// account gekoppeld wordt (joined), vraagt de app of die gegevens mee moeten
// of gewist mogen worden; tot dan gaat er niets online.
import { useCallback, useEffect, useRef, useState } from 'react'
import { firebaseConfig } from './firebase-config.js'

export const cloudAvailable = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

const META_KEY = 'scorebord-cloud'
// Even wachten na een wijziging, zodat een reeks tikken (doelpunt, wissel,
// klok) samen in één keer online gaat.
const PUSH_DELAY = 2000
const RETRY_DELAY = 15000

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) ?? {}
  } catch {
    return {}
  }
}

function writeMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // opslag geweigerd: na herladen wordt alles gewoon opnieuw samengevoegd
  }
}

const newWriteId = () => Math.random().toString(36).slice(2, 12)

// Een nieuw toestel zonder spelers of uitslagen: niets om te bewaren, dus
// gewoon de online gegevens overnemen in plaats van samen te voegen.
const isEmpty = (s) =>
  s.history.length === 0 && s.teams.every((t) => t.players.length === 0 && !t.started)

// Twee toestellen hebben tegelijk iets gewijzigd. Uitslagen en ploegen van
// beide kanten blijven bewaard; voor een ploeg die op beide bestaat, wint
// die van dit toestel (daar is net op getikt).
function merge(local, remote) {
  const teams = new Map(remote.teams.map((t) => [t.id, t]))
  for (const t of local.teams) teams.set(t.id, t)
  const history = new Map()
  for (const h of [...remote.history, ...local.history]) history.set(h.id, h)
  return withActiveTeam(
    {
      teams: [...teams.values()],
      history: [...history.values()].sort((a, b) =>
        (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''),
      ),
    },
    local,
  )
}

// Welke ploeg openstaat, blijft per toestel: de tablet kan zo de
// statistieken van de U9 bekijken terwijl de gsm de U7 bijhoudt.
const withActiveTeam = (next, local) => ({
  ...next,
  activeTeamId: next.teams.some((t) => t.id === local.activeTeamId)
    ? local.activeTeamId
    : (next.activeTeamId ?? next.teams[0].id),
})

const summarize = (s) => ({ teams: s.teams.length, matches: s.history.length })

export function useCloudSync(state, setState, { fromStored, freshState }) {
  const [cloud, setCloud] = useState(null)
  // undefined = nog niet geweten (Firebase laadt nog), null = niet ingelogd
  const [user, setUser] = useState(cloudAvailable ? undefined : null)
  // Firebase kon niet geladen worden (eerste keer geopend zonder netwerk).
  const [loadFailed, setLoadFailed] = useState(false)
  // Eerste koppeling met gegevens op beide (of enkel deze) kant: wacht op een keuze.
  const [choice, setChoice] = useState(null)
  const [meta, setMetaView] = useState(() => ({
    base: 0,
    dirty: true,
    joined: false,
    signedIn: false,
    ...readMeta(),
  }))
  const metaRef = useRef(meta)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  // Elke verhoging herstart de wachttijd om op te laden (na een fout, na
  // terugkomend netwerk, of na een opgeladen versie die intussen al verouderd is).
  const [kick, setKick] = useState(0)

  const stateRef = useRef(state)
  stateRef.current = state
  const lastState = useRef(state)
  const fromRemote = useRef(null)
  const pushing = useRef(false)

  const saveMeta = useCallback((patch) => {
    metaRef.current = { ...metaRef.current, ...patch }
    writeMeta(metaRef.current)
    setMetaView(metaRef.current)
  }, [])

  useEffect(() => {
    if (!cloudAvailable) return
    let cancelled = false
    let unwatch
    import('./firebase.js')
      .then((module) => {
        if (cancelled) return
        setCloud(module)
        unwatch = module.watchUser(setUser)
      })
      .catch(() => {
        // Offline geopend en Firebase (nog) niet in de cache. Wie hier al
        // ingelogd was, kan gewoon verder; synchroniseren wacht dan.
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
      unwatch?.()
    }
  }, [])

  useEffect(() => {
    const up = () => {
      setOnline(true)
      setKick((n) => n + 1)
    }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  // Een ander account dan het vorige: opnieuw koppelen (en dus vragen wat
  // er met de gegevens op dit toestel moet gebeuren). Hetzelfde account na
  // uitloggen gaat gewoon verder waar het was.
  useEffect(() => {
    if (user === undefined) return
    if (!user) {
      if (metaRef.current.signedIn) saveMeta({ signedIn: false })
      return
    }
    if (metaRef.current.uid !== user.uid) {
      saveMeta({ uid: user.uid, base: 0, dirty: true, joined: false, syncedAt: null, writeId: null })
    }
    if (!metaRef.current.signedIn) saveMeta({ signedIn: true })
  }, [user, saveMeta])

  // Elke wijziging die hier gemaakt is (en dus niet net van online kwam)
  // moet nog opgeladen worden.
  useEffect(() => {
    if (state === lastState.current) return
    lastState.current = state
    if (state === fromRemote.current) return
    if (!metaRef.current.dirty) saveMeta({ dirty: true })
  }, [state, saveMeta])

  const receive = useCallback(
    (remote) => {
      const data = remote && fromStored(remote.state)
      if (!data) return
      const local = stateRef.current
      if (metaRef.current.dirty && !isEmpty(local)) {
        // Beide kanten veranderd: samenvoegen; het resultaat telt als lokale
        // wijziging en gaat daarna zelf terug online.
        saveMeta({ base: remote.updatedAt })
        setState(merge(local, data))
        return
      }
      const next = withActiveTeam(data, local)
      fromRemote.current = next
      saveMeta({ base: remote.updatedAt, dirty: false, syncedAt: Date.now() })
      setState(next)
    },
    [fromStored, setState, saveMeta],
  )

  // Eerste online versie voor dit account op dit toestel.
  const join = useCallback(
    (remote) => {
      const data = remote && fromStored(remote.state)
      const local = stateRef.current
      if (!isEmpty(local)) {
        setChoice({
          local: summarize(local),
          remote: data ? { data, updatedAt: remote.updatedAt, ...summarize(data) } : null,
        })
        return
      }
      // Niets op dit toestel: gewoon overnemen wat in het account staat.
      if (data) {
        const next = withActiveTeam(data, local)
        fromRemote.current = next
        setState(next)
      }
      saveMeta({
        joined: true,
        dirty: false,
        base: data ? remote.updatedAt : 0,
        syncedAt: data ? Date.now() : null,
      })
    },
    [fromStored, setState, saveMeta],
  )

  const resolveChoice = useCallback(
    (keepLocal) => {
      const remote = choice?.remote
      if (keepLocal) {
        if (remote) setState(merge(stateRef.current, remote.data))
        saveMeta({ joined: true, dirty: true, base: remote?.updatedAt ?? 0 })
      } else {
        const next = remote ? withActiveTeam(remote.data, stateRef.current) : freshState()
        fromRemote.current = next
        setState(next)
        saveMeta({
          joined: true,
          dirty: false,
          base: remote?.updatedAt ?? 0,
          syncedAt: remote ? Date.now() : null,
        })
      }
      setChoice(null)
    },
    [choice, freshState, setState, saveMeta],
  )

  useEffect(() => {
    if (!cloud || !user) return
    return cloud.watchState(
      user.uid,
      (remote) => {
        setError(null)
        if (!metaRef.current.joined) {
          join(remote)
          return
        }
        if (!remote) {
          // Nog niets online voor dit account: wat hier staat, gaat erheen.
          if (!metaRef.current.dirty) saveMeta({ dirty: true })
          return
        }
        // Onze eigen schrijfactie of een versie die we al hebben.
        if (remote.writeId === metaRef.current.writeId || remote.updatedAt === metaRef.current.base) {
          return
        }
        receive(remote)
      },
      (e) => setError(e?.code ?? 'onbekend'),
    )
  }, [cloud, user, join, receive, saveMeta])

  const push = useCallback(async () => {
    if (pushing.current || !metaRef.current.dirty || !navigator.onLine) return
    pushing.current = true
    setBusy(true)
    const sent = stateRef.current
    const writeId = newWriteId()
    saveMeta({ writeId })
    try {
      const result = await cloud.pushState(user.uid, metaRef.current.base, sent, writeId)
      if (result.conflict) {
        receive(result.conflict)
      } else {
        saveMeta({
          base: result.updatedAt,
          dirty: stateRef.current !== sent,
          syncedAt: Date.now(),
        })
      }
      setError(null)
    } catch (e) {
      setError(e?.code ?? 'onbekend')
      setTimeout(() => setKick((n) => n + 1), RETRY_DELAY)
    } finally {
      pushing.current = false
      setBusy(false)
      // Tijdens het opladen nog iets gewijzigd: meteen een nieuwe ronde.
      if (metaRef.current.dirty) setKick((n) => n + 1)
    }
  }, [cloud, user, receive, saveMeta])

  useEffect(() => {
    if (!cloud || !user || !meta.joined || !meta.dirty || !online) return
    const id = setTimeout(push, PUSH_DELAY)
    return () => clearTimeout(id)
  }, [cloud, user, meta.joined, meta.dirty, online, state, kick, push])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      await cloud.signIn()
    } catch (e) {
      setError(e?.code ?? 'onbekend')
    }
  }, [cloud])

  // Uitloggen laat alles op dit toestel staan (de app is dan wel op slot).
  // Wat nog niet online stond, gaat mee bij de volgende login met hetzelfde
  // account.
  const signOut = useCallback(async () => {
    await cloud.signOut().catch(() => {})
    setError(null)
  }, [cloud])

  const status = !user
    ? 'offline'
    : !meta.joined
      ? 'syncing'
      : error
      ? 'error'
      : !online
        ? 'offline'
        : busy || meta.dirty
          ? 'syncing'
          : 'synced'

  return {
    available: cloudAvailable,
    // Op slot tot er ingelogd is. Wie op dit toestel al ingelogd was, mag er
    // meteen in, ook terwijl Firebase nog laadt of offline niet laadt.
    locked: cloudAvailable && (user === null || (user === undefined && !meta.signedIn)),
    loading: user === undefined && !loadFailed,
    loadFailed,
    user: user ?? null,
    choice,
    resolveChoice,
    status,
    error,
    syncedAt: meta.syncedAt ?? null,
    signIn,
    signOut,
  }
}
