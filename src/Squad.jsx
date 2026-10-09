// Ploegen en spelers beheren.
import { useState } from 'react'
import { AGE_CONFIG, AGE_ORDER, FORMAT_LABELS, teamsLabel } from './match.js'
import { Confirm } from './ui.jsx'
import { PlusIcon, TrashIcon } from './icons.jsx'

export function AgeOptions() {
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

export function Squad({
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
      <h2 className="section-title">{teamsLabel(teams)}</h2>

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
