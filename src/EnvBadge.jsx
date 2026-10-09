// Blokje bovenaan zodra de app lokaal draait, zodat het altijd duidelijk is
// of je met testdata of met je echte account bezig bent. De gepubliceerde
// app (npm run build) toont niets.
export default function EnvBadge() {
  if (!import.meta.env.DEV) return null
  const emulators = import.meta.env.VITE_USE_EMULATORS === 'true'
  return (
    <div className={emulators ? 'env-badge' : 'env-badge is-real'} role="note">
      {emulators ? 'Lokaal · testdata' : 'Lokaal · echte gegevens'}
    </div>
  )
}
