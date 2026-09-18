import { useEffect, useMemo, useRef, useState } from 'react'
import { drawSummary, loadClubLogo, heightFor, W as SHOT_W } from './summary.js'
import { version as APP_VERSION } from '../package.json'

const STORAGE_KEY = 'matchblad.v1'
const PERIODS = [1, 2, 3, 4]
const PERIOD_SECONDS_BY_AGE = { U7: 10 * 60, U9: 15 * 60 }
const TEAM = 'Lummen United'
const OPPONENT = 'Tegenstander'
const CLUB_LOGO = `${import.meta.env.BASE_URL}club-logo.png`

const periodSecondsFor = (ageGroup) => PERIOD_SECONDS_BY_AGE[ageGroup] ?? PERIOD_SECONDS_BY_AGE.U9

const RULES_URL = {
  U7: 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/3V3_Spelreglementjeugdvoetbalposter.pdf',
  U9: 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/5V5_Spelreglementjeugdvoetbalposter.pdf',
}

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyMatch = () => ({
  home: true,
  opponent: '',
  ageGroup: 'U9',
  players: [],
  events: [],
  period: 1,
  clocks: [0, 0, 0, 0],
})

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyMatch(), ...JSON.parse(raw) }
  } catch {
    // onleesbare opslag: begin met een lege match
  }
  return emptyMatch()
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

