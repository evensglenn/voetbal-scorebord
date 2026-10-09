// Het scorebord bovenaan, het voetbalveld als achtergrond en de voortgang over de periodes.
import { useRef } from 'react'
import { TEAM } from './match.js'
import { ExpandIcon } from './icons.jsx'

// Veldtekening op ware verhoudingen (in meter, 105 × 68) als decor achter het
// scorebord en de startkaart. "slice" vult de breedte en snijdt boven en onder
// af, zodat de lijnen niet vervormen of meeschalen wanneer de kop krimpt.
// Staand (vertical) draait het veld een kwartslag voor hoge vlakken.
// Eén segment per periode: afgelopen periodes vol, de huidige loopt mee met
// de klok, de volgende nog leeg.
// Met labelled staat "Periode 2" boven het segment van de lopende periode
// (wedstrijdscherm); zonder enkel de balk (groot scorebord).
export function PeriodProgress({ count, period, progress, labelled = false }) {
  return (
    <div className={labelled ? 'period-progress is-labelled' : 'period-progress'} aria-hidden={!labelled}>
      {Array.from({ length: count }, (_, i) => i + 1).map((p) => {
        const fill = p < period ? 1 : p > period ? 0 : progress
        const seg = (
          <span key={p} className={p === period ? 'period-seg is-current' : 'period-seg'} aria-hidden="true">
            <span className="period-seg-fill" style={{ width: `${fill * 100}%` }} />
          </span>
        )
        if (!labelled) return seg
        return (
          <span key={p} className="period-col">
            <span className="period-label">{p === period ? `Periode ${p}` : ''}</span>
            {seg}
          </span>
        )
      })}
    </div>
  )
}

export function Pitch({ vertical = false }) {
  return (
    <svg
      className="pitch"
      viewBox={vertical ? '-3 -3 74 111' : '-3 -3 111 74'}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g transform={vertical ? 'translate(68 0) rotate(90)' : undefined}>
        <g className="pitch-lines">
          <rect x="0" y="0" width="105" height="68" />
          <path d="M52.5 0V68" />
          <circle cx="52.5" cy="34" r="9.15" />
          {/* Strafschopgebied, doelgebied, boog en doel — links en gespiegeld rechts. */}
          <path d="M0 13.84H16.5V54.16H0M0 24.84H5.5V43.16H0M16.5 26.69A9.15 9.15 0 0 1 16.5 41.31M0 30.34H-1.5V37.66H0" />
          <path d="M105 13.84H88.5V54.16H105M105 24.84H99.5V43.16H105M88.5 26.69A9.15 9.15 0 0 0 88.5 41.31M105 30.34H106.5V37.66H105" />
          <path d="M0 1A1 1 0 0 0 1 0M104 0A1 1 0 0 0 105 1M105 67A1 1 0 0 0 104 68M1 68A1 1 0 0 0 0 67" />
        </g>
        <g className="pitch-spots">
          <circle cx="52.5" cy="34" r="0.5" />
          <circle cx="11" cy="34" r="0.5" />
          <circle cx="94" cy="34" r="0.5" />
        </g>
      </g>
    </svg>
  )
}

export function Scoreboard({ started, home, score, opponentName, compact, onOpenBig }) {
  // Een cijfer "popt" enkel wanneer het verandert: door de key wordt het
  // element dan opnieuw aangemaakt, en enkel waarden die afwijken van de
  // stand bij het openen krijgen de animatie (dus niet bij elke tabwissel).
  const initial = useRef(score)
  const ours = { name: TEAM, goals: score.us, ours: true, pop: score.us !== initial.current.us }
  const theirs = {
    name: opponentName,
    goals: score.them,
    ours: false,
    pop: score.them !== initial.current.them,
  }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]

  if (!started) {
    return (
      <header className={compact ? 'board board-idle is-compact' : 'board board-idle'}>
        <Pitch />
        <div className="board-row board-row-idle">
          <h1 className="board-title">
            <span className="board-title-club">{TEAM}</span>
            <span className="board-title-sub">Scorebord</span>
          </h1>
        </div>
      </header>
    )
  }

  return (
    <header className={compact ? 'board is-compact' : 'board'}>
      <Pitch />
      {/* Klein, net onder de middencirkel van het veld: groot scorebord openen. */}
      {onOpenBig && (
        <button
          className="board-expand"
          onClick={onOpenBig}
          aria-label="Open groot scorebord"
          title="Groot scorebord"
        >
          <ExpandIcon />
        </button>
      )}
      <div className="board-row">
        <div className="side">
          <span className={left.ours ? 'team-name team-name-ours' : 'team-name'}>{left.name}</span>
          <span
            key={left.goals}
            className={['goals', left.ours && 'goals-ours', left.pop && 'is-pop'].filter(Boolean).join(' ')}
          >
            {left.goals}
          </span>
        </div>
        <div className="side">
          <span className={right.ours ? 'team-name team-name-ours' : 'team-name'}>{right.name}</span>
          <span
            key={right.goals}
            className={['goals', right.ours && 'goals-ours', right.pop && 'is-pop'].filter(Boolean).join(' ')}
          >
            {right.goals}
          </span>
        </div>
      </div>
    </header>
  )
}
