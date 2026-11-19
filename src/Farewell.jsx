// Het Scorebord stopt. Deze versie toont enkel nog dit afscheidsscherm. Er
// wordt niet meer ingelogd of gesynchroniseerd: App (en daarmee Firebase)
// wordt niet meer geladen. Bewust zonder clubnaam of -logo. De rest van de
// code blijft staan, zodat terugdraaien eenvoudig is.
import { Pitch } from './Scoreboard.jsx'

export default function Farewell() {
  return (
    <div className="shell is-home">
      <div className="pane pane-play pane-home">
        <section className="home-hero home-hero-login home-hero-farewell">
          <Pitch vertical />
          <h1 className="board-title">
            <span className="board-title-sub">Scorebord</span>
          </h1>
          <p className="home-hero-sub">
            Deze app werkt niet meer.
            <br />
            Je mag de app van je toestel verwijderen.
          </p>
        </section>
      </div>
    </div>
  )
}
