// Het startscherm zolang er geen wedstrijd bezig is.
import { TEAM, CLUB_LOGO, AGE_CONFIG, FORMAT_LABELS } from './match.js'
import { Pitch } from './Scoreboard.jsx'

// Startscherm zolang er geen wedstrijd bezig is: titel, ploeg en een
// duidelijke aftrapknop in één vlak.
export function Home({ team, onStart, onOpenSquad }) {
  const cfg = AGE_CONFIG[team.ageGroup] ?? AGE_CONFIG.U9

  return (
    <div className="pane pane-play pane-home">
      <section className="home-hero">
        <Pitch vertical />
        <h1 className="board-title">
          <span className="board-title-club">{TEAM}</span>
          <span className="board-title-sub">Scorebord</span>
        </h1>
        <img className="home-hero-logo" src={CLUB_LOGO} alt="" />
        <h2 className="home-hero-title">
          <span className="home-hero-ball" aria-hidden="true">
            ⚽
          </span>
          Klaar voor de aftrap?
        </h2>
        <div className="home-hero-meta">
          <span className="age-chip">{team.ageGroup}</span>
          <span>{FORMAT_LABELS[cfg.format] ?? cfg.format}</span>
          <span aria-hidden="true">·</span>
          <span>
            {team.periodsCount} × {team.periodMinutes}'
          </span>
        </div>
        <p className="home-hero-sub">
          {team.players.length === 0
            ? 'Nog geen spelers in deze ploeg.'
            : `${team.players.length} ${team.players.length === 1 ? 'speler' : 'spelers'} in de kern`}
        </p>
        <button className="btn btn-start-hero" onClick={onStart}>
          Start nieuwe wedstrijd
        </button>
        {team.players.length === 0 && (
          <button className="home-hero-link" onClick={onOpenSquad}>
            Voeg eerst spelers toe →
          </button>
        )}
      </section>
    </div>
  )
}
