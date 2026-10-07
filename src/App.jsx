import { useEffect, useMemo, useRef, useState } from 'react'
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

// Spreekt een korte melding uit via de spraak van het toestel (Nederlandse
// stem als die er is). Loopt enkel zolang de app op het scherm staat.
function say(text) {
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
  }
}

// Voor opslag van vóór het "started"-veld: een team met al gescoorde
// doelpunten of een gelopen klok was toen al onderweg.
const hadActivity = (t) =>
  Boolean(t.events?.length > 0 || (t.clocks ?? []).some((c) => c > 0))

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
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
      const legacy = normalizeTeam({
        ...emptyTeam(parsed.ageGroup ?? 'U9'),
        ...parsed,
        started: parsed.started ?? hadActivity(parsed),
        activePlayerIds: parsed.activePlayerIds ?? (parsed.players ?? []).map((p) => p.id),
      })
      return { teams: [legacy], activeTeamId: legacy.id, history }
    }
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
  return groups.map((g) => ({ name: formatNames(g.names), goals: g.goals, hattricks: g.hattricks }))
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
  const [startingMatch, setStartingMatch] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [editingSubs, setEditingSubs] = useState(false)
  const [viewingHistory, setViewingHistory] = useState(null)
  const [compactBoard, setCompactBoard] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [standalone] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  )

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
  const periodOver = periodSeconds > 0 && clock >= periodSeconds
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
    setMatch((m) => (m.runningSince ? bakeElapsed(m) : { ...m, runningSince: Date.now() }))
  }

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
    const finished = { id: uid(), finishedAt: new Date().toISOString(), ...buildSummary(match) }
    setState((s) => ({
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
              clocks: [],
              runningSince: null,
            })
          : t,
      ),
    }))
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
      return { ...m, clocks, runningSince: null }
    })
    setResetting(false)
  }

  return (
    <div className="shell">
      <Scoreboard
        started={match.started}
        home={match.home}
        score={score}
        opponentName={opponentName}
        compact={compactBoard}
      />

      <nav className="tabs">
        <button
          className={screen === 'match' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('match')}
          aria-current={screen === 'match' ? 'page' : undefined}
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
          <span>Historiek</span>
        </button>
      </nav>

      {screen === 'match' ? (
        match.started ? (
        <>
          <div className="pane pane-play">
            {/* Tijdens de strafschoppen spelen klok en periodes geen rol meer. */}
            {!penaltiesShown && (
              <section className="clockbar">
                <div className="period-progress" aria-hidden="true">
                  {PERIODS.map((p) => {
                    const fill =
                      p < match.period
                        ? 1
                        : p > match.period || periodSeconds <= 0
                          ? 0
                          : Math.min(1, clock / periodSeconds)
                    return (
                      <span
                        key={p}
                        className={p === match.period ? 'period-seg is-current' : 'period-seg'}
                      >
                        <span className="period-seg-fill" style={{ width: `${fill * 100}%` }} />
                      </span>
                    )
                  })}
                </div>
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
                    {running ? <PauseIcon /> : <PlayIcon />}
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
                {subPhase === 'soon' && !subDismissed && (
                  <div className="sub-alert">
                    <span>Wisselen over</span>
                    <strong>{nextSub - clock}s</strong>
                  </div>
                )}
                {subPhase === 'now' && !subDismissed && (
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
                )}
                {periodOver && (
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
                )}
                {!running && !periodOver && (goalWhilePaused || clock === 0) && (
                  <p className={goalWhilePaused ? 'clock-hint is-warning' : 'clock-hint'}>
                    {goalWhilePaused
                      ? 'De klok loopt niet — tik ▶ om te starten.'
                      : 'Tik ▶ bij de aftrap om de klok te starten.'}
                  </p>
                )}
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
                    {goalsBy[p.id] > 0 && <span className="tally">{goalsBy[p.id]}</span>}
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
          <div className="pane pane-play">
            <div className="no-match">
              <p className="no-match-text">Nog geen wedstrijd bezig.</p>
              <button className="btn btn-primary btn-start-hero" onClick={() => setStartingMatch(true)}>
                Nieuwe wedstrijd
              </button>
            </div>
          </div>
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
      ) : (
        <History
          history={state.history}
          onView={setViewingHistory}
          onDelete={deleteHistoryEntry}
        />
      )}

      <div className="foot-spacer" aria-hidden="true" />
      <footer className="foot">
        <img className="foot-logo" src={CLUB_LOGO} alt="" />
        <p>v{APP_VERSION}</p>
      </footer>


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
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} wordt bewaard in de Historiek.`}
          confirmLabel="Ja, beëindig"
          danger
          onConfirm={endMatch}
          onCancel={() => setEnding(false)}
        />
      )}

      {canceling && (
        <Confirm
          title="Wedstrijd annuleren?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} gaat verloren en wordt niet bewaard in de Historiek.`}
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

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Samenvatting van de match"
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
          <button className="btn" onClick={onClose}>
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
    </div>
  )
}

// Gedrag van een venster: focus erin bij openen, Escape sluit, Tab blijft
// binnen het venster, en de pagina erachter scrolt niet mee.
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

