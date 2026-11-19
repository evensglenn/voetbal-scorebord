// Het Scorebord stopt. Deze service worker zorgt dat zoveel mogelijk
// toestellen het afscheidsscherm krijgen en de oude app niet meer bruikbaar is:
// - bij installeren gaat het afscheidsscherm (de pagina en zijn gehashte
//   bestanden) meteen in de cache, zodat het ook zonder bereik opent;
// - bij activeren worden de oude caches gewist en elk open venster van de app
//   opnieuw geladen, ook een oude versie die nog openstond (en waarvan de
//   melding "nieuwe versie" weggeklikt kon worden).
// Pagina's komen verder eerst van het netwerk, met de cache als vangnet.

const CACHE = 'scorebord-v0.93.0'

// De bestanden onder /assets/ die de pagina laadt (script en stijlen).
const assetsOf = (html) =>
  [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1])

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        const response = await fetch('./', { cache: 'no-cache' })
        if (!response.ok) return
        const html = await response.clone().text()
        await cache.put('./', response)
        await cache.addAll(assetsOf(html))
      })
      // Mislukt het vooraf bewaren, dan gaat de installatie toch door: online
      // komt het afscheidsscherm dan gewoon van het netwerk.
      .catch(() => {}),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const old = keys.filter((k) => k !== CACHE)
      await Promise.all(old.map((k) => caches.delete(k)))
      await self.clients.claim()
      // Stond er een oudere versie op dit toestel, dan elk open venster
      // opnieuw laden, zodat ook een oude app die nog openstond meteen het
      // afscheidsscherm toont. Niet afwachten: het herladen heeft deze
      // service worker nodig, en die is pas klaar als activeren gedaan is.
      if (old.length) {
        self.clients
          .matchAll({ type: 'window' })
          .then((windows) => windows.forEach((client) => client.navigate(client.url).catch(() => {})))
      }
    }),
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
