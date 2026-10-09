// Hoeveel plaats de app-staat inneemt in het account. Firestore bewaart een
// document tot 1 MiB; met wat marge voor de andere velden ligt de grens op
// 1 MB. Gemeten in bytes (UTF-8), zoals Firestore telt: een naam met accenten
// weegt dus iets zwaarder dan het aantal letters.
export const MAX_STATE_BYTES = 1_000_000
const WARN_AT = 0.75
const FULL_AT = 0.9
// Schatting per wedstrijd zolang er nog te weinig gespeeld is om te meten.
const DEFAULT_MATCH_BYTES = 2000

const encoder = new TextEncoder()
export const jsonBytes = (json) => encoder.encode(json).length
export const stateBytes = (state) => jsonBytes(JSON.stringify(state))

// 'ok', 'warn' (tijd om op te ruimen) of 'full' (bijna of helemaal vol).
export function storageLevel(bytes) {
  if (bytes >= MAX_STATE_BYTES * FULL_AT) return 'full'
  if (bytes >= MAX_STATE_BYTES * WARN_AT) return 'warn'
  return 'ok'
}

// Een typische wedstrijd (de mediaan), zodat één uitzonderlijk grote de
// schatting niet scheeftrekt.
function typicalMatchBytes(history) {
  if (history.length < 3) return DEFAULT_MATCH_BYTES
  const sizes = history.map(stateBytes).sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)]
}

export function storageUsage(state) {
  const bytes = stateBytes(state)
  const perMatch = typicalMatchBytes(state.history)
  return {
    bytes,
    share: Math.min(1, bytes / MAX_STATE_BYTES),
    level: storageLevel(bytes),
    matchesLeft: Math.max(0, Math.floor((MAX_STATE_BYTES - bytes) / perMatch)),
  }
}

// "4%", of "minder dan 1%" voor een account dat nog bijna leeg is.
export const formatShare = (share) =>
  share < 0.005 ? 'minder dan 1%' : `${Math.round(share * 100)}%`
