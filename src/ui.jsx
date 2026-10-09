// Gedeelde bouwstenen: in- en uitschuiven (Presence), dialogen, schakelaars en keuzelijsten.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Gedrag van een venster: focus erin bij openen, Escape sluit, Tab blijft
// binnen het venster, en de pagina erachter scrolt niet mee.
export const LEAVE_MS = 150

// Houdt een melding nog even in beeld nadat ze verdwijnt, zodat ze kan
// uitvagen in plaats van weg te springen. Toont tijdens het uitvagen de
// laatst zichtbare inhoud.
export function Presence({ show, children }) {
  const [mounted, setMounted] = useState(show)
  const last = useRef(children)
  if (show) last.current = children

  useEffect(() => {
    if (show) {
      setMounted(true)
      return
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setMounted(false)
      return
    }
    const t = setTimeout(() => setMounted(false), LEAVE_MS)
    return () => clearTimeout(t)
  }, [show])

  if (!show && !mounted) return null
  return <div className={show ? 'presence' : 'presence is-leaving'}>{last.current}</div>
}

export function useModal(panel, onClose) {
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = panel.current?.querySelectorAll('button, input, select, a[href]') ?? []
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
  }, [panel, onClose])
}

// Laat een venster eerst uitvagen voor het echt sluit: de ouder haalt het pas
// weg (via onCancel of de gekozen actie) nadat de animatie gelopen heeft.
// Met "Beperk beweging" sluit het meteen.
export function useDialog(panel, onCancel) {
  const [leaving, setLeaving] = useState(false)
  const busy = useRef(false)
  const latestCancel = useRef(onCancel)
  latestCancel.current = onCancel

  const leave = useCallback((action) => {
    if (busy.current) return
    busy.current = true
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      action()
      return
    }
    setLeaving(true)
    setTimeout(action, LEAVE_MS)
  }, [])
  // Stabiel, zodat useModal niet bij elke render opnieuw de focus pakt.
  const cancel = useCallback(() => leave(() => latestCancel.current()), [leave])

  useModal(panel, cancel)
  return { leaving, leave, cancel, overlayClass: leaving ? 'overlay is-leaving' : 'overlay' }
}

export function Confirm({ title, body, confirmLabel, cancelLabel = 'Nee', danger, onConfirm, onCancel }) {
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
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={cancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => leave(onConfirm)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function SwitchRow({ checked, onChange, label, sub, className, disabled }) {
  return (
    <button
      className={className ? `switch-row ${className}` : 'switch-row'}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-text">
        <span>{label}</span>
        {sub && <span className="switch-sub">{sub}</span>}
      </span>
      <span className={checked ? 'switch is-on' : 'switch'} aria-hidden="true" />
    </button>
  )
}

// Keuzelijst voor een getal: op een gsm opent dat het scrollwiel of de
// scrollbare lijst van het toestel, in plaats van een toetsenbord.
export function NumberSelect({ value, min, max, onChange, ...props }) {
  return (
    <select
      {...props}
      className="field"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}
