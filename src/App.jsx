import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { drawSummary, loadClubLogo, heightFor, W as SHOT_W } from './summary.js'
import { version as APP_VERSION } from '../package.json'

const STORAGE_KEY = 'matchblad.v1'
const TEAM = 'Lummen United'
const OPPONENT = 'Tegenstander'
const CLUB_LOGO = `${import.meta.env.BASE_URL}club-logo.png`

// Officiële Voetbal Vlaanderen-spelfiches: formaat + aanbevolen periodes/minuten
// per leeftijd. Periodes/minuten zijn nadien vrij aanpasbaar (oefenmatchen en
// tornooien wijken vaak af); dit dient enkel als slim standaardvoorstel.
// U18 komt niet voor in de officiële fiches (die springen van U17 naar
// U19-U21) en krijgt daarom voorlopig dezelfde waarden als U19-U21.
// U7 wijkt bewust af van de officiële fiche (2 × 5') naar de waarde die bij
// deze club effectief gebruikt wordt (4 × 10').
const AGE_CONFIG = {
  U6: { format: '2v2', periods: 2, minutes: 3 },
  U7: { format: '3v3', periods: 4, minutes: 10 },
  U8: { format: '5v5', periods: 4, minutes: 15 },
  U9: { format: '5v5', periods: 4, minutes: 15 },
  U10: { format: '8v8', periods: 4, minutes: 15 },
  U11: { format: '8v8', periods: 4, minutes: 15 },
  U12: { format: '8v8', periods: 4, minutes: 20 },
  U13: { format: '8v8', periods: 4, minutes: 20 },
  U14: { format: '11v11', periods: 4, minutes: 20 },
  U15: { format: '11v11', periods: 4, minutes: 20 },
  U16: { format: '11v11', periods: 4, minutes: 20 },
  U17: { format: '11v11', periods: 4, minutes: 20 },
  U18: { format: '11v11', periods: 2, minutes: 45 },
  U19: { format: '11v11', periods: 2, minutes: 45 },
  U20: { format: '11v11', periods: 2, minutes: 45 },
  U21: { format: '11v11', periods: 2, minutes: 45 },
}
const AGE_ORDER = Object.keys(AGE_CONFIG)

const FORMAT_LABELS = {
  '2v2': '2 tegen 2',
  '3v3': '3 tegen 3',
  '5v5': '5 tegen 5',
  '8v8': '8 tegen 8',
  '11v11': '11 tegen 11',
}

const FORMAT_RULES_URL = {
  '2v2': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/2V2_Spelreglement+jeugdvoetbal.pdf',
  '3v3': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/3V3_Spelreglementjeugdvoetbalposter.pdf',
  '5v5': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/5V5_Spelreglementjeugdvoetbalposter.pdf',
  '8v8': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/8V8_Spelreglementjeugdvoetbalposter.pdf',
  '11v11': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/11V11_Spelreglementjeugdvoetbalposter.pdf',
}

// Wisselmelding: aftellen vanaf zoveel seconden vooraf, en de melding
// zoveel seconden laten staan na het wisselmoment zelf. subMinutes per ploeg:
// null = halverwege elke periode, 0 = uit, anders om de zoveel minuten.
const SUB_COUNTDOWN = 30
const SUB_NOTICE = 20

// Gesproken meldingen staan standaard aan; uitzetten kan in Instellingen.
const SPEECH_KEY = 'scorebord-speech'
function speechEnabled() {
  try {
    return localStorage.getItem(SPEECH_KEY) !== 'off'
  } catch {
    return true
  }
}

// Spreekt een korte melding uit via de spraak van het toestel (Nederlandse
// stem als die er is). Loopt enkel zolang de app op het scherm staat.
function say(text, { force = false } = {}) {
  if (!force && !speechEnabled()) return
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'nl-BE'
  const voices = synth.getVoices()
  const voice =
    voices.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'nl-be') ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('nl'))
  if (voice) utterance.voice = voice
  synth.cancel()
  synth.speak(utterance)
}

// iOS laat spraak pas toe nadat ze één keer vanuit een tik gestart werd;
// daarom bij het starten van de klok een stille, lege uitspraak.
function unlockSpeech() {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(' ')
  utterance.volume = 0
  synth.speak(utterance)
}

// Toont ook een gewone telefoonmelding, die Android doorstuurt naar een
// gekoppeld horloge. Enkel met toestemming, en via de service worker: Android
// Chrome kent geen losse `new Notification`.
function notify(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  navigator.serviceWorker?.ready
    .then((registration) =>
      registration.showNotification(title, {
        body,
        tag: 'scorebord-alert',
        renotify: true,
        icon: `${import.meta.env.BASE_URL}icon-192.png`,
      }),
    )
    .catch(() => {})
}

// Toestemming kan enkel vanuit een tik gevraagd worden; we vragen het één
// keer, bij de start van de wedstrijd of van de klok.
function askNotificationPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  try {
    Notification.requestPermission()?.catch?.(() => {})
  } catch {
    // oudere browsers zonder toestemmingsvraag: dan blijft het bij trillen en spraak
  }
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyTeam = (ageGroup = 'U9') => {
  const cfg = AGE_CONFIG[ageGroup] ?? AGE_CONFIG.U9
  return {
    id: uid(),
    ageGroup,
    periodsCount: cfg.periods,
    periodMinutes: cfg.minutes,
    home: true,
    opponent: '',
    players: [],
    events: [],
    penalties: [],
    period: 1,
    clocks: Array(cfg.periods).fill(0),
    started: false,
    activePlayerIds: [],
    runningSince: null,
    subMinutes: null,
  }
}

// Houdt clocks/period in lijn met periodsCount, ook nadat iemand dat aantal
// handmatig wijzigt of na het inladen van (mogelijk verouderde) opslag.
function normalizeTeam(team) {
  const n = Math.max(1, team.periodsCount || 1)
  const playerIds = team.players.map((p) => p.id)
  return {
    ...team,
    periodsCount: n,
    clocks: Array.from({ length: n }, (_, i) => team.clocks?.[i] ?? 0),
    period: Math.min(Math.max(team.period || 1, 1), n),
    started: team.started ?? hadActivity(team),
    // Opslag van vóór dit veld had geen selectie: dan telt de hele ploeg mee.
    // Verwijderde spelers vallen automatisch weg uit de selectie.
    activePlayerIds: (team.activePlayerIds ?? playerIds).filter((id) => playerIds.includes(id)),
    runningSince: team.runningSince ?? null,
    penalties: team.penalties ?? [],
    subMinutes: team.subMinutes ?? null,
    extraPeriods: team.extraPeriods ?? 0,
    endedEarly: team.endedEarly ?? false,
  }
}

// Voor opslag van vóór het "started"-veld: een team met al gescoorde
// doelpunten of een gelopen klok was toen al onderweg.
const hadActivity = (t) =>
  Boolean(t.events?.length > 0 || (t.clocks ?? []).some((c) => c > 0))

// Thema apart bewaard, zodat index.html het al kan zetten vóór React start
// (geen flits van het verkeerde thema bij het openen).
const THEME_KEY = 'scorebord-theme'
const THEMES = ['auto', 'light', 'dark']

function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return THEMES.includes(t) ? t : 'auto'
  } catch {
    return 'auto'
  }
}

// Zet opgeslagen gegevens (uit localStorage of een back-up) om naar een
// geldige app-staat; null als er niets bruikbaars in zit.
function fromStored(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const history = Array.isArray(parsed.history) ? parsed.history : []
  if (Array.isArray(parsed.teams) && parsed.teams.length > 0) {
    const teams = parsed.teams.map((t) =>
      normalizeTeam({
        ...emptyTeam(t.ageGroup),
        ...t,
        started: t.started ?? hadActivity(t),
        activePlayerIds: t.activePlayerIds ?? (t.players ?? []).map((p) => p.id),
      }),
    )
    const activeTeamId = teams.some((t) => t.id === parsed.activeTeamId)
      ? parsed.activeTeamId
      : teams[0].id
    return { teams, activeTeamId, history }
  }
  // Oud, plat matchformaat (vóór meerdere ploegen): wrap als eerste ploeg
  // zodat bestaande matchgegevens niet verloren gaan.
  if (!Array.isArray(parsed.players) && !Array.isArray(parsed.events)) return null
  const legacy = normalizeTeam({
    ...emptyTeam(parsed.ageGroup ?? 'U9'),
    ...parsed,
    started: parsed.started ?? hadActivity(parsed),
    activePlayerIds: parsed.activePlayerIds ?? (parsed.players ?? []).map((p) => p.id),
  })
  return { teams: [legacy], activeTeamId: legacy.id, history }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const restored = raw && fromStored(JSON.parse(raw))
    if (restored) return restored
  } catch {
    // onleesbare opslag: begin met een lege ploeg
  }
  const first = emptyTeam('U9')
  return { teams: [first], activeTeamId: first.id, history: [] }
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Een hattrick is drie doelpunten na elkaar van dezelfde speler. Elk ander doelpunt
// breekt de reeks: van een ploegmaat, van de tegenstander, of een doelpunt zonder naam.
function analyseRuns(events) {
  const n = events.length
  const lens = new Array(n).fill(0)
  let prev = null

  events.forEach((e, i) => {
    if (e.team === 'us' && e.playerId) {
      lens[i] = e.playerId === prev ? lens[i - 1] + 1 : 1
      prev = e.playerId
    } else {
      lens[i] = 0
      prev = null
    }
  })

  // Terugwaarts bepalen hoe lang de reeks wordt waar dit doelpunt bij hoort.
  const inHattrick = new Array(n).fill(false)
  let runMax = 0
  for (let i = n - 1; i >= 0; i--) {
    const continues = i + 1 < n && lens[i] > 0 && lens[i + 1] === lens[i] + 1
    runMax = continues ? runMax : lens[i]
    inHattrick[i] = lens[i] > 0 && runMax >= 3
  }

  const streak = {}
  const hat = {}
  const hattricks = {}
  events.forEach((e, i) => {
    streak[e.id] = lens[i]
    hat[e.id] = inHattrick[i]
    if (lens[i] === 3) hattricks[e.playerId] = (hattricks[e.playerId] ?? 0) + 1
  })

  const last = n > 0 && lens[n - 1] > 0 ? { playerId: events[n - 1].playerId, len: lens[n - 1] } : null

  return { streak, hat, hattricks, live: last }
}

