// Een nieuwe wedstrijd starten en de wisselmelding instellen.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  TEAM,
  OPPONENT,
  AGE_CONFIG,
  FORMAT_LABELS,
  FORMAT_RULES_URL,
  teamsLabel,
  mmss,
} from './match.js'
import { useDialog, NumberSelect } from './ui.jsx'
import { InfoIcon } from './icons.jsx'

// Keuze voor de wisselmelding: uit, halverwege elke periode, of om de zoveel
// minuten. Gebruikt bij de start van een match en tijdens de match.
export function SubChoice({ subMinutes, periodMinutes, onChange }) {
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

export function SubSettings({ subMinutes, periodMinutes, onSave, onCancel }) {
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

export function StartStep({ num, children, aside }) {
  return (
    <div className="start-step">
      <span className="start-step-num">{num}</span>
      <span className="start-step-label">{children}</span>
      {aside}
    </div>
  )
}

export function StartMatch({ teams, defaultTeamId, onStart, onCancel }) {
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
              <p className="start-note">Voeg eerst spelers toe bij {teamsLabel(teams)}.</p>
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
