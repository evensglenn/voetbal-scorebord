// Het venster met de samenvatting als afbeelding (getekend door summary.js), om te delen of te bewaren.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { drawSummary, loadClubLogo, heightFor, W as SHOT_W } from './summary.js'
import { useDialog } from './ui.jsx'

export function Summary({ data, onClose }) {
  const panel = useRef(null)
  const { cancel: close, overlayClass } = useDialog(panel, onClose)
  const [url, setUrl] = useState(null)
  const [file, setFile] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let stale = false

    const make = async () => {
      try {
        await document.fonts?.ready
      } catch {
        // zonder het webfont tekent het canvas met de systeemletter
      }
      const logo = await loadClubLogo()
      const canvas = document.createElement('canvas')
      canvas.width = SHOT_W
      canvas.height = heightFor(data)
      drawSummary(canvas.getContext('2d'), data, logo)
      canvas.toBlob((blob) => {
        if (stale) return
        if (!blob) {
          setFailed(true)
          return
        }
        setUrl(URL.createObjectURL(blob))
        setFile(new File([blob], 'scorebord.png', { type: 'image/png' }))
      }, 'image/png')
    }

    make()
    return () => {
      stale = true
    }
  }, [data])

  useEffect(() => () => url && URL.revokeObjectURL(url), [url])

  const canShare = file && navigator.canShare?.({ files: [file] })

  const share = async () => {
    try {
      await navigator.share({ files: [file], title: 'Scorebord' })
    } catch {
      // gedeeld venster weggeklikt: niets aan de hand
    }
  }

  const save = () => {
    const link = document.createElement('a')
    link.href = url
    link.download = `scorebord-${new Date().toISOString().slice(0, 10)}.png`
    link.click()
  }

  // Rechtstreeks in <body>, zodat een geanimeerde ouder (transform) het
  // venster niet kan insluiten of onder de tabbalk kan duwen.
  return createPortal(
    <div className={overlayClass} onClick={close}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Samenvatting van de match"
        tabIndex={-1}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        {failed ? (
          <p>De afbeelding kon niet gemaakt worden. Probeer het opnieuw.</p>
        ) : url ? (
          <img className="shot" src={url} alt="Samenvatting van de match" />
        ) : (
          <p>De samenvatting wordt getekend…</p>
        )}

        <div className="dialog-actions">
          <button className="btn" onClick={close}>
            Sluit
          </button>
          {url && !canShare && (
            <button className="btn btn-primary" onClick={save}>
              Bewaar
            </button>
          )}
          {canShare && (
            <button className="btn btn-primary" onClick={share}>
              Deel
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