const formatNames = (names) => {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// Spelers met evenveel doelpunten (en evenveel hattricks) samen op één regel,
// bv. "Seppe & Rune". De lijst moet al gesorteerd zijn op goals/hattricks zodat
// gelijke reeksen naast elkaar staan.
function groupScorers(scorers) {
  const groups = []
  for (const s of scorers) {
    const last = groups[groups.length - 1]
    if (last && last.goals === s.goals && last.hattricks === s.hattricks) {
      last.names.push(s.name)
    } else {
      groups.push({ names: [s.name], goals: s.goals, hattricks: s.hattricks })
    }
  }
  return groups.map((g) => ({
    name: formatNames(g.names),
    names: g.names,
    goals: g.goals,
    hattricks: g.hattricks,
  }))
}

// Zet een (lopende of afgewerkte) match om in het data-formaat dat de
// samenvattingsafbeelding (Summary/drawSummary) verwacht. Puur op basis van
// de match zelf, zodat dit ook werkt voor bewaarde matchen in de historiek.
function buildSummary(match) {
  const opponentName = match.opponent?.trim() || OPPONENT
  const score = {
    us: match.events.filter((e) => e.team === 'us').length,
    them: match.events.filter((e) => e.team === 'them').length,
  }
  const goalsBy = {}
  for (const e of match.events) {
    if (e.playerId) goalsBy[e.playerId] = (goalsBy[e.playerId] ?? 0) + 1
  }
  const runs = analyseRuns(match.events)

  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = match.home ? [ours, theirs] : [theirs, ours]

  let us = 0
  let them = 0
  const events = match.events.map((e) => {
    if (e.team === 'us') us += 1
    else them += 1
    const player = match.players.find((p) => p.id === e.playerId)
    const len = runs.streak[e.id]
    const hatLabel = runs.hat[e.id] && len >= 3 ? (len === 3 ? 'hattrick' : `${len} op rij`) : null
    return {
      team: e.team,
      period: e.period,
      us,
      them,
      name: e.team === 'us' ? (player?.name ?? null) : null,
      clock: e.clock,
      hatLabel,
    }
  })

  const scorers = groupScorers(
    match.players
      .map((p) => ({
        name: p.name,
        goals: goalsBy[p.id] ?? 0,
        hattricks: runs.hattricks[p.id] ?? 0,
      }))
      .filter((s) => s.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name)),
  )

  const unnamed = match.events.filter((e) => e.team === 'us' && !e.playerId).length
  if (unnamed > 0) scorers.push({ name: 'Own goal', goals: unnamed, hattricks: 0 })

  const penalties = match.penalties ?? []
  const penaltiesSummary =
    penalties.length === 0
      ? null
      : {
          us: {
            scored: penalties.filter((p) => p.team === 'us' && p.scored).length,
            total: penalties.filter((p) => p.team === 'us').length,
          },
          them: {
            scored: penalties.filter((p) => p.team === 'them' && p.scored).length,
            total: penalties.filter((p) => p.team === 'them').length,
          },
          attempts: penalties.map((p) => ({
            team: p.team,
            name:
              p.team === 'us'
                ? (match.players.find((pl) => pl.id === p.playerId)?.name ?? 'Onbekende speler')
                : opponentName,
            scored: p.scored,
          })),
        }

  return {
    date: new Date().toLocaleDateString('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    ourName: TEAM,
    theirName: opponentName,
    ageGroup: match.ageGroup,
    periodsCount: match.periodsCount,
    left,
    right,
    events,
    scorers,
    penalties: penaltiesSummary,
  }
}

export default function App() {
  const [state, setState] = useState(load)
  const activeTeam = state.teams.find((t) => t.id === state.activeTeamId) ?? state.teams[0]
  const match = activeTeam
  // Zolang er al gescoord is of de klok al gelopen heeft, is deze match "bezig"
  // en staan we niet toe dat er tussentijds van ploeg gewisseld wordt — dat kan
  // enkel na "Nieuwe match".
  const matchInProgress = match.events.length > 0 || match.clocks.some((c) => c > 0)

  // Werkt op de actieve ploeg, maar laat de rest van de app ongewijzigd
  // gewoon "setMatch((m) => ({...m, ...}))" gebruiken zoals voorheen.
  const setMatch = (updater) => {
    setState((s) => ({
      ...s,
      teams: s.teams.map((t) =>
        t.id === s.activeTeamId
          ? normalizeTeam(typeof updater === 'function' ? updater(t) : { ...t, ...updater })
          : t,
      ),
    }))
  }

  const switchTeam = (id) => {
    if (id === state.activeTeamId || matchInProgress) return
    setState((s) => ({ ...s, activeTeamId: id }))
  }

  const addTeam = (ageGroup) => {
    const team = emptyTeam(ageGroup)
    setState((s) => ({ ...s, teams: [...s.teams, team], activeTeamId: team.id }))
  }

  const removeTeam = (id) => {
    setState((s) => {
      if (s.teams.length <= 1) return s
      const teams = s.teams.filter((t) => t.id !== id)
      const activeTeamId = s.activeTeamId === id ? teams[0].id : s.activeTeamId
      return { ...s, teams, activeTeamId }
    })
  }

  // De klok staat "aan" zolang runningSince gezet is — dat tijdstip wordt mee
  // opgeslagen, zodat de effectief verstreken tijd (Date.now() - runningSince)
  // ook correct blijft nadat de app op de achtergrond gooide of de tab even
  // helemaal herladen werd, in plaats van te pauzeren omdat setInterval-ticks
  // daar niet doorlopen.
  const running = match.runningSince != null
  const [screen, setScreen] = useState('match')
  // Instellingen is geen tab: onthoud waar je vandaan kwam om terug te keren.
  const settingsBack = useRef('match')
  const toggleSettings = () => {
    if (screen === 'settings') {
      setScreen(settingsBack.current)
    } else {
      settingsBack.current = screen
      setScreen('settings')
    }
  }
  const [startingMatch, setStartingMatch] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [editingSubs, setEditingSubs] = useState(false)
  const [viewingHistory, setViewingHistory] = useState(null)
  const [compactBoard, setCompactBoard] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [theme, setTheme] = useState(loadTheme)
  const [speech, setSpeech] = useState(speechEnabled)
  const changeSpeech = (on) => {
    try {
      if (on) localStorage.removeItem(SPEECH_KEY)
      else localStorage.setItem(SPEECH_KEY, 'off')
    } catch {
      // opslag geweigerd; de keuze geldt dan niet na herladen
    }
    setSpeech(on)
    // Meteen laten horen hoe het klinkt (en iOS ontgrendelen vanuit de tik).
    if (on) say('Gesproken meldingen staan aan', { force: true })
    else window.speechSynthesis?.cancel()
  }
  const [autoBackup, setAutoBackup] = useState(() => {
    try {
      return localStorage.getItem(AUTO_BACKUP_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      if (autoBackup) localStorage.setItem(AUTO_BACKUP_KEY, '1')
      else localStorage.removeItem(AUTO_BACKUP_KEY)
    } catch {
      // opslag geweigerd; de keuze geldt dan enkel voor deze sessie
    }
  }, [autoBackup])
  const [standalone] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  )

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      if (theme === 'auto') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch {
      // opslag geweigerd; het thema geldt dan enkel voor deze sessie
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // opslag geweigerd; de gegevens blijven in het geheugen staan
    }
  }, [state])

  // Drijft enkel her-renders aan zodat de klok (die zelf uit runningSince
  // wordt herberekend) live meetelt. Bij terugkeer uit de achtergrond — waar
  // setInterval geen doorgang vindt — haalt visibilitychange/focus de
  // weergave meteen in, in plaats van tot de volgende seconde te wachten.
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const bump = () => forceTick((n) => n + 1)
    const id = setInterval(bump, 1000)
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('focus', bump)
    }
  }, [running])

  // Zolang de klok loopt, houden we het scherm wakker: een webapp kan bij een
  // vergrendeld scherm niet meer trillen of spreken. Het systeem geeft die
  // vergrendeling vrij zodra de app naar de achtergrond gaat, dus bij
  // terugkeer vragen we ze opnieuw aan.
  useEffect(() => {
    if (!running || !navigator.wakeLock) return
    let lock = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) next.release()
        else lock = next
      } catch {
        // geweigerd (bv. batterijbesparing); de klok werkt gewoon verder
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [running])

  useEffect(() => {
    // De sticky kop zelf krimpt zo'n 70px wanneer hij compact wordt (minder
    // padding, kleinere cijfers). Die krimp verschuift de pagina-inhoud, wat
    // op zijn beurt scrollY kan doen meebewegen (scroll anchoring) — met een
    // te kleine dode zone tussen de twee drempels ontstond daardoor een lus
    // die de kop constant liet "flippen" tussen groot en klein. De zone moet
    // dus ruim groter zijn dan die krimp.
    const onScroll = () => {
      setCompactBoard((compact) =>
        compact ? window.scrollY > 12 : window.scrollY > 120,
      )
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true)
    window.addEventListener('scorebord:update-available', onUpdate)
    return () => window.removeEventListener('scorebord:update-available', onUpdate)
  }, [])

  const PERIODS = Array.from({ length: match.periodsCount }, (_, i) => i + 1)
  const clock =
    match.clocks[match.period - 1] +
    (match.runningSince ? Math.floor((Date.now() - match.runningSince) / 1000) : 0)
  const periodSeconds = match.periodMinutes * 60
  const extraSeconds = Math.max(0, clock - periodSeconds)
  const periodProgress = periodSeconds > 0 ? Math.min(1, clock / periodSeconds) : 0
  // Enkel zolang de nieuwe periode nog niet begonnen is: daarna is
  // "Periode x gestart · Klok staat klaar" niet meer juist.
  const canUndoPeriod =
    match.period > 1 &&
    !running &&
    match.clocks[match.period - 1] === 0 &&
    !match.events.some((event) => event.period === match.period)

  const [timeUp, setTimeUp] = useState(false)
  const prevClock = useRef(clock)
  useEffect(() => {
    const prev = prevClock.current
    prevClock.current = clock
    // ">=" i.p.v. "===": als de app een tijdje op de achtergrond stond, kan de
    // klok in één keer over de periodegrens heen springen.
    if (periodSeconds <= 0 || prev >= periodSeconds || clock < periodSeconds) return
    navigator.vibrate?.([160, 90, 160])
    const ended = match.period >= match.periodsCount ? 'Einde wedstrijd' : `Einde periode ${match.period}`
    say(ended)
    notify(ended, `${TEAM} ${score.us}–${score.them} ${opponentName}`)
    setTimeUp(true)
    const t = setTimeout(() => setTimeUp(false), 1200)
    return () => clearTimeout(t)
  }, [clock, periodSeconds])

  // Wisselmomenten vallen op elk veelvoud van het wisselinterval binnen de
  // periode (het einde van de periode zelf niet). Vóór een moment loopt een
  // aftelling, op het moment zelf trilt de telefoon en blijft een melding
  // nog even staan. Alles wordt uit de klok afgeleid, zodat het ook klopt na
  // pauzeren, terugspoelen of terugkeren uit de achtergrond.
  const subHalfway = match.subMinutes == null
  const subInterval = subHalfway ? Math.floor(periodSeconds / 2) : match.subMinutes * 60
  const subIndex = subInterval > 0 ? Math.floor(clock / subInterval) : 0
  const lastSub = subIndex * subInterval
  const nextSub = lastSub + subInterval
  const subPhase =
    subInterval <= 0
      ? null
      : subIndex > 0 && lastSub < periodSeconds && clock - lastSub < SUB_NOTICE
        ? 'now'
        : nextSub < periodSeconds && nextSub - clock <= SUB_COUNTDOWN
          ? 'soon'
          : null
  // Met het vinkje verberg je de melding voor dit ene wisselmoment; het
  // volgende moment verschijnt gewoon weer.
  const subKey = subPhase && `${match.period}-${subPhase === 'now' ? lastSub : nextSub}`
  const [dismissedSub, setDismissedSub] = useState(null)
  const subDismissed = subKey != null && subKey === dismissedSub
  // Wie tijdens de match de wisseloptie wijzigt, krijgt daardoor niet meteen
  // een melding: enkel echte overgangen van de klok tellen.
  const prevSubInterval = useRef(subInterval)
  const intervalChanged = prevSubInterval.current !== subInterval
  useEffect(() => {
    prevSubInterval.current = subInterval
  })
  const prevSubIndex = useRef(subIndex)
  useEffect(() => {
    const prev = prevSubIndex.current
    prevSubIndex.current = subIndex
    if (intervalChanged || subIndex <= prev || subPhase !== 'now' || subDismissed) return
    navigator.vibrate?.([300, 120, 300, 120, 300])
    say('Tijd voor wissel')
    notify('Tijd voor wissel', `Periode ${match.period} · ${mmss(lastSub)}`)
  }, [subIndex, subPhase, subDismissed])

  // Aankondiging bij het begin van de aftelling — niet als je er pas middenin
  // belandt (na terugspoelen of terugkeren uit de achtergrond).
  const prevSubPhase = useRef(subPhase)
  useEffect(() => {
    const prev = prevSubPhase.current
    prevSubPhase.current = subPhase
    if (intervalChanged || prev === 'soon' || subPhase !== 'soon' || subDismissed) return
    if (nextSub - clock < SUB_COUNTDOWN - 3) return
    say(`Wissel over ${SUB_COUNTDOWN} seconden`)
    notify(`Wissel over ${SUB_COUNTDOWN} seconden`, `Periode ${match.period}`)
  }, [subPhase, subDismissed, nextSub, clock])

  // Een doelpunt terwijl de klok stilstaat wijst meestal op een vergeten
  // start: dan tonen we even een herinnering bij de klok.
  const [goalWhilePaused, setGoalWhilePaused] = useState(false)
  useEffect(() => {
    if (running) setGoalWhilePaused(false)
    if (!goalWhilePaused || running) return
    const t = setTimeout(() => setGoalWhilePaused(false), 8000)
    return () => clearTimeout(t)
  }, [goalWhilePaused, running])

  const clockLabel = running ? 'Pauze' : clock > 0 ? 'Ga verder' : 'Start'
  // Voorbij als de tijd om is, of als de laatste periode vroegtijdig gestopt werd.
  const periodOver =
    (periodSeconds > 0 && clock >= periodSeconds) ||
    (match.endedEarly && match.period >= match.periodsCount)
  const lastPeriod = match.period >= match.periodsCount
  // Strafschoppen, samenvatting en beëindigen horen pas bij het einde van de
  // match: na de laatste periode, of zodra er al strafschoppen genomen zijn.
  const matchFinished = (lastPeriod && periodOver) || match.penalties.length > 0

  const opponentName = match.opponent?.trim() || OPPONENT

  const score = useMemo(() => {
    const us = match.events.filter((e) => e.team === 'us').length
    const them = match.events.filter((e) => e.team === 'them').length
    return { us, them }
  }, [match.events])

  const goalsBy = useMemo(() => {
    const map = {}
    for (const e of match.events) {
      if (e.playerId) map[e.playerId] = (map[e.playerId] ?? 0) + 1
    }
    return map
  }, [match.events])

  const runs = useMemo(() => analyseRuns(match.events), [match.events])

  const squadPlayers = useMemo(
    () => match.players.filter((p) => match.activePlayerIds.includes(p.id)),
    [match.players, match.activePlayerIds],
  )

  const addGoal = (team, playerId = null) => {
    if (!running && clock < periodSeconds) setGoalWhilePaused(true)
    setMatch((m) => ({
      ...m,
      events: [
        ...m.events,
        {
          id: uid(),
          team,
          playerId,
          period: m.period,
          // Lopende tijd meetellen: de opgeslagen klok wordt pas bij pauze bijgewerkt.
          clock: bakeElapsed(m).clocks[m.period - 1] || null,
        },
      ],
    }))
  }

  const undo = () => setMatch((m) => ({ ...m, events: m.events.slice(0, -1) }))

  const removeEvent = (id) =>
    setMatch((m) => ({ ...m, events: m.events.filter((e) => e.id !== id) }))

  const addPenalty = (team, playerId, scored) =>
    setMatch((m) => ({
      ...m,
      penalties: [...m.penalties, { id: uid(), team, playerId, scored }],
    }))

  const removePenalty = (id) =>
    setMatch((m) => ({ ...m, penalties: m.penalties.filter((p) => p.id !== id) }))

  // Zet lopende tijd (runningSince) om in vast opgeslagen seconden op de
  // huidige periode, zodat er niets verloren gaat bij het wisselen van
  // periode of het stoppen van de klok.
  const bakeElapsed = (m) => {
    if (!m.runningSince) return m
    const clocks = [...m.clocks]
    clocks[m.period - 1] += Math.floor((Date.now() - m.runningSince) / 1000)
    return { ...m, clocks, runningSince: null }
  }

  // Na de laatste periode: de klok stilzetten en meteen naar het
  // penaltyblok, opengeklapt en in beeld.
  const [penaltiesOpen, setPenaltiesOpen] = useState(false)
  // Het blok enkel open laten zolang de match ook echt afgelopen is: na een
  // extra periode, terugzetten van de klok of ongedaan maken klapt het weer
  // dicht, zodat het pas na een nieuwe tik op "Strafschoppen" verschijnt.
  useEffect(() => {
    if (!matchFinished) setPenaltiesOpen(false)
  }, [matchFinished])
  // Tijdens de strafschoppen maakt het strafschoppenblok "Wie scoorde?" overbodig.
  const penaltiesShown = matchFinished && (penaltiesOpen || match.penalties.length > 0)
  const goToPenalties = () => {
    if (running) setMatch(bakeElapsed)
    setPenaltiesOpen(true)
    requestAnimationFrame(() =>
      document
        .getElementById('penalties')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  const toggleClock = () => {
    if (!running) {
      unlockSpeech()
      askNotificationPermission()
    }
    // Opnieuw starten maakt een vroegtijdige stop ongedaan.
    setMatch((m) =>
      m.runningSince ? bakeElapsed(m) : { ...m, runningSince: Date.now(), endedEarly: false },
    )
  }

  // Laatste periode vroegtijdig stoppen: klok stil, en dezelfde keuze als na
  // afloop (strafschoppen, extra periode of beëindigen).
  const endEarly = () => setMatch((m) => ({ ...bakeElapsed(m), endedEarly: true }))

  const advancePeriod = () => {
    if (match.period >= PERIODS.length) return
    setMatch((m) => ({ ...bakeElapsed(m), period: m.period + 1 }))
  }

  const undoPeriodChange = () => {
    if (match.period <= 1) return
    setMatch((m) => {
      // Een net toegevoegde extra periode ongedaan maken haalt ze ook weer weg.
      const dropExtra = m.extraPeriods > 0 && m.period === m.periodsCount
      return {
        ...bakeElapsed(m),
        period: m.period - 1,
        ...(dropExtra && {
          periodsCount: m.periodsCount - 1,
          extraPeriods: m.extraPeriods - 1,
        }),
      }
    })
  }

  // Na de laatste periode nog een periode bijspelen, even lang als de andere.
  // Ze telt mee als extra, zodat de volgende match weer met het gewone aantal
  // periodes begint.
  const addExtraPeriod = () => {
    setMatch((m) => ({
      ...bakeElapsed(m),
      endedEarly: false,
      periodsCount: m.periodsCount + 1,
      extraPeriods: m.extraPeriods + 1,
      period: m.periodsCount + 1,
    }))
  }

  const startMatch = ({
    teamId,
    opponent,
    home,
    periodsCount,
    periodMinutes,
    subMinutes,
    activePlayerIds,
  }) => {
    setState((s) => ({
      ...s,
      activeTeamId: teamId,
      teams: s.teams.map((t) =>
        t.id === teamId
          ? normalizeTeam({
              ...t,
              opponent,
              home,
              periodsCount,
              periodMinutes,
              subMinutes,
              extraPeriods: 0,
              endedEarly: false,
              events: [],
              penalties: [],
              period: 1,
              clocks: Array(periodsCount).fill(0),
              started: true,
              activePlayerIds,
              runningSince: null,
            })
          : t,
      ),
    }))
    askNotificationPermission()
    setPenaltiesOpen(false)
    setScreen('match')
    setStartingMatch(false)
  }

  const endMatch = () => {
    const finished = {
      id: uid(),
      teamId: match.id,
      finishedAt: new Date().toISOString(),
      ...buildSummary(match),
    }
    const finish = (s) => ({
      ...s,
      history: [finished, ...s.history],
      teams: s.teams.map((t) =>
        t.id === s.activeTeamId
          ? normalizeTeam({
              ...t,
              started: false,
              events: [],
              penalties: [],
              period: 1,
              periodsCount: t.periodsCount - t.extraPeriods,
              extraPeriods: 0,
              endedEarly: false,
              clocks: [],
              runningSince: null,
            })
          : t,
      ),
    })
    setState(finish)
    // Nog binnen de tik op "Ja, beëindig", zodat het deelvenster mag openen.
    if (autoBackup) saveBackup(finish(state)).catch(() => {})
    setPenaltiesOpen(false)
    setEnding(false)
    // Meteen de samenvatting tonen om te delen; later terug te vinden in de Historiek.
    setViewingHistory(finished)
  }

  const cancelMatch = () => {
    setMatch((m) => ({
      ...m,
      started: false,
      events: [],
      penalties: [],
      period: 1,
      periodsCount: m.periodsCount - m.extraPeriods,
      extraPeriods: 0,
      endedEarly: false,
      clocks: [],
      runningSince: null,
    }))
    setPenaltiesOpen(false)
    setCanceling(false)
  }

  const deleteHistoryEntry = (id) =>
    setState((s) => ({ ...s, history: s.history.filter((h) => h.id !== id) }))

  const resetClock = () => {
    setMatch((m) => {
      const clocks = [...m.clocks]
      clocks[m.period - 1] = 0
      return { ...m, clocks, runningSince: null, endedEarly: false }
    })
    setResetting(false)
  }

  return (
    <div className={screen === 'match' && !match.started ? 'shell is-home' : 'shell'}>
      {/* Op het startscherm zit de titel mee in de startkaart. */}
      {(screen !== 'match' || match.started) && (
        <Scoreboard
          started={match.started}
          home={match.home}
          score={score}
          opponentName={opponentName}
          compact={compactBoard}
        />
      )}

      <nav className="tabs">
        {/* Tijdens een wedstrijd springt Live eruit; zolang de klok loopt,
            pulseert het icoon. */}
        <button
          className={[
            'tab',
            screen === 'match' && 'is-on',
            match.started && 'is-live',
            running && 'is-running',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setScreen('match')}
          aria-current={screen === 'match' ? 'page' : undefined}
          aria-label={match.started ? 'Live – wedstrijd bezig' : undefined}
        >
          <LiveIcon />
          <span>Live</span>
        </button>
        <button
          className={screen === 'squad' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('squad')}
          aria-current={screen === 'squad' ? 'page' : undefined}
        >
          <TeamIcon />
          <span>Ploegen</span>
        </button>
        <button
          className={screen === 'history' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('history')}
          aria-current={screen === 'history' ? 'page' : undefined}
        >
          <HistoryIcon />
          <span>Uitslagen</span>
        </button>
        <button
          className={screen === 'stats' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('stats')}
          aria-current={screen === 'stats' ? 'page' : undefined}
        >
          <StatsIcon />
          <span>Statistieken</span>
        </button>
        <button
          className={screen === 'settings' ? 'tab is-on' : 'tab'}
          onClick={() => screen !== 'settings' && toggleSettings()}
          aria-current={screen === 'settings' ? 'page' : undefined}
        >
          <GearIcon />
          <span>Instellingen</span>
        </button>
      </nav>

      {screen === 'match' ? (
        match.started ? (
        <>
          <div className="pane pane-play">
            {/* Tijdens de strafschoppen spelen klok en periodes geen rol meer. */}
            {!penaltiesShown && (
              <section className="clockbar">
                <PeriodProgress count={PERIODS.length} period={match.period} progress={periodProgress} />
                <div className="clock">
                  <div className="clock-readout">
                    <span className="clock-label">Periode {match.period}</span>
                    <span className={timeUp ? 'clock-num is-timeup' : 'clock-num'}>
                      {mmss(Math.min(clock, periodSeconds))}
                      {extraSeconds > 0 && <span className="clock-extra">+{mmss(extraSeconds)}</span>}
                    </span>
                  </div>
                  <button
                    className={running ? 'btn btn-clock is-running' : 'btn btn-clock'}
                    onClick={toggleClock}
                    aria-label={clockLabel}
                    title={clockLabel}
                  >
                    {running ? <PauseIcon key="pause" /> : <PlayIcon key="play" />}
                    <span>{clockLabel}</span>
                  </button>
                  {match.period < PERIODS.length && !periodOver && (
                    <button
                      className="btn btn-next-period"
                      onClick={advancePeriod}
                      aria-label={`Naar periode ${match.period + 1}`}
                      title={`Naar periode ${match.period + 1}`}
                    >
                      <span>{match.period + 1}</span>
                      <span className="next-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  {/* In de laatste periode is er geen volgende periode meer: die
                      plek dient dan om de wedstrijd vroegtijdig te beëindigen. */}
                  {lastPeriod && !periodOver && (
                    <button
                      className="btn btn-next-period btn-end-early"
                      onClick={endEarly}
                      aria-label="Beëindig de wedstrijd vroegtijdig"
                      title="Beëindig de wedstrijd vroegtijdig"
                    >
                      <FlagIcon />
                    </button>
                  )}
                  {clock > 0 && (
                    <button
                      className="btn btn-quiet btn-clock-reset"
                      onClick={() => setResetting(true)}
                      aria-label="Klok terug op nul"
                      title="Klok terug op nul"
                    >
                      <ResetIcon />
                    </button>
                  )}
                </div>
                <Presence show={(subPhase === 'soon' || subPhase === 'now') && !subDismissed}>
                  {subPhase === 'now' ? (
                    <div className="sub-alert is-now" role="status">
                      <SwapIcon />
                      <strong>Wisselen!</strong>
                      <span>
                        {subHalfway
                          ? `Halverwege periode ${match.period}`
                          : `${mmss(lastSub)} in periode ${match.period}`}
                      </span>
                      <button
                        className="btn btn-icon btn-undo sub-dismiss"
                        onClick={() => setDismissedSub(subKey)}
                        aria-label="Verberg wisselmelding"
                        title="Verberg wisselmelding"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="sub-alert">
                      <span>Wisselen over</span>
                      <strong>{nextSub - clock}s</strong>
                    </div>
                  )}
                </Presence>
                <Presence show={periodOver}>
                  <div
                    className={
                      lastPeriod ? 'period-change period-over is-final' : 'period-change period-over'
                    }
                    role="status"
                  >
                    <div className="period-change-copy">
                      <span className="period-change-check" aria-hidden="true">
                        <FlagIcon />
                      </span>
                      <span>
                        <strong>
                          {lastPeriod ? 'Laatste periode voorbij' : `Periode ${match.period} voorbij`}
                        </strong>
                        {!lastPeriod && (
                          <span>
                            {extraSeconds > 0 ? `Extra tijd +${mmss(extraSeconds)}` : 'De tijd is om'}
                          </span>
                        )}
                      </span>
                    </div>
                    {lastPeriod ? (
                      <div className="period-over-actions">
                        <button className="btn btn-undo btn-period-over" onClick={goToPenalties}>
                          Strafschoppen
                        </button>
                        <button className="btn btn-undo btn-period-over" onClick={addExtraPeriod}>
                          Extra periode
                        </button>
                        <button className="btn btn-undo btn-period-over" onClick={() => setEnding(true)}>
                          Beëindig
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-undo btn-period-over"
                        onClick={advancePeriod}
                        aria-label={`Naar periode ${match.period + 1}`}
                      >
                        Periode {match.period + 1}
                        <span className="next-arrow" aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                </Presence>
                <Presence show={!running && !periodOver && (goalWhilePaused || clock === 0)}>
                  <p className={goalWhilePaused ? 'clock-hint is-warning' : 'clock-hint'}>
                    {goalWhilePaused
                      ? 'De klok loopt niet — tik ▶ om te starten.'
                      : 'Tik ▶ bij de aftrap om de klok te starten.'}
                  </p>
                </Presence>
              </section>
            )}

          <HattrickBanner live={runs.live} players={squadPlayers} />

          {!penaltiesShown && (
            <>
            <h2 className="section-title">Wie scoorde?</h2>
            {match.players.length === 0 ? (
              <p className="empty">
                Nog geen spelers. Voeg ze toe bij <strong>Ploegen</strong> en tik hier daarna
                op de naam van de scorer.
              </p>
            ) : (
              squadPlayers.length === 0 && (
                <p className="empty">
                  Niemand geselecteerd voor deze wedstrijd. Pas dit aan bij{' '}
                  <strong>Nieuwe wedstrijd</strong>.
                </p>
              )
            )}
            <div className="grid">
              {squadPlayers.map((p) => {
                const onARoll = runs.live?.playerId === p.id ? runs.live.len : 0
                return (
                  <button
                    key={p.id}
                    className={onARoll >= 3 ? 'scorer is-hat' : 'scorer'}
                    onClick={() => addGoal('us', p.id)}
                  >
                    <span className="scorer-name">{p.name}</span>
                    {runs.hattricks[p.id] > 0 && (
                      <span className="hats" title="Hattricks deze match">
                        {'•'.repeat(Math.min(runs.hattricks[p.id], 3))}
                      </span>
                    )}
                    {goalsBy[p.id] > 0 && (
                      <span key={goalsBy[p.id]} className="tally">
                        {goalsBy[p.id]}
                      </span>
                    )}
                  </button>
                )
              })}
              <button className="scorer scorer-neutral" onClick={() => addGoal('us', null)}>
                Own goal
              </button>
              <button className="scorer scorer-opponent" onClick={() => addGoal('them')}>
                Tegendoelpunt
              </button>
            </div>
            </>
          )}

          {!penaltiesShown &&
            (canUndoPeriod ? (
              <section className="period-change" aria-live="polite">
                <div className="period-change-copy">
                  <span className="period-change-check" aria-hidden="true">✓</span>
                  <span>
                    <strong>Periode {match.period} gestart</strong>
                    <span>Klok staat klaar op {mmss(clock)}</span>
                  </span>
                </div>
                <button
                  className="btn btn-icon btn-undo"
                  onClick={undoPeriodChange}
                  aria-label="Maak ongedaan"
                  title="Maak ongedaan"
                >
                  <UndoIcon />
                </button>
              </section>
            ) : (
              <LastAction
                match={match}
                score={score}
                opponentName={opponentName}
                onUndo={undo}
              />
            ))}

          {penaltiesShown && (
            <Penalties
              onEnd={() => setEnding(true)}
              open={penaltiesOpen}
              penalties={match.penalties}
              players={squadPlayers}
              opponentName={opponentName}
              onAdd={addPenalty}
              onRemove={removePenalty}
            />
          )}

          </div>

          <div className="pane pane-log">
            {!penaltiesShown && (
              <Timeline match={match} runs={runs} opponentName={opponentName} onRemove={removeEvent} />
            )}
            <div className="match-links">
              {!penaltiesShown && (
                <button className="btn-cancel-match" onClick={() => setEditingSubs(true)}>
                  Stel wisselmelding opnieuw in
                </button>
              )}
              <button className="btn-cancel-match" onClick={() => setCanceling(true)}>
                Annuleer wedstrijd
              </button>
            </div>

          </div>
        </>
        ) : (
          <Home
            team={match}
            onStart={() => setStartingMatch(true)}
            onOpenSquad={() => setScreen('squad')}
          />
        )
      ) : screen === 'squad' ? (
        <Squad
          teams={state.teams}
          activeTeamId={state.activeTeamId}
          matchInProgress={matchInProgress}
          onSwitchTeam={switchTeam}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          players={match.players}
          onAdd={(player) => {
            const id = uid()
            setMatch((m) => ({
              ...m,
              players: [...m.players, { id, ...player }],
              activePlayerIds: [...m.activePlayerIds, id],
            }))
          }}
          onRemove={(id) =>
            setMatch((m) => ({
              ...m,
              players: m.players.filter((p) => p.id !== id),
              events: m.events.map((e) =>
                e.playerId === id ? { ...e, playerId: null } : e,
              ),
            }))
          }
        />
      ) : screen === 'history' ? (
        <History
          teams={state.teams}
          history={state.history}
          onView={setViewingHistory}
          onDelete={deleteHistoryEntry}
        />
      ) : screen === 'settings' ? (
        <Settings
          theme={theme}
          onTheme={setTheme}
          state={state}
          restoreBlocked={state.teams.some((t) => t.started)}
          onRestore={setState}
          autoBackup={autoBackup}
          onAutoBackup={setAutoBackup}
          speech={speech}
          onSpeech={changeSpeech}
          onBack={toggleSettings}
        />
      ) : (
        <Stats teams={state.teams} history={state.history} defaultTeamId={state.activeTeamId} />
      )}


      {viewingHistory && (
        <Summary data={viewingHistory} onClose={() => setViewingHistory(null)} />
      )}

      {startingMatch && (
        <StartMatch
          teams={state.teams}
          defaultTeamId={state.activeTeamId}
          onStart={startMatch}
          onCancel={() => setStartingMatch(false)}
        />
      )}

      {resetting && (
        <Confirm
          title="Klok terug op nul zetten?"
          body={`De tijd van periode ${match.period} (${mmss(clock)}) gaat verloren.`}
          confirmLabel="Ja, terug op nul"
          danger
          onConfirm={resetClock}
          onCancel={() => setResetting(false)}
        />
      )}

      {ending && (
        <Confirm
          title="Wedstrijd beëindigen?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} wordt bewaard bij Uitslagen.`}
          confirmLabel="Ja, beëindig"
          danger
          onConfirm={endMatch}
          onCancel={() => setEnding(false)}
        />
      )}

      {canceling && (
        <Confirm
          title="Wedstrijd annuleren?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} gaat verloren en wordt niet bewaard bij Uitslagen.`}
          confirmLabel="Ja, annuleer"
          danger
          onConfirm={cancelMatch}
          onCancel={() => setCanceling(false)}
        />
      )}

      {editingSubs && (
        <SubSettings
          subMinutes={match.subMinutes}
          periodMinutes={match.periodMinutes}
          onSave={(subMinutes) => {
            setMatch((m) => ({ ...m, subMinutes }))
            setEditingSubs(false)
          }}
          onCancel={() => setEditingSubs(false)}
        />
      )}

      {match.started && (
        <BigBoard
          home={match.home}
          score={score}
          opponentName={opponentName}
          period={match.period}
          clock={mmss(Math.min(clock, periodSeconds))}
          extra={extraSeconds > 0 ? mmss(extraSeconds) : null}
          running={running}
          finished={matchFinished}
          penalties={match.penalties}
          periodsCount={PERIODS.length}
          periodProgress={periodProgress}
          notice={
            periodOver
              ? { kind: 'over', text: lastPeriod ? 'Laatste periode voorbij' : `Periode ${match.period} voorbij` }
              : subPhase === 'now' && !subDismissed
                ? { kind: 'now' }
                : subPhase === 'soon' && !subDismissed
                  ? { kind: 'soon', seconds: nextSub - clock }
                  : null
          }
          onDismissSub={() => setDismissedSub(subKey)}
          onStartClock={!running && !periodOver ? toggleClock : null}
        />
      )}

      {updateAvailable && (
        <div className="update-toast" role="status">
          <span>Nieuwe versie beschikbaar</span>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Vernieuw
          </button>
        </div>
      )}
    </div>
  )
}

function Summary({ data, onClose }) {
  const panel = useRef(null)
  const { cancel: close, overlayClass } = useDialog(panel, onClose)
  const [url, setUrl] = useState(null)
  const [file, setFile] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stale = false

    const make = async () => {
      try {
        await document.fonts?.ready
      } catch {
        // zonder het webfont tekent het canvas met de systeemletter
      }
      const logo = await loadClubLogo()
      const canvas = document.createElement('canvas')
      canvas.width = SHOT_W
      canvas.height = heightFor(data)
      drawSummary(canvas.getContext('2d'), data, logo)
      canvas.toBlob((blob) => {
        if (stale) return
        if (!blob) {
          setFailed(true)
          return
        }
        setUrl(URL.createObjectURL(blob))
        setFile(new File([blob], 'scorebord.png', { type: 'image/png' }))
      }, 'image/png')
    }

    make()
    return () => {
      stale = true
    }
  }, [data])

  useEffect(() => () => url && URL.revokeObjectURL(url), [url])

  const canShare = file && navigator.canShare?.({ files: [file] })

  const share = async () => {
    try {
      await navigator.share({ files: [file], title: 'Scorebord' })
    } catch {
      // gedeeld venster weggeklikt: niets aan de hand
    }
  }

  const save = () => {
    const link = document.createElement('a')
    link.href = url
    link.download = `scorebord-${new Date().toISOString().slice(0, 10)}.png`
    link.click()
  }

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={close}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Samenvatting van de match"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        {failed ? (
          <p>De afbeelding kon niet gemaakt worden. Probeer het opnieuw.</p>
        ) : url ? (
          <img className="shot" src={url} alt="Samenvatting van de match" />
        ) : (
          <p>De samenvatting wordt getekend…</p>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={close}>
            Sluit
          </button>
          {url && !canShare && (
            <button className="btn btn-primary" onClick={save}>
              Bewaar
            </button>
          )}
          {canShare && (
            <button className="btn btn-primary" onClick={share}>
              Deel
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// Gedrag van een venster: focus erin bij openen, Escape sluit, Tab blijft
// binnen het venster, en de pagina erachter scrolt niet mee.
const LEAVE_MS = 150

// Houdt een melding nog even in beeld nadat ze verdwijnt, zodat ze kan
// uitvagen in plaats van weg te springen. Toont tijdens het uitvagen de
// laatst zichtbare inhoud.
function Presence({ show, children }) {
  const [mounted, setMounted] = useState(show)
  const last = useRef(children)
  if (show) last.current = children

  useEffect(() => {
    if (show) {
      setMounted(true)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false)
      return
    }
    const t = setTimeout(() => setMounted(false), LEAVE_MS)
    return () => clearTimeout(t)
  }, [show])

  if (!show && !mounted) return null
  return <div className={show ? 'presence' : 'presence is-leaving'}>{last.current}</div>
}

function useModal(panel, onClose) {
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = panel.current?.querySelectorAll('button, input, select, a[href]') ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const scroll = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = scroll
    }
  }, [panel, onClose])
}


// Laat een venster eerst uitvagen voor het echt sluit: de ouder haalt het pas
// weg (via onCancel of de gekozen actie) nadat de animatie gelopen heeft.
// Met "Beperk beweging" sluit het meteen.
function useDialog(panel, onCancel) {
  const [leaving, setLeaving] = useState(false)
  const busy = useRef(false)
  const latestCancel = useRef(onCancel)
  latestCancel.current = onCancel

  const leave = useCallback((action) => {
    if (busy.current) return
    busy.current = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      action()
      return
    }
    setLeaving(true)
    setTimeout(action, LEAVE_MS)
  }, [])
  // Stabiel, zodat useModal niet bij elke render opnieuw de focus pakt.
  const cancel = useCallback(() => leave(() => latestCancel.current()), [leave])

  useModal(panel, cancel)
  return { leaving, leave, cancel, overlayClass: leaving ? 'overlay is-leaving' : 'overlay' }
}

function Confirm({ title, body, confirmLabel, cancelLabel = 'Nee', danger, onConfirm, onCancel }) {
  const panel = useRef(null)
  const { leave, cancel, overlayClass } = useDialog(panel, onCancel)

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={cancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => leave(onConfirm)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function HattrickBanner({ live, players }) {
  if (!live || live.len < 2) return null
  const name = players.find((p) => p.id === live.playerId)?.name ?? 'Onbekende speler'
  const isHattrick = live.len >= 3

  return (
    <p className={isHattrick ? 'banner' : 'banner banner-streak'} role="status">
      <span className="banner-what">
        {live.len === 3 ? 'Hattrick' : `${live.len} op rij`}
      </span>
      <span className="banner-who">{name}</span>
    </p>
  )
}

// Veldtekening op ware verhoudingen (in meter, 105 × 68) als decor achter het
// scorebord en de startkaart. "slice" vult de breedte en snijdt boven en onder
// af, zodat de lijnen niet vervormen of meeschalen wanneer de kop krimpt.
// Staand (vertical) draait het veld een kwartslag voor hoge vlakken.
// Eén segment per periode: afgelopen periodes vol, de huidige loopt mee met
// de klok, de volgende nog leeg.
function PeriodProgress({ count, period, progress }) {
  return (
    <div className="period-progress" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => i + 1).map((p) => {
        const fill = p < period ? 1 : p > period ? 0 : progress
        return (
          <span key={p} className={p === period ? 'period-seg is-current' : 'period-seg'}>
            <span className="period-seg-fill" style={{ width: `${fill * 100}%` }} />
          </span>
        )
      })}
    </div>
  )
}

// Digitale klok met zeven segmenten per cijfer, zoals op een echt scorebord.
// Niet-brandende segmenten blijven vaag zichtbaar; een lege voorloopplaats
// (bv. " 6:00") toont enkel die vage segmenten.
const SEGMENTS = {
  a: [7, 5, 53, 5, 'h'],
  b: [55, 7, 55, 48, 'v'],
  c: [55, 52, 55, 93, 'v'],
  d: [7, 95, 53, 95, 'h'],
  e: [5, 52, 5, 93, 'v'],
  f: [5, 7, 5, 48, 'v'],
  g: [7, 50, 53, 50, 'h'],
}
const DIGIT_SEGMENTS = [
  'abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg',
]

function segmentPoints([x1, y1, x2, y2, dir]) {
  const t = 5 // halve dikte
  return dir === 'h'
    ? `${x1},${y1} ${x1 + t},${y1 - t} ${x2 - t},${y2 - t} ${x2},${y2} ${x2 - t},${y2 + t} ${x1 + t},${y1 + t}`
    : `${x1},${y1} ${x1 + t},${y1 + t} ${x2 + t},${y2 - t} ${x2},${y2} ${x2 - t},${y2 - t} ${x1 - t},${y1 + t}`
}

function SegmentDigit({ char }) {
  const lit = /\d/.test(char) ? DIGIT_SEGMENTS[Number(char)] : ''
  return (
    <svg className="seg-digit" viewBox="-2 -2 64 104" aria-hidden="true" focusable="false">
      {Object.entries(SEGMENTS).map(([name, seg]) => (
        <polygon
          key={name}
          className={lit.includes(name) ? 'seg is-on' : 'seg'}
          points={segmentPoints(seg)}
        />
      ))}
    </svg>
  )
}

function SegmentClock({ time, pad = true }) {
  const [min, sec] = time.split(':')
  const chars = `${pad ? min.padStart(2, ' ') : min}:${sec}`
  return (
    <span className="seg-clock" role="img" aria-label={time}>
      {[...chars].map((c, i) =>
        c === ':' ? (
          <svg key={i} className="seg-colon" viewBox="0 0 20 104" aria-hidden="true" focusable="false">
            <circle className="seg is-on" cx="10" cy="32" r="5.5" />
            <circle className="seg is-on" cx="10" cy="70" r="5.5" />
          </svg>
        ) : (
          <SegmentDigit key={i} char={c} />
        ),
      )}
    </span>
  )
}

// Groot scorebord om aan de zijlijn te tonen: verschijnt enkel wanneer de
// gsm tijdens een wedstrijd gekanteld wordt (zie de media query in de CSS).
function BigBoard({
  home,
  score,
  opponentName,
  period,
  clock,
  extra,
  running,
  finished,
  penalties,
  periodsCount,
  periodProgress,
  notice,
  onDismissSub,
  onStartClock,
}) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]
  const pens = {
    us: penalties.filter((p) => p.team === 'us' && p.scored).length,
    them: penalties.filter((p) => p.team === 'them' && p.scored).length,
  }
  const [penLeft, penRight] = home ? [pens.us, pens.them] : [pens.them, pens.us]

  return createPortal(
    <div className="bigboard">
      <Pitch />
      <div className="bigboard-row">
        {[left, right].map((side, i) => (
          <div key={i} className="bigboard-side">
            <span className={side.ours ? 'bigboard-name is-ours' : 'bigboard-name'}>
              {side.name}
            </span>
            <span className={side.ours ? 'bigboard-goals is-ours' : 'bigboard-goals'}>
              {side.goals}
            </span>
          </div>
        ))}
        {/* Tussen de scores: een wissel- of eindemelding, anders niets. */}
        {notice?.kind === 'now' ? (
          <button
            key="now"
            className="bigboard-notice is-now"
            onClick={onDismissSub}
            aria-label="Verberg wisselmelding"
          >
            <SwapIcon />
            <strong>Wisselen!</strong>
          </button>
        ) : notice?.kind === 'soon' ? (
          <div key="soon" className="bigboard-notice" role="status">
            <span>Wissel over</span>
            <strong>{notice.seconds}s</strong>
          </div>
        ) : notice?.kind === 'over' ? (
          <div key="over" className="bigboard-notice is-over" role="status">
            <FlagIcon />
            <strong>{notice.text}</strong>
          </div>
        ) : null}
      </div>
      <div className="bigboard-meta">
        {penalties.length > 0 ? (
          <span>
            Strafschoppen {penLeft}–{penRight}
          </span>
        ) : finished ? (
          <span>Einde wedstrijd</span>
        ) : (
          // Tik op de stilstaande klok om te starten; stoppen kan hier niet,
          // zodat niemand de klok per ongeluk stillegt.
          <button
            className={running ? 'bigboard-clock is-running' : 'bigboard-clock'}
            onClick={onStartClock ?? undefined}
            disabled={!onStartClock}
            aria-label={onStartClock ? 'Start de klok' : undefined}
          >
            <SegmentClock time={clock} />
            {extra && (
              <span className="bigboard-extra">
                <span className="bigboard-extra-plus">+</span>
                <SegmentClock time={extra} pad={false} />
              </span>
            )}
          </button>
        )}
      </div>
      <div className="bigboard-progress">
        <PeriodProgress count={periodsCount} period={period} progress={periodProgress} />
      </div>
    </div>,
    document.body,
  )
}

