// Het scherm Uitslagen: alle afgewerkte wedstrijden.
import { useState } from 'react'
import { resultOf, RESULT_LABELS, playedBy, shortDate } from './results.js'
import { Confirm } from './ui.jsx'
import { TrashIcon } from './icons.jsx'

export function History({ teams, history, onView, onDelete }) {
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
                  {/* Vaste kolom: het streepje staat in elke rij op dezelfde plek. */}
                  <span className="history-item-score">
                    <span className="history-item-goals">
                      <span className={h.left.ours ? 'is-ours' : ''}>{h.left.goals}</span>
                      <span className="history-item-dash">–</span>
                      <span className={h.right.ours ? 'is-ours' : ''}>{h.right.goals}</span>
                    </span>
                    {h.penalties && (
                      <span className="history-item-pens">
                        pen.{' '}
                        {h.left.ours
                          ? `${h.penalties.us.scored}–${h.penalties.them.scored}`
                          : `${h.penalties.them.scored}–${h.penalties.us.scored}`}
                      </span>
                    )}
                  </span>
                  <span className="history-item-info">
                    <span className="history-item-opponent">{h.theirName}</span>
                    <span className="history-item-meta">
                      <span className="age-chip">{h.ageGroup}</span>
                      <span>{h.left.ours ? 'Thuis' : 'Uit'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{shortDate(h)}</span>
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
