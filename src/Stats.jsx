// Het scherm Statistieken, met de getallen die optellen zodra ze in beeld komen.
import { useEffect, useRef, useState } from 'react'
import { reducedMotion } from './device.js'
import { RESULT_LABELS, playedBy, teamStats, scoreLine } from './results.js'

export const COUNT_MS = 700

// Iets pas "in beeld" noemen als het boven de tabbalk onderaan uitkomt.
export const REVEAL_MARGIN = '0px 0px -12% 0px'

export const canObserve = () => 'IntersectionObserver' in window && !reducedMotion()

// Wordt true zodra het element voor het eerst in beeld komt, en blijft dat.
// Zonder IntersectionObserver of met "Beperk beweging" meteen true.
export function useSeen(ref) {
  const [seen, setSeen] = useState(() => !canObserve())

  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true)
      },
      { rootMargin: REVEAL_MARGIN },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen, ref])

  return seen
}

// Laat de animaties van tegels en kaarten pas lopen als ze in beeld komen:
// tot dan staan ze in de CSS gepauzeerd (zie [data-seen] in styles.css).
// Draait na elke render, zodat ook opnieuw opgebouwde lijsten (andere ploeg,
// sortering of weergave) meedoen.
export function useRevealOnScroll(root) {
  useEffect(() => {
    const els = root.current?.querySelectorAll(
      '.stat-tiles:not([data-seen]), .stat-card:not([data-seen])',
    )
    if (!els?.length) return
    if (!canObserve()) {
      els.forEach((el) => (el.dataset.seen = ''))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          e.target.dataset.seen = ''
          io.unobserve(e.target)
        }
      },
      { rootMargin: REVEAL_MARGIN },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  })
}

// Telt een cijfer op vanaf nul (of vanaf de vorige waarde als het verandert),
// snel in het begin en rustig uitbollend, zodra het in beeld komt. Met
// "Beperk beweging" staat het meteen op de eindwaarde.
export function CountUp({ value, decimals = 0 }) {
  const el = useRef(null)
  const seen = useSeen(el)
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0))
  const from = useRef(shown)

  useEffect(() => {
    if (!seen) return
    if (reducedMotion()) {
      from.current = value
      setShown(value)
      return
    }
    const begin = from.current
    const start = performance.now()
    let frame
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      const v = begin + (value - begin) * (1 - (1 - t) ** 3)
      from.current = v
      setShown(v)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, seen])

  // Math.round(-0,4) geeft -0; String() maakt daar gewoon "0" van.
  return (
    <span ref={el}>
      {String(decimals ? shown.toFixed(decimals) : Math.round(shown)).replace('.', ',')}
    </span>
  )
}

export function Stats({ teams, history, defaultTeamId }) {
  const [teamId, setTeamId] = useState(defaultTeamId)
  const [penaltySort, setPenaltySort] = useState('scored')
  const [goalsView, setGoalsView] = useState('total')
  const pane = useRef(null)
  useRevealOnScroll(pane)
  const team = teams.find((t) => t.id === teamId) ?? teams[0]
  const played = playedBy(team, history)
  const st = teamStats(played)
  // Doelpunten als totaal of als gemiddelde per wedstrijd (één decimaal).
  const goals = (v) =>
    goalsView === 'avg' ? <CountUp value={v / n} decimals={1} /> : <CountUp value={v} />
  const shootoutCount = st.shootouts.won + st.shootouts.drawn + st.shootouts.lost
  const rate = (p) => p.scored / p.total
  const takers = [...st.takers].sort((a, b) =>
    penaltySort === 'rate'
      ? rate(b) - rate(a) || b.scored - a.scored || a.name.localeCompare(b.name)
      : b.scored - a.scored || rate(b) - rate(a) || a.name.localeCompare(b.name),
  )
  const n = played.length
  // De balk achter elke schutter is relatief tegenover de topschutter.
  const topGoals = Math.max(1, ...st.scorers.map((p) => p.goals))

  return (
    <section className="pane-stats" ref={pane}>
      <h2 className="section-title">Statistieken</h2>
      {/* Ploegkeuze enkel als er iets te kiezen valt, net als bij Uitslagen. */}
      {teams.length > 1 && (
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
      )}

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
                <strong><CountUp value={n} /></strong>
                <span>{n === 1 ? 'wedstrijd' : 'wedstrijden'}</span>
              </div>
              <div className="stat-tile is-w">
                <strong><CountUp value={st.record.W} /></strong>
                <span>gewonnen</span>
              </div>
              <div className="stat-tile is-g">
                <strong><CountUp value={st.record.G} /></strong>
                <span>gelijk</span>
              </div>
              <div className="stat-tile is-v">
                <strong><CountUp value={st.record.V} /></strong>
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
                  <li key={p.name} style={{ '--share': p.goals / topGoals }}>
                    <span className="stat-rank-pos">{i + 1}</span>
                    <span className="stat-rank-name">
                      {p.name}
                      <small>
                        {p.matches} {p.matches === 1 ? 'wedstrijd' : 'wedstrijden'} gescoord
                        {p.hattricks > 0 &&
                          ` · ${p.hattricks} ${p.hattricks === 1 ? 'hattrick' : 'hattricks'}`}
                      </small>
                    </span>
                    <span className="stat-rank-value">
                      <CountUp value={p.goals} />
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {st.takers.length > 0 && (
              <>
                <h2 className="section-title">Strafschoppen</h2>
                <div className="stat-tiles">
                  <div className="stat-tile">
                    <strong><CountUp value={shootoutCount} /></strong>
                    <span>{shootoutCount === 1 ? 'reeks' : 'reeksen'}</span>
                  </div>
                  <div className="stat-tile is-w">
                    <strong><CountUp value={st.shootouts.won} /></strong>
                    <span>gewonnen</span>
                  </div>
                  <div className="stat-tile is-g">
                    <strong><CountUp value={st.shootouts.drawn} /></strong>
                    <span>gelijk</span>
                  </div>
                  <div className="stat-tile is-v">
                    <strong><CountUp value={st.shootouts.lost} /></strong>
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
                    <li key={p.name} style={{ '--share': rate(p) }}>
                      <span className="stat-rank-pos">{i + 1}</span>
                      <span className="stat-rank-name">
                        {p.name}
                        <small>{Math.round((p.scored / p.total) * 100)}% raak</small>
                      </span>
                      <span className="stat-rank-value">
                        <CountUp value={p.scored} />
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