function Pitch({ vertical = false }) {
  return (
    <svg
      className="pitch"
      viewBox={vertical ? '-3 -3 74 111' : '-3 -3 111 74'}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={vertical ? 'translate(68 0) rotate(90)' : undefined}>
        <g className="pitch-lines">
          <rect x="0" y="0" width="105" height="68" />
          <path d="M52.5 0V68" />
          <circle cx="52.5" cy="34" r="9.15" />
          {/* Strafschopgebied, doelgebied, boog en doel — links en gespiegeld rechts. */}
          <path d="M0 13.84H16.5V54.16H0M0 24.84H5.5V43.16H0M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31M0 30.34H-1.5V37.66H0" />
          <path d="M105 13.84H88.5V54.16H105M105 24.84H99.5V43.16H105M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31M105 30.34H106.5V37.66H105" />
          <path d="M0 1A1 1 0 0 0 1 0M104 0A1 1 0 0 0 105 1M105 67A1 1 0 0 0 104 68M1 68A1 1 0 0 0 0 67" />
        </g>
        <g className="pitch-spots">
          <circle cx="52.5" cy="34" r="0.5" />
          <circle cx="11" cy="34" r="0.5" />
          <circle cx="94" cy="34" r="0.5" />
        </g>
      </g>
    </svg>
  )
}

