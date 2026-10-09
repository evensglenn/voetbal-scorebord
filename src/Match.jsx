// Onderdelen van het wedstrijdscherm: hattrickmelding, tijdslijn, laatste actie en strafschoppen.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TEAM, mmss } from './match.js'
import { useDialog, Confirm } from './ui.jsx'
import { BallScoredIcon, UndoIcon, TrashIcon } from './icons.jsx'

export function HattrickBanner({ live, players }) {
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

export function Timeline({ match, runs, opponentName, onRemove }) {
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

export function LastAction({ match, score, opponentName, onUndo }) {
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
export function PenaltyResult({ name, onPick, onCancel }) {
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

export function Penalties({ onEnd, open, penalties, players, opponentName, onAdd, onRemove }) {
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
