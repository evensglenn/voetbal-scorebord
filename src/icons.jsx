// Alle iconen van de app, als kleine SVG-componenten.
export function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 4.5 L16 10 L6 15.5 Z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="5" y="4" width="4" height="12" rx="1" fill="currentColor" />
      <rect x="11" y="4" width="4" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

// Voetbal met een groen vinkje: strafschop gescoord. De ⚽ van het toestel
// zelf is op dit formaat het best herkenbaar.
export function BallScoredIcon() {
  return (
    <span className="ball-scored" aria-hidden="true">
      <span className="ball-scored-ball">⚽</span>
      <span className="ball-scored-check">✓</span>
    </span>
  )
}

export function FlagIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M5 17.5V3m0 1h9l-2 3.25L14 10.5H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SwapIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M4 7h11m-3-3 3 3-3 3M16 13H5m3-3-3 3 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M15.5 10a5.5 5.5 0 1 1-1.66-3.94"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M15.5 4.5v3.5h-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M7 4 L3 8 L7 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8h8a5 5 0 0 1 0 10h-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M10 4v12M4 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Twee pijltjes naar buiten: linksonder en rechtsboven.
export function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M14 3h7v7M21 3l-7 7M10 21H3v-7M3 21l7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M5.5 5.5l9 9M14.5 5.5l-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        d="M4 6h12M8 6V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M5.5 6l.6 9.2a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AutoThemeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="2.8" y="3.8" width="14.4" height="9.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 16.8h6M10 13.6v3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M16.2 12.2A6.6 6.6 0 0 1 7.8 3.8a6.6 6.6 0 1 0 8.4 8.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function BallIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7l4.76 3.45-1.76 5.55H9l-1.76-5.55z" />
        <path d="M12 7V3M15 16l2.5 3M16.76 10.45l3.74-1.45M9 16l-2.5 3M7.24 10.45L3.5 9" />
      </g>
    </svg>
  )
}

export function LiveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle className="live-dot" cx="12" cy="12" r="3" fill="currentColor" />
      <path className="live-waves" d="M6.7 6.7a7.5 7.5 0 0 0 0 10.6M17.3 6.7a7.5 7.5 0 0 1 0 10.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function TeamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.4-3.4 2.3-5.2 5.5-5.2s5.1 1.8 5.5 5.2M14.2 14.5c.8-.5 1.7-.7 2.8-.7 2.2 0 3.5 1.2 3.8 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3.5 4.5v3.5H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M5 19.5V13M10 19.5V5M15 19.5V10M20 19.5V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.3" r="1.15" fill="currentColor" />
      <rect x="8.9" y="8.9" width="2.2" height="6" rx="1.1" fill="currentColor" />
    </svg>
  )
}
