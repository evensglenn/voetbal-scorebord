import { useEffect, useMemo, useRef, useState } from 'react'
import { drawSummary, W as SHOT_W, H as SHOT_H } from './summary.js'
import { version as APP_VERSION } from '../package.json'

const STORAGE_KEY = 'matchblad.v1'
const PERIODS = [1, 2, 3, 4]
const PERIOD_SECONDS_BY_AGE = { U7: 10 * 60, U9: 15 * 60 }
const TEAM = 'Lummen United'
const OPPONENT = 'Tegenstander'

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

export default function App() {
  const [match, setMatch] = useState(load)
  const [running, setRunning] = useState(false)
  const [screen, setScreen] = useState('match')
  const [asking, setAsking] = useState(false)
  const [sharing, setSharing] = useState(false)
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
        clocks[m.period - 1] = Math.min(periodSecondsFor(m.ageGroup), clocks[m.period - 1] + 1)
        return { ...m, clocks }
      })
    }, 1000)
    return () => clearInterval(tick.current)
  }, [running])

  const clock = match.clocks[match.period - 1]
  const periodSeconds = periodSecondsFor(match.ageGroup)
  useEffect(() => {
    if (clock >= periodSeconds) setRunning(false)
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
      return { team: e.team, period: e.period, us, them }
    })

    const scorers = match.players
      .map((p) => ({
        name: p.name,
        goals: goalsBy[p.id] ?? 0,
        hattricks: runs.hattricks[p.id] ?? 0,
      }))
      .filter((s) => s.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name))

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
      left,
      right,
      events,
      scorers,
    }
  }, [match, score, goalsBy, runs, opponentName])

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
    setRunning(false)
    setMatch((m) => ({ ...m, events: [], period: 1, clocks: [0, 0, 0, 0] }))
    setScreen('match')
    setAsking(false)
  }

  return (
    <div className="shell">
      <Scoreboard
        home={match.home}
        score={score}
        opponentName={opponentName}
        ageGroup={match.ageGroup}
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
        <button
          className={screen === 'wedstrijd' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('wedstrijd')}
        >
          Wedstrijd
        </button>
      </nav>

      {screen === 'match' ? (
        <>
          <div className="pane pane-play">
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
      const canvas = document.createElement('canvas')
      canvas.width = SHOT_W
      canvas.height = SHOT_H
      drawSummary(canvas.getContext('2d'), data)
      canvas.toBlob((blob) => {
        if (stale) return
        if (!blob) {
          setFailed(true)
          return
        }
        setUrl(URL.createObjectURL(blob))
        setFile(new File([blob], 'matchblad.png', { type: 'image/png' }))
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
      await navigator.share({ files: [file], title: 'Matchblad' })
    } catch {
      // gedeeld venster weggeklikt: niets aan de hand
    }
  }

  const save = () => {
    const link = document.createElement('a')
    link.href = url
    link.download = `matchblad-${new Date().toISOString().slice(0, 10)}.png`
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

function Scoreboard({ home, score, opponentName, ageGroup }) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  return (
    <header className="board">
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
      <h2 className="section-title">Wedstrijd</h2>

      <div className="row">
        <input
          className="field"
          value={opponent}
          onChange={(e) => onOpponentChange(e.target.value)}
          placeholder={OPPONENT}
          aria-label="Naam tegenstander"
        />
      </div>

      <div className="choice-row">
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

      <p className="empty">
        De naam van de tegenstander verschijnt op het scorebord en in de samenvatting. De
        leeftijdscategorie bepaalt de duur van elke periode.
      </p>
    </section>
  )
}
