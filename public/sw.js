// Houdt de app bruikbaar aan de zijlijn, ook als het netwerk daar niets waard is.
// Pagina's en onveranderlijk-benoemde bestanden (manifest, iconen, favicon):
// eerst het netwerk, met de cache als vangnet — zo komen naamswijzigingen (zoals
// het manifest) altijd door. Enkel de gehashte build-bestanden onder /assets/
// (hun naam verandert zodra de inhoud verandert) mogen veilig eerst uit de cache.

const CACHE = 'scorebord-v0.92.0'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const store = (request, response) => {
  const copy = response.clone()
  caches.open(CACHE).then((cache) => cache.put(request, copy))
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  // Enkel de app zelf; Firebase (inloggen, online opslag) en andere domeinen
  // gaan rechtstreeks naar het netwerk. Een open Firestore-verbinding mag
  // zeker niet in de cache belanden.
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isHashedAsset = url.pathname.includes('/assets/')

  if (!isHashedAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => store(request, response))
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request)
          .then((response) => store(request, response))
          .catch(() => hit),
    ),
  )
})

// Tik op een melding (ook vanop het horloge): breng de app weer naar voren.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => 'focus' in client)
      return open ? open.focus() : self.clients.openWindow(self.registration.scope)
    }),
  )
})
