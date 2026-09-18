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
    period: 1,
    clocks: Array(cfg.periods).fill(0),
    started: false,
    activePlayerIds: [],
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

  const [running, setRunning] = useState(false)
  const [screen, setScreen] = useState('match')
  const [startingMatch, setStartingMatch] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [viewingHistory, setViewingHistory] = useState(null)
  const [compactBoard, setCompactBoard] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [standalone] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  )
  const tick = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // opslag geweigerd; de gegevens blijven in het geheugen staan
    }
  }, [state])

  useEffect(() => {
    if (!running) return
    tick.current = setInterval(() => {
      setMatch((m) => {
        const clocks = [...m.clocks]
        clocks[m.period - 1] = clocks[m.period - 1] + 1
        return { ...m, clocks }
      })
    }, 1000)
    return () => clearInterval(tick.current)
  }, [running])

  useEffect(() => {
    const onScroll = () => {
      setCompactBoard((compact) =>
        compact ? window.scrollY > 12 : window.scrollY > 56,
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
  const clock = match.clocks[match.period - 1]
  const periodSeconds = match.periodMinutes * 60
  const extraSeconds = Math.max(0, clock - periodSeconds)
  const canUndoPeriod =
    match.period > 1 && !match.events.some((event) => event.period === match.period)

  const [timeUp, setTimeUp] = useState(false)
  useEffect(() => {
    if (clock !== periodSeconds || periodSeconds <= 0) return
    navigator.vibrate?.(200)
    setTimeUp(true)
    const t = setTimeout(() => setTimeUp(false), 1200)
    return () => clearTimeout(t)
  }, [clock, periodSeconds])

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

  const summary = useMemo(() => buildSummary(match), [match])

  const addGoal = (team, playerId = null) => {
    setMatch((m) => ({
      ...m,
      events: [
        ...m.events,
        {
          id: uid(),
          team,
          playerId,
          period: m.period,
          clock: m.clocks[m.period - 1] || null,
        },
      ],
    }))
  }

  const undo = () => setMatch((m) => ({ ...m, events: m.events.slice(0, -1) }))

  const removeEvent = (id) =>
    setMatch((m) => ({ ...m, events: m.events.filter((e) => e.id !== id) }))

  const advancePeriod = () => {
    if (match.period >= PERIODS.length) return
    setRunning(false)
    setMatch((m) => ({ ...m, period: m.period + 1 }))
  }

  const undoPeriodChange = () => {
    if (match.period <= 1) return
    setRunning(false)
    setMatch((m) => ({ ...m, period: m.period - 1 }))
  }

  const startMatch = ({ teamId, opponent, home, periodsCount, periodMinutes, activePlayerIds }) => {
    setRunning(false)
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
              events: [],
              period: 1,
              clocks: Array(periodsCount).fill(0),
              started: true,
              activePlayerIds,
            })
          : t,
      ),
    }))
    setScreen('match')
    setStartingMatch(false)
  }

  const endMatch = () => {
    setRunning(false)
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
              period: 1,
              clocks: Array(t.periodsCount).fill(0),
            })
          : t,
      ),
    }))
    setEnding(false)
  }

  const cancelMatch = () => {
    setRunning(false)
    setMatch((m) => ({
      ...m,
      started: false,
      events: [],
      period: 1,
      clocks: Array(m.periodsCount).fill(0),
    }))
    setCanceling(false)
  }

  const deleteHistoryEntry = (id) =>
    setState((s) => ({ ...s, history: s.history.filter((h) => h.id !== id) }))

  const resetClock = () => {
    setRunning(false)
    setMatch((m) => {
      const clocks = [...m.clocks]
      clocks[m.period - 1] = 0
      return { ...m, clocks }
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
        ageGroup={match.ageGroup}
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
            <section className="clockbar">
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
                  onClick={() => setRunning((r) => !r)}
                  aria-label={running ? 'Pauze' : 'Start'}
                  title={running ? 'Pauze' : 'Start'}
                >
                  {running ? <PauseIcon /> : <PlayIcon />}
                  <span>{running ? 'Pauze' : 'Start'}</span>
                </button>
                {match.period < PERIODS.length && (
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
            </section>

          <HattrickBanner live={runs.live} players={squadPlayers} />

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
          </div>

          <div className="opponent-action">
            <button className="btn btn-away btn-opponent" onClick={() => addGoal('them')}>
              <span aria-hidden="true">+</span>
              Tegendoelpunt
            </button>
          </div>

          {canUndoPeriod ? (
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
                aria-label="Ongedaan maken"
                title="Ongedaan maken"
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
          )}

          <div className="row row-secondary">
            <button className="btn" onClick={() => setSharing(true)}>
              Samenvatting
            </button>
            <button className="btn btn-quiet" onClick={() => setEnding(true)}>
              Beëindigen
            </button>
            <button className="btn btn-quiet" onClick={() => setCanceling(true)}>
              Annuleren
            </button>
          </div>

          </div>

          <div className="pane pane-log">
            <Timeline match={match} runs={runs} opponentName={opponentName} onRemove={removeEvent} />
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

      {sharing && <Summary data={summary} onClose={() => setSharing(false)} />}

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
          confirmLabel="Terug op nul"
          onConfirm={resetClock}
          onCancel={() => setResetting(false)}
        />
      )}

      {ending && (
        <Confirm
          title="Wedstrijd beëindigen?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} wordt bewaard in de Historiek.`}
          confirmLabel="Beëindigen"
          onConfirm={endMatch}
          onCancel={() => setEnding(false)}
        />
      )}

      {canceling && (
        <Confirm
          title="Wedstrijd annuleren?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} gaat verloren en wordt niet bewaard in de Historiek.`}
          confirmLabel="Annuleren"
          cancelLabel="Verdergaan"
          onConfirm={cancelMatch}
          onCancel={() => setCanceling(false)}
        />
      )}

      {updateAvailable && (
        <div className="update-toast" role="status">
          <span>Nieuwe versie beschikbaar</span>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Vernieuwen
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
            Sluiten
          </button>
          {url && !canShare && (
            <button className="btn btn-primary" onClick={save}>
              Bewaren
            </button>
          )}
          {canShare && (
            <button className="btn btn-primary" onClick={share}>
              Delen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Confirm({ title, body, confirmLabel, cancelLabel = 'Annuleren', onConfirm, onCancel }) {
  const panel = useRef(null)

  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      // Houd de focus binnen het venster zolang het openstaat.
      const focusable = panel.current?.querySelectorAll('button') ?? []
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
  }, [onCancel])

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
          <button className="btn btn-primary" onClick={onConfirm}>
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

function Scoreboard({ started, home, score, opponentName, ageGroup, compact }) {
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
          <span className="age-badge">{ageGroup}</span>
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
                      onClick={() => onRemove(r.id)}
                      aria-label="Dit doelpunt verwijderen"
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
        aria-label="Ongedaan maken"
        title="Ongedaan maken"
      >
        <UndoIcon />
      </button>
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
          aria-label="Ploeg toevoegen"
          aria-expanded={addingTeam}
          title="Ploeg toevoegen"
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
              aria-label="Ploeg toevoegen bevestigen"
              title="Ploeg toevoegen"
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
            aria-label="Speler toevoegen"
            title="Speler toevoegen"
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
                onClick={() => onRemove(p.id)}
                aria-label={`${p.name} verwijderen`}
                title={`${p.name} verwijderen`}
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
          Deze ploeg verwijderen
        </button>
      )}

      {confirmingRemove && (
        <Confirm
          title="Ploeg verwijderen?"
          body="De spelerslijst en de hele matchgeschiedenis van deze ploeg gaan verloren."
          confirmLabel="Verwijderen"
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
          Nog geen afgewerkte wedstrijden. Druk na een wedstrijd op <strong>Beëindigen</strong>{' '}
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
                aria-label={`Wedstrijd tegen ${h.theirName} verwijderen`}
                title="Verwijderen"
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
          confirmLabel="Verwijderen"
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

const clampNumber = (value, min, max) => {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function StartMatch({ teams, defaultTeamId, onStart, onCancel }) {
  const panel = useRef(null)
  const [teamId, setTeamId] = useState(defaultTeamId)
  const team = teams.find((t) => t.id === teamId) ?? teams[0]
  const [opponent, setOpponent] = useState('')
  const [home, setHome] = useState(team.home)
  const [periodsCount, setPeriodsCount] = useState(team.periodsCount)
  const [periodMinutes, setPeriodMinutes] = useState(team.periodMinutes)
  const [activePlayerIds, setActivePlayerIds] = useState(team.players.map((p) => p.id))

  const selectTeam = (id) => {
    const t = teams.find((candidate) => candidate.id === id)
    if (!t) return
    setTeamId(id)
    setOpponent('')
    setHome(t.home)
    setPeriodsCount(t.periodsCount)
    setPeriodMinutes(t.periodMinutes)
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
      activePlayerIds,
    })

  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      // Houd de focus binnen het venster zolang het openstaat.
      const focusable = panel.current?.querySelectorAll('button, input, a[href]') ?? []
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
  }, [onCancel])

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
              <input
                className="field"
                type="number"
                inputMode="numeric"
                min="1"
                max="12"
                value={periodsCount}
                onChange={(e) => setPeriodsCount(clampNumber(e.target.value, 1, 12))}
                aria-label="Aantal periodes"
              />
            </label>
            <label className="field-group">
              <span className="field-group-label">Minuten per periode</span>
              <input
                className="field"
                type="number"
                inputMode="numeric"
                min="1"
                max="90"
                value={periodMinutes}
                onChange={(e) => setPeriodMinutes(clampNumber(e.target.value, 1, 90))}
                aria-label="Minuten per periode"
              />
            </label>
          </div>
          {!isDefault && (
            <button className="btn btn-quiet btn-reset-defaults" onClick={resetDefaults}>
              Standaard herstellen ({cfg.periods} × {cfg.minutes}&apos;)
            </button>
          )}
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
            Annuleren
          </button>
          <button className="btn btn-primary" onClick={start}>
            Starten
          </button>
        </div>
      </div>
    </div>
  )
}