function Scoreboard({ started, home, score, opponentName, compact }) {
  // Een cijfer "popt" enkel wanneer het verandert: door de key wordt het
  // element dan opnieuw aangemaakt, en enkel waarden die afwijken van de
  // stand bij het openen krijgen de animatie (dus niet bij elke tabwissel).
  const initial = useRef(score)
  const ours = { name: TEAM, goals: score.us, ours: true, pop: score.us !== initial.current.us }
  const theirs = {
    name: opponentName,
    goals: score.them,
    ours: false,
    pop: score.them !== initial.current.them,
  }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  if (!started) {
    return (
      <header className={compact ? 'board board-idle is-compact' : 'board board-idle'}>
        <Pitch />
        <div className="board-row board-row-idle">
          <h1 className="board-title">
            <span className="board-title-club">{TEAM}</span>
            <span className="board-title-sub">Scorebord</span>
          </h1>
        </div>
      </header>
    )
  }

  return (
    <header className={compact ? 'board is-compact' : 'board'}>
      <Pitch />
      <div className="board-row">
        <div className="side">
          <span className={left.ours ? 'team-name team-name-ours' : 'team-name'}>{left.name}</span>
          <span
            key={left.goals}
            className={['goals', left.ours && 'goals-ours', left.pop && 'is-pop'].filter(Boolean).join(' ')}
          >
            {left.goals}
          </span>
        </div>
        <div className="side side-right">
          <span className={right.ours ? 'team-name team-name-ours' : 'team-name'}>{right.name}</span>
          <span
            key={right.goals}
            className={['goals', right.ours && 'goals-ours', right.pop && 'is-pop'].filter(Boolean).join(' ')}
          >
            {right.goals}
          </span>
        </div>
      </div>
    </header>
  )
}