function Confirm({ title, body, confirmLabel, cancelLabel = 'Nee', danger, onConfirm, onCancel }) {
  const panel = useRef(null)

  useModal(panel, onCancel)

  return (
    <div className="overlay" onClick={onCancel}>
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
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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

function Scoreboard({ started, home, score, opponentName, compact }) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  if (!started) {
    return (
      <header className={compact ? 'board is-compact' : 'board'}>
        <div className="board-row board-row-idle">
          <span className="team-name team-name-ours">{TEAM} – Scorebord</span>
        </div>
      </header>
    )
  }

  return (
    <header className={compact ? 'board is-compact' : 'board'}>
      <div className="board-row">
        <div className="side">
          <span className={left.ours ? 'team-name team-name-ours' : 'team-name'}>{left.name}</span>
          <span className={left.ours ? 'goals goals-ours' : 'goals'}>{left.goals}</span>
        </div>
        <div className="board-mid">
          <span className="dash" aria-hidden="true">
            –
          </span>
        </div>
        <div className="side side-right">
          <span className={right.ours ? 'team-name team-name-ours' : 'team-name'}>{right.name}</span>
          <span className={right.ours ? 'goals goals-ours' : 'goals'}>{right.goals}</span>
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
    <section className="last-action" aria-live="polite">
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
  useModal(panel, onCancel)

  return (
    <div className="overlay" onClick={onCancel}>
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
          <button className="btn penalty-choice-yes" onClick={() => onPick(true)}>
            <BallScoredIcon />
            Doelpunt
          </button>
          <button className="btn penalty-choice-no" onClick={() => onPick(false)}>
            <span className="penalty-choice-x" aria-hidden="true">
              ✗
            </span>
            Gemist
          </button>
        </div>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            Annuleer
          </button>
        </div>
      </div>
    </div>
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
              {taken.length > 0 && (
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
                  <strong>
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
      <div className="panel-card">
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

function History({ history, onView, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(null)

  return (
    <section className="pane-history">
      <h2 className="section-title">Historiek</h2>
      {history.length === 0 ? (
        <p className="empty">
          Nog geen afgewerkte wedstrijden. Druk na een wedstrijd op <strong>Beëindig</strong>{' '}
          om ze hier te bewaren.
        </p>
      ) : (
        <ul className="history-list">
          {history.map((h) => (
            <li key={h.id}>
              <button className="history-item" onClick={() => onView(h)}>
                <span className="history-item-score">
                  <span className={h.left.ours ? 'is-ours' : ''}>{h.left.goals}</span>
                  <span className="history-item-dash">–</span>
                  <span className={h.right.ours ? 'is-ours' : ''}>{h.right.goals}</span>
                </span>
                <span className="history-item-info">
                  <span className="history-item-opponent">{h.theirName}</span>
                  <span className="history-item-meta">
                    {h.ageGroup} · {h.date}
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
      )}

      {confirmingDelete && (
        <Confirm
          title="Wedstrijd verwijderen?"
          body={`De bewaarde wedstrijd tegen ${confirmingDelete.theirName} (${confirmingDelete.date}) wordt definitief verwijderd uit de Historiek.`}
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

function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M6.7 6.7a7.5 7.5 0 0 0 0 10.6M17.3 6.7a7.5 7.5 0 0 1 0 10.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
  useModal(panel, onCancel)

  return (
    <div className="overlay" onClick={onCancel}>
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
          <button className="btn" onClick={onCancel}>
            Annuleer
          </button>
          <button className="btn btn-primary" onClick={() => onSave(value)}>
            Bewaar
          </button>
        </div>
      </div>
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
    onStart({
      teamId,
      opponent: opponent.trim(),
      home,
      periodsCount,
      periodMinutes,
      subMinutes,
      activePlayerIds,
    })

  useModal(panel, onCancel)

  return (
    <div className="overlay" onClick={onCancel}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-match-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="start-match-title">Nieuwe wedstrijd</h2>

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

        <div className="panel-card">
          <label className="choice-label" htmlFor="new-match-opponent">
            Tegenstander
          </label>
          <input
            id="new-match-opponent"
            className="field"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder={OPPONENT}
            aria-label="Naam tegenstander"
          />
        </div>

        <div className="panel-card choice-row">
          <span className="choice-label">{TEAM} speelt</span>
          <div className="periods">
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
        </div>

        <div className="panel-card">
          <span className="choice-label">
            Periodes ({team.ageGroup} · {FORMAT_LABELS[cfg.format]})
          </span>
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
          {!isDefault && (
            <button className="btn btn-quiet btn-reset-defaults" onClick={resetDefaults}>
              Herstel standaard ({cfg.periods} × {cfg.minutes}&apos;)
            </button>
          )}
        </div>

        <div className="panel-card">
          <span className="choice-label">Wisselmelding</span>
          <SubChoice
            subMinutes={subMinutes}
            periodMinutes={periodMinutes}
            onChange={setSubMinutes}
          />
        </div>

        <div className="panel-card">
          <span className="choice-label">Wie speelt mee?</span>
          {team.players.length === 0 ? (
            <p className="empty">Voeg eerst spelers toe bij Ploegen.</p>
          ) : (
            <div className="player-select">
              {team.players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={activePlayerIds.includes(p.id) ? 'team-chip is-on' : 'team-chip'}
                  onClick={() => togglePlayer(p.id)}
                  aria-pressed={activePlayerIds.includes(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <a
          className="rules-link"
          href={FORMAT_RULES_URL[cfg.format]}
          target="_blank"
          rel="noreferrer"
        >
          <InfoIcon />
          Spelreglement {cfg.format} bekijken (pdf)
        </a>

        {hasProgress && (
          <p className="empty">
            De huidige stand ({us}–{them}) en tijdslijn van deze ploeg worden gewist.
          </p>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            Annuleer
          </button>
          <button className="btn btn-primary" onClick={start}>
            Start
          </button>
        </div>
      </div>
    </div>
  )
}
