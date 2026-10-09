// Het grote scorebord in horizontale modus, met de digitale klok.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { TEAM } from './match.js'
import { FlagIcon, SwapIcon, CloseIcon } from './icons.jsx'
import { PeriodProgress, Pitch } from './Scoreboard.jsx'

// Digitale klok met zeven segmenten per cijfer, zoals op een echt scorebord.
// Niet-brandende segmenten blijven vaag zichtbaar; een lege voorloopplaats
// (bv. " 6:00") toont enkel die vage segmenten.
export const SEGMENTS = {
  a: [7, 5, 53, 5, 'h'],
  b: [55, 7, 55, 48, 'v'],
  c: [55, 52, 55, 93, 'v'],
  d: [7, 95, 53, 95, 'h'],
  e: [5, 52, 5, 93, 'v'],
  f: [5, 7, 5, 48, 'v'],
  g: [7, 50, 53, 50, 'h'],
}

export const DIGIT_SEGMENTS = [
  'abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg',
]

export function segmentPoints([x1, y1, x2, y2, dir]) {
  const t = 5 // halve dikte
  return dir === 'h'
    ? `${x1},${y1} ${x1 + t},${y1 - t} ${x2 - t},${y2 - t} ${x2},${y2} ${x2 - t},${y2 + t} ${x1 + t},${y1 + t}`
    : `${x1},${y1} ${x1 + t},${y1 + t} ${x2 + t},${y2 - t} ${x2},${y2} ${x2 - t},${y2 - t} ${x1 - t},${y1 + t}`
}

export function SegmentDigit({ char }) {
  const lit = /\d/.test(char) ? DIGIT_SEGMENTS[Number(char)] : ''
  return (
    <svg className="seg-digit" viewBox="-2 -2 64 104" aria-hidden="true" focusable="false">
      {Object.entries(SEGMENTS).map(([name, seg]) => (
        <polygon
          key={name}
          className={lit.includes(name) ? 'seg is-on' : 'seg'}
          points={segmentPoints(seg)}
        />
      ))}
    </svg>
  )
}

// colonOn komt van de klok zelf (aan in de eerste helft van elke seconde),
// zodat alle dubbelpunten samen en in de maat van de seconden knipperen.
export function SegmentClock({ time, pad = true, colonOn = true }) {
  const [min, sec] = time.split(':')
  const chars = `${pad ? min.padStart(2, ' ') : min}:${sec}`
  return (
    <span className="seg-clock" role="img" aria-label={time}>
      {[...chars].map((c, i) =>
        c === ':' ? (
          <svg key={i} className="seg-colon" viewBox="0 0 20 104" aria-hidden="true" focusable="false">
            <circle className={colonOn ? 'seg is-on' : 'seg'} cx="10" cy="32" r="5.5" />
            <circle className={colonOn ? 'seg is-on' : 'seg'} cx="10" cy="70" r="5.5" />
          </svg>
        ) : (
          <SegmentDigit key={i} char={c} />
        ),
      )}
    </span>
  )
}

// Of automatisch draaien uit staat, kan een webapp niet uitlezen. We raden
// het: houdt iemand de gsm een moment dwars (bewegingssensor) terwijl het
// scherm rechtop blijft, dan draait het scherm dus niet mee. Draait het
// scherm wel naar liggend, dan staat draaien aan.
export function useAutoRotateOff(active, holdRef) {
  const [off, setOff] = useState(false)
  useEffect(() => {
    if (!active) return
    const portrait = window.matchMedia('(orientation: portrait)')
    let since = null
    const onTilt = (e) => {
      if (e.beta == null || e.gamma == null) return
      const sideways = Math.abs(e.gamma) > 50 && Math.abs(e.beta) < 40
      if (!sideways || !portrait.matches) {
        since = null
        return
      }
      since ??= Date.now()
      if (Date.now() - since > 800) setOff(true)
    }
    const onTurn = () => {
      // Zelf liggend gezet (groot scorebord) telt niet als automatisch draaien.
      if (!portrait.matches && !holdRef.current) setOff(false)
    }
    window.addEventListener('deviceorientation', onTilt)
    portrait.addEventListener?.('change', onTurn)
    return () => {
      window.removeEventListener('deviceorientation', onTilt)
      portrait.removeEventListener?.('change', onTurn)
    }
  }, [active, holdRef])
  return off
}

