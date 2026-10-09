// Wat het toestel kan: gesproken meldingen, trillen, meldingen, het thema en het
// soort toestel (gsm, tablet, computer).
// Gesproken meldingen staan standaard aan; uitzetten kan in Instellingen.
export const SPEECH_KEY = 'scorebord-speech'

export function speechEnabled() {
  try {
    return localStorage.getItem(SPEECH_KEY) !== 'off'
  } catch {
    return true
  }
}

// Trillen staat ook standaard aan, los van de gesproken meldingen. iPhones
// ondersteunen trillen vanuit een webapp niet.
export const VIBRATE_KEY = 'scorebord-vibrate'

export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator

export function vibrationEnabled() {
  try {
    return localStorage.getItem(VIBRATE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function vibrate(pattern, { force = false } = {}) {
  if (!force && !vibrationEnabled()) return
  navigator.vibrate?.(pattern)
}

// Spreekt een korte melding uit via de spraak van het toestel (Nederlandse
// stem als die er is). Loopt enkel zolang de app op het scherm staat.
export function say(text, { force = false } = {}) {
  if (!force && !speechEnabled()) return
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'nl-BE'
  const voices = synth.getVoices()
  const voice =
    voices.find((v) => v.lang?.toLowerCase().replace('_', '-') === 'nl-be') ??
    voices.find((v) => v.lang?.toLowerCase().startsWith('nl'))
  if (voice) utterance.voice = voice
  synth.cancel()
  synth.speak(utterance)
}

// iOS laat spraak pas toe nadat ze één keer vanuit een tik gestart werd;
// daarom bij het starten van de klok een stille, lege uitspraak.
export function unlockSpeech() {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return
  const utterance = new SpeechSynthesisUtterance(' ')
  utterance.volume = 0
  synth.speak(utterance)
}

// Toont ook een gewone telefoonmelding, die Android doorstuurt naar een
// gekoppeld horloge. Enkel met toestemming, en via de service worker: Android
// Chrome kent geen losse `new Notification`.
export function notify(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  navigator.serviceWorker?.ready
    .then((registration) =>
      registration.showNotification(title, {
        body,
        tag: 'scorebord-alert',
        renotify: true,
        icon: `${import.meta.env.BASE_URL}icon-192.png`,
      }),
    )
    .catch(() => {})
}

// Toestemming kan enkel vanuit een tik gevraagd worden; we vragen het één
// keer, bij de start van de wedstrijd of van de klok.
export function askNotificationPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return
  try {
    Notification.requestPermission()?.catch?.(() => {})
  } catch {
    // oudere browsers zonder toestemmingsvraag: dan blijft het bij trillen en spraak
  }
}

// Thema apart bewaard, zodat index.html het al kan zetten vóór React start
// (geen flits van het verkeerde thema bij het openen).
export const THEME_KEY = 'scorebord-theme'

export const THEMES = ['auto', 'light', 'dark']

export function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return THEMES.includes(t) ? t : 'auto'
  } catch {
    return 'auto'
  }
}

// Soort toestel: een computer heeft een muis (fijne aanwijzer); bij een
// aanraakscherm beslist de kortste schermzijde tussen gsm en tablet.
export function deviceType() {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return 'pc'
  return Math.min(window.screen.width, window.screen.height) < 600 ? 'phone' : 'tablet'
}

// iOS geeft de bewegingssensor pas vrij na toestemming vanuit een tik.
export function askMotionPermission() {
  const ask = window.DeviceOrientationEvent?.requestPermission
  if (typeof ask === 'function') ask.call(window.DeviceOrientationEvent).catch(() => {})
}

// iPhone/iPad (ook een iPad die zich als Mac voordoet). Daar werkt
// downloaden vanuit de app slecht, dus gaat de back-up via het deelvenster.
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
