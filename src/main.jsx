import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Zorgt ervoor dat het matchblad ook opent als er langs het veld geen bereik is.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        // De browser checkt vanzelf af en toe op een nieuwe versie, maar wie de
        // app een hele match lang open laat staan, wacht anders te lang op dat
        // toeval — dus geven we het zelf af en toe een duwtje.
        setInterval(() => registration.update(), 60 * 60 * 1000)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') registration.update()
        })

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // 'installed' + een bestaande controller betekent dat dit een
            // update is voor een al geopende app, geen eerste installatie.
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('scorebord:update-available'))
            }
          })
        })
      })
      .catch(() => {
        // Geen service worker (bijvoorbeeld zonder https): de app werkt gewoon online.
      })
  })
}