// Groot scorebord om aan de zijlijn te tonen: verschijnt enkel wanneer de
// gsm tijdens een wedstrijd gekanteld wordt (zie de media query in de CSS).
export function BigBoard({
  home,
  score,
  opponentName,
  period,
  clock,
  extra,
  running,
  finished,
  penalties,
  periodsCount,
  periodProgress,
  notice,
  onDismissSub,
  onStartClock,
  colonOn,
  open,
  rotated,
  onClose,
}) {
  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = home ? [ours, theirs] : [theirs, ours]
  const pens = {
    us: penalties.filter((p) => p.team === 'us' && p.scored).length,
    them: penalties.filter((p) => p.team === 'them' && p.scored).length,
  }
  const [penLeft, penRight] = home ? [pens.us, pens.them] : [pens.them, pens.us]

  return createPortal(
    <div className={['bigboard', open && 'is-open', rotated && 'is-rotated'].filter(Boolean).join(' ')}>
      {open && (
        <button className="bigboard-close" onClick={onClose} aria-label="Sluit groot scorebord">
          <CloseIcon />
        </button>
      )}
      <Pitch />
      <div className="bigboard-row">
        {[left, right].map((side, i) => (
          <div key={i} className="bigboard-side">
            <span className={side.ours ? 'bigboard-name is-ours' : 'bigboard-name'}>
              {side.name}
            </span>
            <span className={side.ours ? 'bigboard-goals is-ours' : 'bigboard-goals'}>
              {side.goals}
            </span>
          </div>
        ))}
        {/* Tussen de scores: een wissel- of eindemelding, anders niets. */}
        {notice?.kind === 'now' ? (
          <button
            key="now"
            className="bigboard-notice is-now"
            onClick={onDismissSub}
            aria-label="Verberg wisselmelding"
          >
            <SwapIcon />
            <strong>Wisselen!</strong>
          </button>
        ) : notice?.kind === 'soon' ? (
          <div key="soon" className="bigboard-notice" role="status">
            <span>Wissel over</span>
            <strong>{notice.seconds}s</strong>
          </div>
        ) : notice?.kind === 'over' ? (
          <div key="over" className="bigboard-notice is-over" role="status">
            <FlagIcon />
            <strong>{notice.text}</strong>
          </div>
        ) : null}
      </div>
      <div className="bigboard-meta">
        {penalties.length > 0 ? (
          <span>
            Strafschoppen {penLeft}–{penRight}
          </span>
        ) : finished ? (
          <span>Einde wedstrijd</span>
        ) : (
          // Tik op de stilstaande klok om te starten; stoppen kan hier niet,
          // zodat niemand de klok per ongeluk stillegt.
          <button
            className={running ? 'bigboard-clock is-running' : 'bigboard-clock'}
            onClick={onStartClock ?? undefined}
            disabled={!onStartClock}
            aria-label={onStartClock ? 'Start de klok' : undefined}
          >
            <SegmentClock time={clock} colonOn={colonOn} />
            {extra && (
              <span className="bigboard-extra">
                <span className="bigboard-extra-plus">+</span>
                <SegmentClock time={extra} pad={false} colonOn={colonOn} />
              </span>
            )}
          </button>
        )}
      </div>
      <div className="bigboard-progress">
        <PeriodProgress count={periodsCount} period={period} progress={periodProgress} />
      </div>
    </div>,
    document.body,
  )
}