export default function App() {
  const [match, setMatch] = useState(load)
  const [running, setRunning] = useState(false)
  const [screen, setScreen] = useState('match')
  const [asking, setAsking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [compactBoard, setCompactBoard] = useState(false)
  const [standalone] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true,
  )
  const tick = useRef(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(match))
    } catch {
      // opslag geweigerd; de match blijft in het geheugen staan
    }
  }, [match])

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

  const clock = match.clocks[match.period - 1]
  const periodSeconds = periodSecondsFor(match.ageGroup)
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

  const summary = useMemo(() => {
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
    if (unnamed > 0) scorers.push({ name: 'Zonder naam', goals: unnamed, hattricks: 0 })

    return {
      date: new Date().toLocaleDateString('nl-BE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      ourName: TEAM,
      theirName: opponentName,
      ageGroup: match.ageGroup,
      left,
      right,
      events,
      scorers,
    }
  }, [match, score, goalsBy, runs, opponentName])

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

  const newMatch = () => {
    setRunning(false)
    setMatch((m) => ({ ...m, events: [], period: 1, clocks: [0, 0, 0, 0] }))
    setScreen('match')
    setAsking(false)
  }

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
          <span>Ploeg</span>
        </button>
        <button
          className={screen === 'wedstrijd' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('wedstrijd')}
          aria-current={screen === 'wedstrijd' ? 'page' : undefined}
        >
          <SettingsIcon />
          <span>Instellingen</span>
        </button>
      </nav>

      {screen === 'match' ? (
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

          <HattrickBanner live={runs.live} players={match.players} />

          <h2 className="section-title">Wie scoorde?</h2>
          {match.players.length === 0 && (
            <p className="empty">
              Nog geen spelers. Voeg ze toe bij <strong>Ploeg</strong> en tik hier daarna
              op de naam van de scorer.
            </p>
          )}
          <div className="grid">
            {match.players.map((p) => {
              const onARoll = runs.live?.playerId === p.id ? runs.live.len : 0
              return (
                <button
                  key={p.id}
                  className={onARoll >= 3 ? 'scorer is-hat' : 'scorer'}
                  onClick={() => addGoal('us', p.id)}
                >
                  {p.number !== '' && <span className="shirt">{p.number}</span>}
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
              Zonder naam
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
            <button className="btn btn-quiet" onClick={() => setAsking(true)}>
              Nieuwe match
            </button>
          </div>

          </div>

          <div className="pane pane-log">
            <Timeline match={match} runs={runs} opponentName={opponentName} onRemove={removeEvent} />
          </div>
        </>
      ) : screen === 'squad' ? (
        <Squad
          players={match.players}
          goalsBy={goalsBy}
          hattricks={runs.hattricks}
          onAdd={(player) =>
            setMatch((m) => ({ ...m, players: [...m.players, { id: uid(), ...player }] }))
          }
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
        <Wedstrijd
          opponent={match.opponent}
          onOpponentChange={(opponent) => setMatch((m) => ({ ...m, opponent }))}
          home={match.home}
          onVenueChange={(home) => setMatch((m) => ({ ...m, home }))}
          ageGroup={match.ageGroup}
          onAgeGroupChange={(ageGroup) => setMatch((m) => ({ ...m, ageGroup }))}
        />
      )}

      <footer className="foot">
        <img className="foot-logo" src={CLUB_LOGO} alt="" />
        <p>v{APP_VERSION}</p>
      </footer>

      {sharing && <Summary data={summary} onClose={() => setSharing(false)} />}

      {asking && (
        <Confirm
          title="Nieuwe match starten?"
          body={`De stand ${score.us}–${score.them} en de hele tijdslijn worden gewist. De spelerslijst blijft staan.`}
          confirmLabel="Wissen en starten"
          onConfirm={newMatch}
          onCancel={() => setAsking(false)}
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

function Confirm({ title, body, confirmLabel, onConfirm, onCancel }) {
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
            Annuleren
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

function Scoreboard({ home, score, opponentName, ageGroup, compact }) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  return (
    <header className={compact ? 'board is-compact' : 'board'}>
      <div className="board-row">
        <div className="side">
          <span className="team-name">{left.name}</span>
          <span className={left.ours ? 'goals goals-ours' : 'goals'}>{left.goals}</span>
        </div>
        <div className="board-mid">
          <span className="dash" aria-hidden="true">
            –
          </span>
          <span className="age-badge">{ageGroup}</span>
        </div>
        <div className="side side-right">
          <span className="team-name">{right.name}</span>
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
  const visiblePeriods = PERIODS.filter(
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
                      {r.team === 'us' ? (r.name ?? 'Doelpunt') : opponentName}
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
  const label =
    last.team === 'them' ? opponentName : player?.name ? player.name : 'Doelpunt zonder naam'

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

function Squad({ players, goalsBy, hattricks, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')

  const submit = () => {
    if (!name.trim()) return
    onAdd({ name: name.trim(), number: number.trim() })
    setName('')
    setNumber('')
  }

  return (
    <section className="pane-squad">
      <h2 className="section-title">Ploeg</h2>
      <div className="panel-card">
        <div className="row row-flush">
          <input
            className="field field-num"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Nr"
            inputMode="numeric"
            aria-label="Rugnummer"
          />
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
              {p.number !== '' && <span className="shirt">{p.number}</span>}
              <span className="squad-name">{p.name}</span>
              <span className="squad-goals">
                {goalsBy[p.id] ? `${goalsBy[p.id]}×` : ''}
                {hattricks[p.id] > 0 && (
                  <span className="squad-hat">
                    {hattricks[p.id] === 1 ? 'hattrick' : `${hattricks[p.id]} hattricks`}
                  </span>
                )}
              </span>
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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
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

function Wedstrijd({ opponent, onOpponentChange, home, onVenueChange, ageGroup, onAgeGroupChange }) {
  return (
    <section className="pane-squad">
      <h2 className="section-title">Instellingen</h2>

      <div className="panel-card">
        <label className="choice-label" htmlFor="opponent-name">
          Tegenstander
        </label>
        <input
          id="opponent-name"
          className="field"
          value={opponent}
          onChange={(e) => onOpponentChange(e.target.value)}
          placeholder={OPPONENT}
          aria-label="Naam tegenstander"
        />
      </div>

      <div className="panel-card choice-row">
        <span className="choice-label">{TEAM} speelt</span>
        <div className="periods">
          <button
            className={home ? 'per is-on' : 'per'}
            onClick={() => onVenueChange(true)}
            aria-pressed={home}
          >
            Thuis
          </button>
          <button
            className={home ? 'per' : 'per is-on'}
            onClick={() => onVenueChange(false)}
            aria-pressed={!home}
          >
            Uit
          </button>
        </div>
      </div>

      <div className="panel-card">
        <div className="choice-row">
          <span className="choice-label">Leeftijdscategorie</span>
          <div className="periods">
            <button
              className={ageGroup === 'U7' ? 'per is-on' : 'per'}
              onClick={() => onAgeGroupChange('U7')}
              aria-pressed={ageGroup === 'U7'}
            >
              U7 · 4×10&apos;
            </button>
            <button
              className={ageGroup === 'U9' ? 'per is-on' : 'per'}
              onClick={() => onAgeGroupChange('U9')}
              aria-pressed={ageGroup === 'U9'}
            >
              U9 · 4×15&apos;
            </button>
          </div>
        </div>

        <a
          className="rules-link"
          href={RULES_URL[ageGroup]}
          target="_blank"
          rel="noreferrer"
        >
          <InfoIcon />
          Spelreglement {ageGroup} bekijken (pdf)
        </a>
      </div>
    </section>
  )
}