function Timeline({ match, runs, opponentName, onRemove }) {
  const [removing, setRemoving] = useState(null)

  if (match.events.length === 0) {
    return (
      <>
        <h2 className="section-title">Tijdslijn</h2>
        <p className="empty">Nog niet gescoord. De eerste goal komt hier te staan.</p>
      </>
    )
  }

  let us = 0
  let them = 0
  const rows = match.events.map((e) => {
    if (e.team === 'us') us += 1
    else them += 1
    const player = match.players.find((p) => p.id === e.playerId)
    return { ...e, us, them, name: player?.name ?? null }
  })
  const periods = Array.from({ length: match.periodsCount }, (_, i) => i + 1)
  const visiblePeriods = periods.filter(
    (period) => period === match.period || rows.some((row) => row.period === period),
  )

  return (
    <>
      <h2 className="section-title">Tijdslijn</h2>
      <ol className="timeline">
        {visiblePeriods.map((p) => {
          const inPeriod = rows.filter((r) => r.period === p)
          return (
            <li key={p} className="tl-period">
              <h3>
                Periode {p}
                {inPeriod.length === 0 && <span className="tl-none">geen doelpunten</span>}
              </h3>
              {inPeriod.map((r) => {
                const len = runs.streak[r.id]
                const inHat = runs.hat[r.id]
                const classes = ['tl-row']
                if (r.team !== 'us') classes.push('is-away')
                if (inHat) classes.push('is-hat')
                if (inHat && len === 1) classes.push('is-hat-start')
                return (
                  <div key={r.id} className={classes.join(' ')}>
                    <span className="tl-score">
                      {r.us}–{r.them}
                    </span>
                    <span className="tl-who">
                      {r.team === 'us' ? (r.name ?? 'Own goal') : opponentName}
                      {r.clock ? <span className="tl-min"> {mmss(r.clock)}</span> : null}
                    </span>
                    {inHat && len >= 3 && (
                      <span className="tl-hat">{len === 3 ? 'hattrick' : `${len} op rij`}</span>
                    )}
                    <button
                      className="tl-del"
                      onClick={() => setRemoving(r)}
                      aria-label="Verwijder dit doelpunt"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </li>
          )
        })}
      </ol>

      {removing && (
        <Confirm
          title="Doelpunt verwijderen?"
          body={`${removing.us}–${removing.them}, ${
            removing.team === 'us' ? (removing.name ?? 'Own goal') : opponentName
          } wordt uit de tijdslijn verwijderd en de stand wordt herberekend.`}
          confirmLabel="Ja, verwijder"
          danger
          onConfirm={() => {
            onRemove(removing.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </>
  )
}

function LastAction({ match, score, opponentName, onUndo }) {
  const last = match.events.at(-1)
  if (!last) return null

  const player = match.players.find((candidate) => candidate.id === last.playerId)
  const label = last.team === 'them' ? opponentName : player?.name ? player.name : 'Own goal'

  return (
    <section key={last.id} className="last-action" aria-live="polite">
      <div className="last-action-copy">
        <span className="last-action-check" aria-hidden="true">✓</span>
        <span>
          <strong>Geregistreerd</strong>
          <span className="last-action-meta">{label} · {score.us}–{score.them}</span>
        </span>
      </div>
      <button
        className="btn btn-icon btn-undo"
        onClick={onUndo}
        aria-label="Maak ongedaan"
        title="Maak ongedaan"
      >
        <UndoIcon />
      </button>
    </section>
  )
}

// Optioneel: strafschoppen die spelers (van beide ploegen, in eender welke
// volgorde — soms alle spelers van 1 ploeg na elkaar) na afloop nog nemen.
// Los van de reguliere doelpunten/tijdslijn, want telt niet mee voor de stand.
// Venster na een tik op een nemer: was de strafschop raak of niet?
function PenaltyResult({ name, onPick, onCancel }) {
  const panel = useRef(null)
  const { leave, cancel, overlayClass } = useDialog(panel, onCancel)

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={cancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="penalty-result-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="penalty-result-title">Strafschop {name}</h2>
        <div className="penalty-choice">
          <button className="btn penalty-choice-yes" onClick={() => leave(() => onPick(true))}>
            <BallScoredIcon />
            Doelpunt
          </button>
          <button className="btn penalty-choice-no" onClick={() => leave(() => onPick(false))}>
            <span className="penalty-choice-x" aria-hidden="true">
              ✗
            </span>
            Gemist
          </button>
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            Annuleer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Penalties({ onEnd, open, penalties, players, opponentName, onAdd, onRemove }) {
  const [removing, setRemoving] = useState(null)
  const [taking, setTaking] = useState(null)
  const expanded = open || penalties.length > 0

  // Geen eigen knop meer: het blok opent via "Strafschoppen" in de melding
  // "Laatste periode voorbij".
  if (!expanded) return null

  const usScored = penalties.filter((p) => p.team === 'us' && p.scored).length
  const usTotal = penalties.filter((p) => p.team === 'us').length
  const themScored = penalties.filter((p) => p.team === 'them' && p.scored).length
  const themTotal = penalties.filter((p) => p.team === 'them').length

  const takers = [...players.map((p) => ({ id: p.id, name: p.name })), { id: null, name: opponentName }]

  return (
    <section className="penalties" id="penalties">
      <h2 className="section-title">Wie neemt een strafschop?</h2>

      {/* Zelfde tegels als tijdens de match; een tik vraagt daarna of de
          strafschop raak was. De bolletjes tonen wat iemand al trapte. */}
      <div className="grid">
        {takers.map((t) => {
          const team = t.id === null ? 'them' : 'us'
          const taken = penalties.filter((p) => p.team === team && (team === 'them' || p.playerId === t.id))
          return (
            <button
              key={t.id ?? 'them'}
              className={team === 'them' ? 'scorer scorer-opponent' : 'scorer'}
              onClick={() => setTaking({ ...t, team })}
            >
              <span className="scorer-name">{t.name}</span>
              {/* Bij de tegenstander zouden de bolletjes zich opstapelen; de
                  reeks eronder toont die al. */}
              {team === 'us' && taken.length > 0 && (
                <span className="penalty-dots" aria-label={`${taken.filter((p) => p.scored).length} van ${taken.length} raak`}>
                  {taken.map((p) => (
                    <span key={p.id} className={p.scored ? 'penalty-dot is-scored' : 'penalty-dot'} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {taking && (
        <PenaltyResult
          name={taking.name}
          onPick={(scored) => {
            onAdd(taking.team, taking.id, scored)
            setTaking(null)
          }}
          onCancel={() => setTaking(null)}
        />
      )}

      {penalties.length > 0 && (
        <>
          <h2 className="section-title">Strafschoppen reeks</h2>
          {/* Beide ploegen naast elkaar, één rij per beurt, zodat de stand
              in één oogopslag te volgen is. */}
          <div className="penalty-columns">
            {[
              { team: 'us', label: TEAM, scored: usScored, total: usTotal },
              { team: 'them', label: opponentName, scored: themScored, total: themTotal },
            ].map((col) => (
              <div key={col.team} className={col.team === 'us' ? 'penalty-col is-ours' : 'penalty-col'}>
                <div className="penalty-col-head">
                  <span className="penalty-col-name">{col.label}</span>
                  <strong key={`${col.scored}/${col.total}`}>
                    {col.scored}/{col.total}
                  </strong>
                </div>
                <ol className="penalty-list">
                  {penalties
                    .filter((p) => p.team === col.team)
                    .map((p, i) => {
                      const name =
                        p.team === 'us'
                          ? (players.find((pl) => pl.id === p.playerId)?.name ?? 'Onbekend')
                          : `Strafschop ${i + 1}`
                      return (
                        <li key={p.id}>
                          <span
                            className={p.scored ? 'penalty-result is-scored' : 'penalty-result'}
                            aria-label={p.scored ? 'Gescoord' : 'Gemist'}
                          >
                            {p.scored ? '✓' : '✗'}
                          </span>
                          <span className="penalty-list-name">{name}</span>
                          <button
                            className="btn btn-quiet btn-icon btn-penalty-remove"
                            onClick={() => setRemoving({ ...p, name })}
                            aria-label="Verwijder deze strafschop"
                            title="Verwijder deze strafschop"
                          >
                            <TrashIcon />
                          </button>
                        </li>
                      )
                    })}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}

      {removing && (
        <Confirm
          title="Strafschop verwijderen?"
          body={`${removing.name} (${removing.scored ? 'gescoord' : 'gemist'}) wordt uit de reeks verwijderd.`}
          confirmLabel="Ja, verwijder"
          danger
          onConfirm={() => {
            onRemove(removing.id)
            setRemoving(null)
          }}
          onCancel={() => setRemoving(null)}
        />
      )}

      {/* Na de reeks is beëindigen de gewone volgende stap. */}
      <div className="penalties-end">
        <button className="btn btn-primary btn-end-match" onClick={onEnd}>
          Beëindig wedstrijd
        </button>
      </div>
    </section>
  )
}

function AgeOptions() {
  const formats = [...new Set(AGE_ORDER.map((age) => AGE_CONFIG[age].format))]
  return formats.map((format) => (
    <optgroup key={format} label={FORMAT_LABELS[format]}>
      {AGE_ORDER.filter((age) => AGE_CONFIG[age].format === format).map((age) => (
        <option key={age} value={age}>
          {age}
        </option>
      ))}
    </optgroup>
  ))
}

function Squad({
  teams,
  activeTeamId,
  matchInProgress,
  onSwitchTeam,
  onAddTeam,
  onRemoveTeam,
  players,
  onAdd,
  onRemove,
}) {
  const [name, setName] = useState('')
  const [newTeamAge, setNewTeamAge] = useState('U9')
  const [addingTeam, setAddingTeam] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removingPlayer, setRemovingPlayer] = useState(null)

  const submit = () => {
    if (!name.trim()) return
    onAdd({ name: name.trim() })
    setName('')
  }

  const addTeam = () => {
    onAddTeam(newTeamAge)
    setAddingTeam(false)
  }

  return (
    <section className="pane-squad">
      <h2 className="section-title">Ploegen</h2>

      <div className="team-switch">
        {teams.map((t) => {
          const disabled = t.id !== activeTeamId && matchInProgress
          return (
            <button
              key={t.id}
              className={t.id === activeTeamId ? 'team-chip is-on' : 'team-chip'}
              onClick={() => onSwitchTeam(t.id)}
              disabled={disabled}
              title={disabled ? 'Beëindig eerst de huidige match om te wisselen' : undefined}
              aria-pressed={t.id === activeTeamId}
            >
              {t.ageGroup}
            </button>
          )
        })}
        <button
          className={addingTeam ? 'team-chip team-chip-add is-on' : 'team-chip team-chip-add'}
          onClick={() => setAddingTeam((v) => !v)}
          aria-label="Voeg ploeg toe"
          aria-expanded={addingTeam}
          title="Voeg ploeg toe"
        >
          <PlusIcon />
        </button>
      </div>

      {addingTeam && (
        <div className="panel-card">
          <span className="choice-label">Nieuwe ploeg</span>
          <div className="row row-flush">
            <select
              className="field"
              value={newTeamAge}
              onChange={(e) => setNewTeamAge(e.target.value)}
              aria-label="Leeftijdscategorie nieuwe ploeg"
            >
              <AgeOptions />
            </select>
            <button
              className="btn btn-primary btn-icon"
              onClick={addTeam}
              aria-label="Bevestig nieuwe ploeg"
              title="Voeg ploeg toe"
            >
              <PlusIcon />
            </button>
          </div>
        </div>
      )}

      <h2 className="section-title">Spelers</h2>
      <div className="panel-card squad-add">
        <div className="row row-flush">
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Naam"
            aria-label="Naam speler"
          />
          <button
            className="btn btn-primary btn-icon"
            onClick={submit}
            aria-label="Voeg speler toe"
            title="Voeg speler toe"
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {players.length === 0 ? (
        <p className="empty">De ploeg is nog leeg.</p>
      ) : (
        <ul className="squad">
          {players.map((p) => (
            <li key={p.id}>
              <span className="squad-name">{p.name}</span>
              <button
                className="btn btn-quiet btn-icon"
                onClick={() => setRemovingPlayer(p)}
                aria-label={`Verwijder ${p.name}`}
                title={`Verwijder ${p.name}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {teams.length > 1 && !matchInProgress && (
        <button
          className="btn btn-quiet btn-remove-team"
          onClick={() => setConfirmingRemove(true)}
        >
          <TrashIcon />
          Verwijder deze ploeg
        </button>
      )}

      {removingPlayer && (
        <Confirm
          title="Speler verwijderen?"
          body={`${removingPlayer.name} wordt uit de ploeg verwijderd. Eerder gescoorde doelpunten blijven in de tijdslijn staan, maar zonder naam.`}
          confirmLabel="Ja, verwijder"
          danger
          onConfirm={() => {
            onRemove(removingPlayer.id)
            setRemovingPlayer(null)
          }}
          onCancel={() => setRemovingPlayer(null)}
        />
      )}

      {confirmingRemove && (
        <Confirm
          title="Ploeg verwijderen?"
          body="De spelerslijst en de hele matchgeschiedenis van deze ploeg gaan verloren."
          confirmLabel="Ja, verwijder"
          danger
          onConfirm={() => {
            onRemoveTeam(activeTeamId)
            setConfirmingRemove(false)
          }}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </section>
  )
}

function Settings({
  theme,
  onTheme,
  state,
  restoreBlocked,
  onRestore,
  autoBackup,
  onAutoBackup,
  speech,
  onSpeech,
  onBack,
}) {
  return (
    <section className="pane-settings">
      <div className="settings-head">
        <button className="settings-back" onClick={onBack}>
          ← Terug
        </button>
        <h2 className="settings-title">Instellingen</h2>
      </div>

      <h2 className="section-title">Weergave</h2>
      <div className="panel-card">
        <div className="theme-seg" role="group" aria-label="Thema">
          {THEME_OPTIONS.map(({ value, short, Icon }) => (
            <button
              key={value}
              className={value === theme ? 'per is-on' : 'per'}
              onClick={() => onTheme(value)}
              aria-pressed={value === theme}
            >
              <Icon />
              {short}
            </button>
          ))}
        </div>
        <p className="backup-note">
          {theme === 'auto'
            ? 'Volgt de instelling van je toestel.'
            : theme === 'dark'
              ? 'Altijd donker, ook als je toestel licht staat.'
              : 'Altijd licht, ook als je toestel donker staat.'}
        </p>
      </div>

      <h2 className="section-title">Meldingen</h2>
      <div className="panel-card">
        <SwitchRow
          checked={speech}
          onChange={onSpeech}
          label="Gesproken meldingen"
          sub="De app zegt hardop wanneer er gewisseld moet worden en wanneer een periode voorbij is."
        />
      </div>

      <h2 className="section-title">Back-up</h2>
      <Backup
        state={state}
        restoreBlocked={restoreBlocked}
        onRestore={onRestore}
        autoBackup={autoBackup}
        onAutoBackup={onAutoBackup}
      />

      <h2 className="section-title">Over</h2>
      <div className="panel-card settings-about">
        <span>{TEAM} Scorebord</span>
        <span className="settings-version">v{APP_VERSION}</span>
      </div>
    </section>
  )
}

function SwitchRow({ checked, onChange, label, sub, className }) {
  return (
    <button
      className={className ? `switch-row ${className}` : 'switch-row'}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-text">
        <span>{label}</span>
        {sub && <span className="switch-sub">{sub}</span>}
      </span>
      <span className={checked ? 'switch is-on' : 'switch'} aria-hidden="true" />
    </button>
  )
}

// Back-up: alles staat enkel in deze browser, dus een bestand bewaren
// beschermt tegen gewiste browsergegevens of een nieuw toestel.
const BACKUP_KEY = 'scorebord-last-backup'
const AUTO_BACKUP_KEY = 'scorebord-auto-backup'
const longDate = (d) =>
  new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })

// iPhone/iPad (ook een iPad die zich als Mac voordoet). Daar werkt
// downloaden vanuit de app slecht, dus gaat de back-up via het deelvenster.
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function download(file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Bewaart de gegevens als bestand: op iOS via het deelvenster (bewaren in
// Bestanden, Drive…), elders (Android, computer) gewoon downloaden. Android
// laat het delen van .json-bestanden niet toe. Geeft false als het
// deelvenster weggeklikt werd.
async function saveBackup(state) {
  const now = new Date().toISOString()
  const json = JSON.stringify(
    { app: 'scorebord', version: APP_VERSION, exportedAt: now, data: state },
    null,
    2,
  )
  // Lokale datum (JJJJ-MM-DD) in de naam, niet die van UTC.
  const name = `scorebord-backup-${new Date().toLocaleDateString('sv-SE')}.json`
  const file = new File([json], name, { type: 'application/json' })
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Scorebord back-up' })
    } catch (e) {
      if (e?.name === 'AbortError') return false
      // Delen geweigerd (bv. bestandstype niet toegelaten): dan toch downloaden.
      download(file)
    }
  } else {
    download(file)
  }
  try {
    localStorage.setItem(BACKUP_KEY, now)
  } catch {
    // niet erg: enkel de datum van de laatste back-up gaat verloren
  }
  return true
}

function Backup({ state, restoreBlocked, onRestore, autoBackup, onAutoBackup }) {
  const fileInput = useRef(null)
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      return localStorage.getItem(BACKUP_KEY)
    } catch {
      return null
    }
  })
  const [pending, setPending] = useState(null)
  const [message, setMessage] = useState(null)

  const exportBackup = async () => {
    try {
      if (!(await saveBackup(state))) return
    } catch {
      setMessage({ error: true, text: 'De back-up kon niet gemaakt worden.' })
      return
    }
    setLastBackup(localStorage.getItem(BACKUP_KEY))
    setMessage(null)
  }

  const readFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const data = fromStored(parsed?.app === 'scorebord' ? parsed.data : parsed)
      if (!data) throw new Error('leeg')
      setPending({ data, exportedAt: parsed.exportedAt })
      setMessage(null)
    } catch {
      setMessage({ error: true, text: 'Dit bestand is geen geldige back-up van het scorebord.' })
    }
  }

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

  return (
    <>
      <div className="panel-card backup">
        <p className="backup-text">
          Alles staat enkel op dit toestel. Bewaar af en toe een back-up, zodat je
          spelers en uitslagen niet verloren gaan.
        </p>
        <p className="backup-last">
          {lastBackup ? `Laatste back-up: ${longDate(lastBackup)}` : 'Nog geen back-up gemaakt.'}
        </p>
        <div className="row row-flush">
          <button className="btn btn-primary btn-wide" onClick={exportBackup}>
            Exporteer
          </button>
          <button
            className="btn btn-wide"
            onClick={() => fileInput.current?.click()}
            disabled={restoreBlocked}
            title={restoreBlocked ? 'Beëindig eerst de lopende wedstrijd' : undefined}
          >
            Zet terug
          </button>
        </div>
        {restoreBlocked && (
          <p className="backup-note">Terugzetten kan pas na de lopende wedstrijd.</p>
        )}
        <SwitchRow
          className="switch-row-split"
          checked={autoBackup}
          onChange={onAutoBackup}
          label="Na elke wedstrijd"
          sub="Maak automatisch een back-up wanneer je een wedstrijd beëindigt."
        />
        {message && (
          <p className={message.error ? 'backup-note is-error' : 'backup-note'} role="status">
            {message.text}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={readFile}
        />
      </div>

      {pending && (
        <Confirm
          title="Back-up terugzetten?"
          body={`De back-up${pending.exportedAt ? ` van ${longDate(pending.exportedAt)}` : ''} bevat ${count(pending.data.teams.length, 'ploeg', 'ploegen')} en ${count(pending.data.history.length, 'wedstrijd', 'wedstrijden')}. Alles wat nu in de app staat, wordt vervangen.`}
          confirmLabel="Ja, zet terug"
          danger
          onConfirm={() => {
            onRestore(pending.data)
            setPending(null)
            setMessage({ text: 'De back-up is teruggezet.' })
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}

// Startscherm zolang er geen wedstrijd bezig is: titel, ploeg en een
// duidelijke aftrapknop in één vlak.
function Home({ team, onStart, onOpenSquad }) {
  const cfg = AGE_CONFIG[team.ageGroup] ?? AGE_CONFIG.U9

  return (
    <div className="pane pane-play pane-home">
      <section className="home-hero">
        <Pitch vertical />
        <h1 className="board-title">
          <span className="board-title-club">{TEAM}</span>
          <span className="board-title-sub">Scorebord</span>
        </h1>
        <img className="home-hero-logo" src={CLUB_LOGO} alt="" />
        <h2 className="home-hero-title">
          <span className="home-hero-ball" aria-hidden="true">
            ⚽
          </span>
          Klaar voor de aftrap?
        </h2>
        <div className="home-hero-meta">
          <span className="age-chip">{team.ageGroup}</span>
          <span>{FORMAT_LABELS[cfg.format] ?? cfg.format}</span>
          <span aria-hidden="true">·</span>
          <span>
            {team.periodsCount} × {team.periodMinutes}'
          </span>
        </div>
        <p className="home-hero-sub">
          {team.players.length === 0
            ? 'Nog geen spelers in deze ploeg.'
            : `${team.players.length} ${team.players.length === 1 ? 'speler' : 'spelers'} in de kern`}
        </p>
        <button className="btn btn-start-hero" onClick={onStart}>
          Start nieuwe wedstrijd
        </button>
        {team.players.length === 0 && (
          <button className="home-hero-link" onClick={onOpenSquad}>
            Voeg eerst spelers toe →
          </button>
        )}
      </section>
    </div>
  )
}

// Uitslag vanuit ons standpunt na de reguliere speeltijd (W/G/V); een
// strafschoppenreeks telt apart mee.
function resultOf(h) {
  const diff = ourGoals(h) - theirGoals(h)
  return diff > 0 ? 'W' : diff < 0 ? 'V' : 'G'
}
const ourGoals = (h) => (h.left.ours ? h.left : h.right).goals
const theirGoals = (h) => (h.left.ours ? h.right : h.left).goals

const RESULT_LABELS = { W: 'Winst', G: 'Gelijk', V: 'Verlies' }

// Bewaarde wedstrijden van vóór het teamId-veld kennen enkel de
// leeftijdscategorie; die vallen terug op de ploeg met die categorie.
function playedBy(team, history) {
  return history.filter((h) => (h.teamId ? h.teamId === team.id : h.ageGroup === team.ageGroup))
}

function teamStats(played) {
  const record = { W: 0, G: 0, V: 0 }
  let goalsFor = 0
  let goalsAgainst = 0
  let biggestWin = null
  let heaviestLoss = null
  const perPeriod = []
  const scorers = {}
  const takers = {}
  const shootouts = { won: 0, drawn: 0, lost: 0 }

  for (const h of played) {
    const us = ourGoals(h)
    const them = theirGoals(h)
    record[resultOf(h)] += 1
    goalsFor += us
    goalsAgainst += them
    const diff = us - them
    if (diff > 0 && (!biggestWin || diff > ourGoals(biggestWin) - theirGoals(biggestWin))) biggestWin = h
    if (diff < 0 && (!heaviestLoss || diff < ourGoals(heaviestLoss) - theirGoals(heaviestLoss)))
      heaviestLoss = h

    for (const e of h.events ?? []) {
      const i = Math.max(0, (e.period ?? 1) - 1)
      perPeriod[i] ??= { us: 0, them: 0 }
      perPeriod[i][e.team === 'us' ? 'us' : 'them'] += 1
    }

    for (const sc of h.scorers ?? []) {
      if (sc.name === 'Own goal') continue
      // Oudere historiek bewaarde enkel de samengevoegde regel ("A, B & C").
      for (const name of sc.names ?? sc.name.split(/, | & /)) {
        const row = (scorers[name] ??= { name, goals: 0, hattricks: 0, matches: 0 })
        row.goals += sc.goals
        row.hattricks += sc.hattricks ?? 0
        row.matches += 1
      }
    }

    const pens = h.penalties
    if (pens) {
      if (pens.us.scored > pens.them.scored) shootouts.won += 1
      else if (pens.us.scored < pens.them.scored) shootouts.lost += 1
      else shootouts.drawn += 1
      for (const a of pens.attempts) {
        if (a.team !== 'us') continue
        const row = (takers[a.name] ??= { name: a.name, scored: 0, total: 0 })
        row.total += 1
        if (a.scored) row.scored += 1
      }
    }
  }

  return {
    record,
    goalsFor,
    goalsAgainst,
    biggestWin,
    heaviestLoss,
    perPeriod: Array.from(perPeriod, (p) => p ?? { us: 0, them: 0 }),
    scorers: Object.values(scorers).sort(
      (a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name),
    ),
    takers: Object.values(takers),
    shootouts,
    // Historiek staat nieuwste eerst; de vorm leest van oud (links) naar nieuw.
    form: played.slice(0, 5).map(resultOf).reverse(),
  }
}

const scoreLine = (h) => `${ourGoals(h)}–${theirGoals(h)} tegen ${h.theirName}`

function Stats({ teams, history, defaultTeamId }) {
  const [teamId, setTeamId] = useState(defaultTeamId)
  const [penaltySort, setPenaltySort] = useState('scored')
  const [goalsView, setGoalsView] = useState('total')
  const team = teams.find((t) => t.id === teamId) ?? teams[0]
  const played = playedBy(team, history)
  const st = teamStats(played)
  // Doelpunten als totaal of als gemiddelde per wedstrijd (één decimaal).
  const goals = (v) => (goalsView === 'avg' ? (v / n).toFixed(1).replace('.', ',') : v)
  const shootoutCount = st.shootouts.won + st.shootouts.drawn + st.shootouts.lost
  const rate = (p) => p.scored / p.total
  const takers = [...st.takers].sort((a, b) =>
    penaltySort === 'rate'
      ? rate(b) - rate(a) || b.scored - a.scored || a.name.localeCompare(b.name)
      : b.scored - a.scored || rate(b) - rate(a) || a.name.localeCompare(b.name),
  )
  const n = played.length

  return (
    <section className="pane-stats">
      <h2 className="section-title">Statistieken</h2>
      <div className="team-switch">
        {teams.map((t) => (
          <button
            key={t.id}
            className={t.id === team.id ? 'team-chip is-on' : 'team-chip'}
            onClick={() => setTeamId(t.id)}
            aria-pressed={t.id === team.id}
          >
            {t.ageGroup}
          </button>
        ))}
      </div>

      {/* Bij een andere ploeg komt alles opnieuw binnen. */}
      <div key={team.id}>
        {n === 0 ? (
          <p className="empty stats-empty">
            Nog geen afgewerkte wedstrijden voor de {team.ageGroup}. Na een wedstrijd verschijnen hier
            de cijfers.
          </p>
        ) : (
          <>
            <h2 className="section-title">Resultaten</h2>
            <div className="stat-tiles">
              <div className="stat-tile">
                <strong>{n}</strong>
                <span>{n === 1 ? 'wedstrijd' : 'wedstrijden'}</span>
              </div>
              <div className="stat-tile is-w">
                <strong>{st.record.W}</strong>
                <span>gewonnen</span>
              </div>
              <div className="stat-tile is-g">
                <strong>{st.record.G}</strong>
                <span>gelijk</span>
              </div>
              <div className="stat-tile is-v">
                <strong>{st.record.V}</strong>
                <span>verloren</span>
              </div>
            </div>

            <div className="stat-card stat-form">
              <span className="stat-card-label">Vorm</span>
              <span className="form-dots">
                {st.form.map((r, i) => (
                  <span key={i} className={`form-dot is-${r.toLowerCase()}`} title={RESULT_LABELS[r]}>
                    {r}
                  </span>
                ))}
              </span>
            </div>
            <p className="stat-note">Laatste {st.form.length} wedstrijden, meest recente rechts.</p>

            <h2 className="section-title">Doelpunten</h2>
            <div className="stat-sort stat-sort-top">
              <span className="choice-label">Toon</span>
              <div className="periods">
                <button
                  className={goalsView === 'total' ? 'per is-on' : 'per'}
                  onClick={() => setGoalsView('total')}
                  aria-pressed={goalsView === 'total'}
                >
                  Totaal
                </button>
                <button
                  className={goalsView === 'avg' ? 'per is-on' : 'per'}
                  onClick={() => setGoalsView('avg')}
                  aria-pressed={goalsView === 'avg'}
                >
                  Per wedstrijd
                </button>
              </div>
            </div>
            <div key={goalsView} className="stat-tiles stat-tiles-3">
              <div className="stat-tile">
                <strong className="is-ours">{goals(st.goalsFor)}</strong>
                <span>gescoord</span>
              </div>
              <div className="stat-tile">
                <strong>{goals(st.goalsAgainst)}</strong>
                <span>tegen</span>
              </div>
              <div className="stat-tile">
                <strong>
                  {st.goalsFor - st.goalsAgainst > 0 ? '+' : ''}
                  {goals(st.goalsFor - st.goalsAgainst)}
                </strong>
                <span>doelsaldo</span>
              </div>
            </div>
            {(st.biggestWin || st.heaviestLoss) && (
              <ul className="stat-card stat-list">
                {st.biggestWin && (
                  <li>
                    <span>Grootste overwinning</span>
                    <strong>{scoreLine(st.biggestWin)}</strong>
                  </li>
                )}
                {st.heaviestLoss && (
                  <li>
                    <span>Zwaarste nederlaag</span>
                    <strong>{scoreLine(st.heaviestLoss)}</strong>
                  </li>
                )}
              </ul>
            )}

            {st.perPeriod.length > 0 && (
              <>
                <h2 className="section-title">Per periode</h2>
                <ul key={goalsView} className="stat-card stat-list">
                  {st.perPeriod.map((p, i) => (
                    <li key={i}>
                      <span>Periode {i + 1}</span>
                      <strong>
                        <span className="is-ours">{goals(p.us)}</span> – {goals(p.them)}
                      </strong>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h2 className="section-title">Topschutters</h2>
            {st.scorers.length === 0 ? (
              <p className="empty">Nog geen doelpunten met een naam erbij.</p>
            ) : (
              <ol className="stat-card stat-rank">
                {st.scorers.map((p, i) => (
                  <li key={p.name}>
                    <span className="stat-rank-pos">{i + 1}</span>
                    <span className="stat-rank-name">
                      {p.name}
                      <small>
                        {p.matches} {p.matches === 1 ? 'wedstrijd' : 'wedstrijden'} gescoord
                        {p.hattricks > 0 &&
                          ` · ${p.hattricks} ${p.hattricks === 1 ? 'hattrick' : 'hattricks'}`}
                      </small>
                    </span>
                    <span className="stat-rank-value">{p.goals}</span>
                  </li>
                ))}
              </ol>
            )}

            {st.takers.length > 0 && (
              <>
                <h2 className="section-title">Strafschoppen</h2>
                <div className="stat-tiles">
                  <div className="stat-tile">
                    <strong>{shootoutCount}</strong>
                    <span>{shootoutCount === 1 ? 'reeks' : 'reeksen'}</span>
                  </div>
                  <div className="stat-tile is-w">
                    <strong>{st.shootouts.won}</strong>
                    <span>gewonnen</span>
                  </div>
                  <div className="stat-tile is-g">
                    <strong>{st.shootouts.drawn}</strong>
                    <span>gelijk</span>
                  </div>
                  <div className="stat-tile is-v">
                    <strong>{st.shootouts.lost}</strong>
                    <span>verloren</span>
                  </div>
                </div>
                <div className="stat-sort">
                  <span className="choice-label">Sorteer op</span>
                  <div className="periods">
                    <button
                      className={penaltySort === 'scored' ? 'per is-on' : 'per'}
                      onClick={() => setPenaltySort('scored')}
                      aria-pressed={penaltySort === 'scored'}
                    >
                      Aantal raak
                    </button>
                    <button
                      className={penaltySort === 'rate' ? 'per is-on' : 'per'}
                      onClick={() => setPenaltySort('rate')}
                      aria-pressed={penaltySort === 'rate'}
                    >
                      % raak
                    </button>
                  </div>
                </div>
                <ol key={penaltySort} className="stat-card stat-rank">
                  {takers.map((p, i) => (
                    <li key={p.name}>
                      <span className="stat-rank-pos">{i + 1}</span>
                      <span className="stat-rank-name">
                        {p.name}
                        <small>{Math.round((p.scored / p.total) * 100)}% raak</small>
                      </span>
                      <span className="stat-rank-value">
                        {p.scored}
                        <span className="stat-rank-of">/{p.total}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function History({ teams, history, onView, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(null)
  const [teamId, setTeamId] = useState(null)
  const team = teams.find((t) => t.id === teamId)
  const shown = team ? playedBy(team, history) : history

  return (
    <section className="pane-history">
      <h2 className="section-title">Vorige wedstrijden</h2>
      {teams.length > 1 && history.length > 0 && (
        <div className="team-switch">
          <button
            className={team ? 'team-chip' : 'team-chip is-on'}
            onClick={() => setTeamId(null)}
            aria-pressed={!team}
          >
            Alle
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              className={t.id === team?.id ? 'team-chip is-on' : 'team-chip'}
              onClick={() => setTeamId(t.id)}
              aria-pressed={t.id === team?.id}
            >
              {t.ageGroup}
            </button>
          ))}
        </div>
      )}
      {history.length === 0 ? (
        <p className="empty">
          Nog geen afgewerkte wedstrijden. Druk na een wedstrijd op <strong>Beëindig</strong>{' '}
          om ze hier te bewaren.
        </p>
      ) : (
        shown.length === 0 ? (
          <p className="empty history-empty">
            Nog geen afgewerkte wedstrijden voor de {team.ageGroup}.
          </p>
        ) : (
          <ul key={team?.id ?? 'all'} className="history-list">
            {shown.map((h) => (
              <li key={h.id}>
                <button className="history-item" onClick={() => onView(h)}>
                  <span
                    className={`form-dot is-${resultOf(h).toLowerCase()}`}
                    title={RESULT_LABELS[resultOf(h)]}
                  >
                    {resultOf(h)}
                  </span>
                  <span className="history-item-score">
                    <span className={h.left.ours ? 'is-ours' : ''}>{h.left.goals}</span>
                    <span className="history-item-dash">–</span>
                    <span className={h.right.ours ? 'is-ours' : ''}>{h.right.goals}</span>
                  </span>
                  <span className="history-item-info">
                    <span className="history-item-opponent">{h.theirName}</span>
                    <span className="history-item-meta">
                      <span className="age-chip">{h.ageGroup}</span>
                      {h.date}
                    </span>
                  </span>
                </button>
                <button
                  className="btn btn-quiet btn-icon"
                  onClick={() => setConfirmingDelete(h)}
                  aria-label={`Verwijder wedstrijd tegen ${h.theirName}`}
                  title="Verwijder"
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {confirmingDelete && (
        <Confirm
          title="Wedstrijd verwijderen?"
          body={`De bewaarde wedstrijd tegen ${confirmingDelete.theirName} (${confirmingDelete.date}) wordt definitief verwijderd uit Uitslagen.`}
          confirmLabel="Ja, verwijder"
          danger
          onConfirm={() => {
            onDelete(confirmingDelete.id)
            setConfirmingDelete(null)
          }}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </section>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 4.5 L16 10 L6 15.5 Z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="5" y="4" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="11" y="4" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

// Voetbal met een groen vinkje: strafschop gescoord. De ⚽ van het toestel
// zelf is op dit formaat het best herkenbaar.
function BallScoredIcon() {
  return (
    <span className="ball-scored" aria-hidden="true">
      <span className="ball-scored-ball">⚽</span>
      <span className="ball-scored-check">✓</span>
    </span>
  )
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M5 17.5V3m0 1h9l-2 3.25L14 10.5H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M4 7h11m-3-3 3 3-3 3M16 13H5m3-3-3 3 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M15.5 10a5.5 5.5 0 1 1-1.66-3.94"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15.5 4.5v3.5h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M7 4 L3 8 L7 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8h8a5 5 0 0 1 0 10h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M10 4v12M4 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6l.6 9.2a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function AutoThemeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="2.8" y="3.8" width="14.4" height="9.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 16.8h6M10 13.6v3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M16.2 12.2A6.6 6.6 0 0 1 7.8 3.8a6.6 6.6 0 1 0 8.4 8.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const THEME_OPTIONS = [
  { value: 'light', short: 'Licht', Icon: SunIcon },
  { value: 'auto', short: 'Automatisch', Icon: AutoThemeIcon },
  { value: 'dark', short: 'Donker', Icon: MoonIcon },
]

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle className="live-dot" cx="12" cy="12" r="3" fill="currentColor" />
      <path className="live-waves" d="M6.7 6.7a7.5 7.5 0 0 0 0 10.6M17.3 6.7a7.5 7.5 0 0 1 0 10.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2M14.2 14.5c.8-.5 1.7-.7 2.8-.7 2.2 0 3.5 1.2 3.8 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3.5 4.5v3.5H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M5 19.5V13M10 19.5V5M15 19.5V10M20 19.5V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.3" r="1.15" fill="currentColor" />
      <rect x="8.9" y="8.9" width="2.2" height="6" rx="1.1" fill="currentColor" />
    </svg>
  )
}

// Keuzelijst voor een getal: op een gsm opent dat het scrollwiel of de
// scrollbare lijst van het toestel, in plaats van een toetsenbord.
function NumberSelect({ value, min, max, onChange, ...props }) {
  return (
    <select
      {...props}
      className="field"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

// Keuze voor de wisselmelding: uit, halverwege elke periode, of om de zoveel
// minuten. Gebruikt bij de start van een match en tijdens de match.
function SubChoice({ subMinutes, periodMinutes, onChange }) {
  return (
    <>
      <div className="periods sub-choice">
        <button
          className={subMinutes === 0 ? 'per is-on' : 'per'}
          onClick={() => onChange(0)}
          aria-pressed={subMinutes === 0}
        >
          Uit
        </button>
        <button
          className={subMinutes == null ? 'per is-on' : 'per'}
          onClick={() => onChange(null)}
          aria-pressed={subMinutes == null}
        >
          Halverwege
        </button>
        <button
          className={subMinutes > 0 ? 'per is-on' : 'per'}
          onClick={() => {
            if (!(subMinutes > 0)) onChange(Math.max(1, Math.floor(periodMinutes / 3)))
          }}
          aria-pressed={subMinutes > 0}
        >
          Om de … min
        </button>
      </div>
      {subMinutes > 0 && (
        <label className="field-group sub-every">
          <span className="field-group-label">Minuten tussen wissels</span>
          <NumberSelect
            min={1}
            max={45}
            value={subMinutes}
            onChange={onChange}
            aria-label="Minuten tussen wissels"
          />
        </label>
      )}
      <p className="sub-hint">
        {subMinutes === 0
          ? 'Geen wisselmelding tijdens de match.'
          : subMinutes == null
            ? `Melding op ${mmss(Math.floor((periodMinutes * 60) / 2))} in elke periode, met 30 seconden aftellen.`
            : subMinutes >= periodMinutes
              ? 'Langer dan een periode: er valt geen wisselmoment binnen de periode.'
              : `Melding om de ${subMinutes} min in elke periode, met 30 seconden aftellen.`}
      </p>
    </>
  )
}

function SubSettings({ subMinutes, periodMinutes, onSave, onCancel }) {
  const panel = useRef(null)
  const [value, setValue] = useState(subMinutes)
  const { leave, cancel, overlayClass } = useDialog(panel, onCancel)

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={cancel}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sub-settings-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sub-settings-title">Wisselmelding</h2>
        <SubChoice subMinutes={value} periodMinutes={periodMinutes} onChange={setValue} />
        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            Annuleer
          </button>
          <button className="btn btn-primary" onClick={() => leave(() => onSave(value))}>
            Bewaar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function StartStep({ num, children, aside }) {
  return (
    <div className="start-step">
      <span className="start-step-num">{num}</span>
      <span className="start-step-label">{children}</span>
      {aside}
    </div>
  )
}

function StartMatch({ teams, defaultTeamId, onStart, onCancel }) {
  const panel = useRef(null)
  const [teamId, setTeamId] = useState(defaultTeamId)
  const team = teams.find((t) => t.id === teamId) ?? teams[0]
  const [opponent, setOpponent] = useState('')
  const [home, setHome] = useState(team.home)
  const [periodsCount, setPeriodsCount] = useState(team.periodsCount)
  const [periodMinutes, setPeriodMinutes] = useState(team.periodMinutes)
  const [subMinutes, setSubMinutes] = useState(team.subMinutes)
  const [activePlayerIds, setActivePlayerIds] = useState(team.players.map((p) => p.id))

  const selectTeam = (id) => {
    const t = teams.find((candidate) => candidate.id === id)
    if (!t) return
    setTeamId(id)
    setOpponent('')
    setHome(t.home)
    setPeriodsCount(t.periodsCount)
    setPeriodMinutes(t.periodMinutes)
    setSubMinutes(t.subMinutes)
    setActivePlayerIds(t.players.map((p) => p.id))
  }

  const togglePlayer = (id) =>
    setActivePlayerIds((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    )

  const cfg = AGE_CONFIG[team.ageGroup] ?? AGE_CONFIG.U9
  const isDefault = periodsCount === cfg.periods && periodMinutes === cfg.minutes
  const resetDefaults = () => {
    setPeriodsCount(cfg.periods)
    setPeriodMinutes(cfg.minutes)
  }

  const us = team.events.filter((e) => e.team === 'us').length
  const them = team.events.length - us
  const hasProgress = team.events.length > 0 || team.clocks.some((c) => c > 0)

  const start = () =>
    leave(() =>
      onStart({
        teamId,
        opponent: opponent.trim(),
        home,
        periodsCount,
        periodMinutes,
        subMinutes,
        activePlayerIds,
      }),
    )

  const { leave, cancel, overlayClass } = useDialog(panel, onCancel)

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  const selected = team.players.filter((p) => activePlayerIds.includes(p.id)).length
  const allSelected = selected === team.players.length
  const summary = [
    team.ageGroup,
    `${home ? 'thuis' : 'uit'} tegen ${opponent.trim() || OPPONENT}`,
    `${periodsCount} × ${periodMinutes}'`,
  ].join(' · ')

  // Zonder ploegkeuze (één ploeg) begint de nummering bij de tegenstander.
  const first = teams.length > 1 ? 1 : 0

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={cancel}>
      <div
        className="dialog dialog-start"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-match-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="start-head">
          <h2 id="start-match-title">Nieuwe wedstrijd</h2>
          <p className="start-summary">{summary}</p>
        </header>

        <div className="start-body">
          {teams.length > 1 && (
            <section>
              <StartStep num={1}>Ploeg</StartStep>
              <div className="team-switch">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    className={t.id === teamId ? 'team-chip is-on' : 'team-chip'}
                    onClick={() => selectTeam(t.id)}
                    aria-pressed={t.id === teamId}
                  >
                    {t.ageGroup}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <StartStep num={first + 1}>Tegenstander</StartStep>
            <input
              id="new-match-opponent"
              className="field"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Naam van de tegenstander"
              aria-label="Naam tegenstander"
            />
            <div className="start-seg" role="group" aria-label={`${TEAM} speelt`}>
              <button
                className={home ? 'per is-on' : 'per'}
                onClick={() => setHome(true)}
                aria-pressed={home}
              >
                Thuis
              </button>
              <button
                className={home ? 'per' : 'per is-on'}
                onClick={() => setHome(false)}
                aria-pressed={!home}
              >
                Uit
              </button>
            </div>
          </section>

          <section>
            <StartStep num={first + 2}>Speeltijd</StartStep>
            <div className="row row-flush">
              <label className="field-group">
                <span className="field-group-label">Periodes</span>
                <NumberSelect
                  min={1}
                  max={12}
                  value={periodsCount}
                  onChange={setPeriodsCount}
                  aria-label="Aantal periodes"
                />
              </label>
              <label className="field-group">
                <span className="field-group-label">Minuten per periode</span>
                <NumberSelect
                  min={1}
                  max={45}
                  value={periodMinutes}
                  onChange={setPeriodMinutes}
                  aria-label="Minuten per periode"
                />
              </label>
            </div>
            <p className="start-note">
              {isDefault
                ? `Standaard voor ${team.ageGroup} (${FORMAT_LABELS[cfg.format]}).`
                : `Standaard voor ${team.ageGroup} is ${cfg.periods} × ${cfg.minutes}'.`}{' '}
              {!isDefault && (
                <button className="start-link" onClick={resetDefaults}>
                  Herstel
                </button>
              )}
            </p>
            <a
              className="rules-link"
              href={FORMAT_RULES_URL[cfg.format]}
              target="_blank"
              rel="noreferrer"
            >
              <InfoIcon />
              Spelreglement {cfg.format} bekijken (pdf)
            </a>
          </section>

          <section>
            <StartStep num={first + 3}>Wisselmelding</StartStep>
            <SubChoice
              subMinutes={subMinutes}
              periodMinutes={periodMinutes}
              onChange={setSubMinutes}
            />
          </section>

          <section>
            <StartStep
              num={first + 4}
              aside={
                team.players.length > 0 && (
                  <button
                    className="start-link start-step-aside"
                    onClick={() =>
                      setActivePlayerIds(allSelected ? [] : team.players.map((p) => p.id))
                    }
                  >
                    {allSelected ? 'Niemand' : 'Iedereen'}
                  </button>
                )
              }
            >
              Wie speelt mee?
              {team.players.length > 0 && (
                <span className="start-count">
                  {selected}/{team.players.length}
                </span>
              )}
            </StartStep>
            {team.players.length === 0 ? (
              <p className="start-note">Voeg eerst spelers toe bij Ploegen.</p>
            ) : (
              <div className="player-select">
                {team.players.map((p) => {
                  const on = activePlayerIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={on ? 'pick-chip is-on' : 'pick-chip'}
                      onClick={() => togglePlayer(p.id)}
                      aria-pressed={on}
                    >
                      <span className="pick-chip-check" aria-hidden="true">
                        {on ? '✓' : ''}
                      </span>
                      {p.name}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {hasProgress && (
            <p className="start-warning">
              De huidige stand ({us}–{them}) en tijdslijn van deze ploeg worden gewist.
            </p>
          )}
        </div>

        <footer className="start-foot">
          <button className="btn" onClick={cancel}>
            Annuleer
          </button>
          <button className="btn btn-go" onClick={start}>
            Start wedstrijd
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
