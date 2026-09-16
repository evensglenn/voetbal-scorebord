// Houdt de app bruikbaar aan de zijlijn, ook als het netwerk daar niets waard is.
// Pagina's: eerst het netwerk, met de cache als vangnet.
// Bestanden (js, css, iconen, fonts): eerst de cache, want hun naam bevat een hash.

const CACHE = 'matchblad-v1'

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

  if (request.mode === 'navigate') {
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
