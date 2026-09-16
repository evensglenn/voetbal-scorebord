import { useEffect, useMemo, useRef, useState } from 'react'

const STORAGE_KEY = 'matchblad.v1'
const PERIODS = [1, 2, 3, 4]
const PERIOD_SECONDS = 15 * 60
const TEAM = 'Lummen United'
const OPPONENT = 'Tegenstander'

const uid = () => Math.random().toString(36).slice(2, 10)

const emptyMatch = () => ({
  home: true,
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

export default function App() {
  const [match, setMatch] = useState(load)
  const [running, setRunning] = useState(false)
  const [screen, setScreen] = useState('match')
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
        clocks[m.period - 1] = Math.min(PERIOD_SECONDS, clocks[m.period - 1] + 1)
        return { ...m, clocks }
      })
    }, 1000)
    return () => clearInterval(tick.current)
  }, [running])

  const clock = match.clocks[match.period - 1]
  useEffect(() => {
    if (clock >= PERIOD_SECONDS) setRunning(false)
  }, [clock])

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

  const addGoal = (team, playerId = null) =>
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

  const undo = () => setMatch((m) => ({ ...m, events: m.events.slice(0, -1) }))

  const removeEvent = (id) =>
    setMatch((m) => ({ ...m, events: m.events.filter((e) => e.id !== id) }))

  const setPeriod = (p) => {
    setRunning(false)
    setMatch((m) => ({ ...m, period: p }))
  }

  const newMatch = () => {
    if (!confirm('Nieuwe match starten? Score en tijdslijn worden gewist, spelers blijven.'))
      return
    setRunning(false)
    setMatch((m) => ({ ...m, events: [], period: 1, clocks: [0, 0, 0, 0] }))
    setScreen('match')
  }

  return (
    <div className="shell">
      <Scoreboard
        home={match.home}
        score={score}
        onVenue={(home) => setMatch((m) => ({ ...m, home }))}
      />

      <nav className="tabs">
        <button
          className={screen === 'match' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('match')}
        >
          Match
        </button>
        <button
          className={screen === 'squad' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('squad')}
        >
          Spelers
        </button>
      </nav>

      {screen === 'match' ? (
        <>
          <section className="clockbar">
            <div className="periods">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  className={p === match.period ? 'per is-on' : 'per'}
                  onClick={() => setPeriod(p)}
                  aria-pressed={p === match.period}
                >
                  P{p}
                </button>
              ))}
            </div>
            <div className="clock">
              <span className="clock-num">{mmss(clock)}</span>
              <button className="btn" onClick={() => setRunning((r) => !r)}>
                {running ? 'Pauze' : 'Start'}
              </button>
              <button
                className="btn btn-quiet"
                onClick={() => {
                  setRunning(false)
                  setMatch((m) => {
                    const clocks = [...m.clocks]
                    clocks[m.period - 1] = 0
                    return { ...m, clocks }
                  })
                }}
              >
                Terug op nul
              </button>
            </div>
          </section>

          <HattrickBanner live={runs.live} players={match.players} />

          <h2 className="section-title">Wie scoorde?</h2>
          {match.players.length === 0 ? (
            <p className="empty">
              Nog geen spelers. Voeg ze toe bij <strong>Spelers</strong> en tik hier daarna
              op de naam van de scorer.
            </p>
          ) : (
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
                    {onARoll === 2 && <span className="streak">2 op rij</span>}
                    {goalsBy[p.id] > 0 && <span className="tally">{goalsBy[p.id]}</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="row">
            <button className="btn btn-wide" onClick={() => addGoal('us', null)}>
              Doelpunt zonder naam
            </button>
            <button className="btn btn-away btn-wide" onClick={() => addGoal('them')}>
              Tegendoelpunt
            </button>
          </div>

          <div className="row">
            <button className="btn btn-quiet" onClick={undo} disabled={!match.events.length}>
              Laatste ongedaan maken
            </button>
            <button className="btn btn-quiet" onClick={newMatch}>
              Nieuwe match
            </button>
          </div>

          <Timeline match={match} runs={runs} onRemove={removeEvent} />
        </>
      ) : (
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
      )}

      <footer className="foot">
        Alles blijft op dit toestel bewaard. 4 × 15 minuten, 5 tegen 5.
      </footer>
    </div>
  )
}

function HattrickBanner({ live, players }) {
  if (!live || live.len < 3) return null
  const name = players.find((p) => p.id === live.playerId)?.name ?? 'Onbekende speler'

  return (
    <p className="banner" role="status">
      <span className="banner-what">
        {live.len === 3 ? 'Hattrick' : `${live.len} op rij`}
      </span>
      <span className="banner-who">{name}</span>
    </p>
  )
}

function Scoreboard({ home, score, onVenue }) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: OPPONENT, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  return (
    <header className="board">
      <div className="board-row">
        <div className="side">
          <span className="team-name">{left.name}</span>
          <span className={left.ours ? 'goals goals-ours' : 'goals'}>{left.goals}</span>
        </div>
        <span className="dash" aria-hidden="true">
          –
        </span>
        <div className="side side-right">
          <span className="team-name">{right.name}</span>
          <span className={right.ours ? 'goals goals-ours' : 'goals'}>{right.goals}</span>
        </div>
      </div>

      <div className="venue">
        <span className="venue-label">{TEAM} speelt</span>
        <div className="venue-switch">
          <button
            className={home ? 'venue-btn is-on' : 'venue-btn'}
            onClick={() => onVenue(true)}
            aria-pressed={home}
          >
            thuis
          </button>
          <button
            className={home ? 'venue-btn' : 'venue-btn is-on'}
            onClick={() => onVenue(false)}
            aria-pressed={!home}
          >
            uit
          </button>
        </div>
      </div>
    </header>
  )
}

function Timeline({ match, runs, onRemove }) {
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

  return (
    <>
      <h2 className="section-title">Tijdslijn</h2>
      <ol className="timeline">
        {PERIODS.map((p) => {
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
                      {r.team === 'us' ? (r.name ?? 'Doelpunt') : OPPONENT}
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
    <section>
      <h2 className="section-title">Spelers</h2>
      <div className="row">
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
        <button className="btn btn-primary" onClick={submit}>
          Toevoegen
        </button>
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
                className="btn btn-quiet"
                onClick={() => onRemove(p.id)}
                aria-label={`${p.name} verwijderen`}
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
