// Het scherm Instellingen, met het back-upbestand (exporteren en terugzetten).
import { useRef, useState } from 'react'
import { version as APP_VERSION } from '../package.json'
import { TEAM, fromStored } from './match.js'
import { canVibrate, isIOS } from './device.js'
import { Confirm, SwitchRow } from './ui.jsx'
import { SunIcon, AutoThemeIcon, MoonIcon } from './icons.jsx'
import { Account, CloudBackups } from './Account.jsx'

export function Settings({
  theme,
  onTheme,
  state,
  cloud,
  storage,
  restoreBlocked,
  onRestore,
  speech,
  onSpeech,
  vibration,
  onVibration,
}) {
  return (
    <section className="pane-settings">
      <h2 className="section-title">Weergave</h2>
      <div className="panel-card">
        <div className="theme-seg" role="group" aria-label="Thema">
          {THEME_OPTIONS.map(({ value, short, Icon }) => (
            <button
              key={value}
              className={value === theme ? 'per is-on' : 'per'}
              onClick={() => onTheme(value)}
              aria-pressed={value === theme}
            >
              <Icon />
              {short}
            </button>
          ))}
        </div>
        <p className="backup-note">
          {theme === 'auto'
            ? 'Volgt de instelling van je toestel.'
            : theme === 'dark'
              ? 'Altijd donker, ook als je toestel licht staat.'
              : 'Altijd licht, ook als je toestel donker staat.'}
        </p>
      </div>

      <h2 className="section-title">Meldingen</h2>
      <div className="panel-card">
        <SwitchRow
          checked={speech}
          onChange={onSpeech}
          label="Gesproken meldingen"
          sub="De app zegt hardop wanneer er gewisseld moet worden en wanneer een periode voorbij is."
        />
        <SwitchRow
          className="switch-row-split"
          checked={canVibrate() && vibration}
          onChange={onVibration}
          disabled={!canVibrate()}
          label="Trillen"
          sub={
            canVibrate()
              ? 'De gsm trilt bij elke wisselmelding en op het einde van een periode.'
              : 'Dit toestel kan niet trillen vanuit de app (bv. iPhone).'
          }
        />
      </div>

      {cloud.available && (
        <>
          <h2 className="section-title">Account</h2>
          <Account cloud={cloud} storage={storage} />
        </>
      )}

      <h2 className="section-title">Back-up</h2>
      {cloud.available && <CloudBackups cloud={cloud} restoreBlocked={restoreBlocked} />}
      <Backup
        state={state}
        inCloud={cloud.available}
        restoreBlocked={restoreBlocked}
        onRestore={onRestore}
      />

      <h2 className="section-title">Over</h2>
      <div className="panel-card settings-about">
        <span>{TEAM} Scorebord</span>
        <span className="settings-version">v{APP_VERSION}</span>
      </div>
    </section>
  )
}

// Back-up: alles staat enkel in deze browser, dus een bestand bewaren
// beschermt tegen gewiste browsergegevens of een nieuw toestel.
export const BACKUP_KEY = 'scorebord-last-backup'

export const longDate = (d) =>
  new Date(d).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })

export function download(file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Bewaart de gegevens als bestand: op iOS via het deelvenster (bewaren in
// Bestanden, Drive…), elders (Android, computer) gewoon downloaden. Android
// laat het delen van .json-bestanden niet toe. Geeft false als het
// deelvenster weggeklikt werd.
export async function saveBackupFile(state) {
  const now = new Date().toISOString()
  const json = JSON.stringify(
    { app: 'scorebord', version: APP_VERSION, exportedAt: now, data: state },
    null,
    2,
  )
  // Lokale datum (JJJJ-MM-DD) in de naam, niet die van UTC.
  const name = `scorebord-backup-${new Date().toLocaleDateString('sv-SE')}.json`
  const file = new File([json], name, { type: 'application/json' })
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Scorebord back-up' })
    } catch (e) {
      if (e?.name === 'AbortError') return false
      // Delen geweigerd (bv. bestandstype niet toegelaten): dan toch downloaden.
      download(file)
    }
  } else {
    download(file)
  }
  try {
    localStorage.setItem(BACKUP_KEY, now)
  } catch {
    // niet erg: enkel de datum van de laatste back-up gaat verloren
  }
  return true
}

export function Backup({ state, inCloud, restoreBlocked, onRestore }) {
  const fileInput = useRef(null)
  const [lastBackup, setLastBackup] = useState(() => {
    try {
      return localStorage.getItem(BACKUP_KEY)
    } catch {
      return null
    }
  })
  const [pending, setPending] = useState(null)
  const [message, setMessage] = useState(null)

  const exportBackup = async () => {
    try {
      if (!(await saveBackupFile(state))) return
    } catch {
      setMessage({ error: true, text: 'De back-up kon niet gemaakt worden.' })
      return
    }
    setLastBackup(localStorage.getItem(BACKUP_KEY))
    setMessage(null)
  }

  const readFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const data = fromStored(parsed?.app === 'scorebord' ? parsed.data : parsed)
      if (!data) throw new Error('leeg')
      setPending({ data, exportedAt: parsed.exportedAt })
      setMessage(null)
    } catch {
      setMessage({ error: true, text: 'Dit bestand is geen geldige back-up van het scorebord.' })
    }
  }

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

  return (
    <>
      <div className="panel-card backup">
        <p className="backup-text">
          {inCloud
            ? 'Liever ook een eigen bestand, bv. op het einde van het seizoen? Exporteer alles naar een back-upbestand.'
            : 'Alles staat enkel op dit toestel. Bewaar af en toe een back-up, zodat je spelers en uitslagen niet verloren gaan.'}
        </p>
        <p className="backup-last">
          {lastBackup ? `Laatste back-up: ${longDate(lastBackup)}` : 'Nog geen back-up gemaakt.'}
        </p>
        <div className="row row-flush">
          <button className="btn btn-primary btn-wide" onClick={exportBackup}>
            Exporteer
          </button>
          <button
            className="btn btn-wide"
            onClick={() => fileInput.current?.click()}
            disabled={restoreBlocked}
            title={restoreBlocked ? 'Beëindig eerst de lopende wedstrijd' : undefined}
          >
            Zet terug
          </button>
        </div>
        {restoreBlocked && !inCloud && (
          <p className="backup-note">Terugzetten kan pas na de lopende wedstrijd.</p>
        )}
        {message && (
          <p className={message.error ? 'backup-note is-error' : 'backup-note'} role="status">
            {message.text}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={readFile}
        />
      </div>

      {pending && (
        <Confirm
          title="Back-up terugzetten?"
          body={`De back-up${pending.exportedAt ? ` van ${longDate(pending.exportedAt)}` : ''} bevat ${count(pending.data.teams.length, 'ploeg', 'ploegen')} en ${count(pending.data.history.length, 'wedstrijd', 'wedstrijden')}. Alles wat nu in de app staat, wordt vervangen.`}
          confirmLabel="Ja, zet terug"
          danger
          onConfirm={() => {
            onRestore(pending.data)
            setPending(null)
            setMessage({ text: 'De back-up is teruggezet.' })
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}

export const THEME_OPTIONS = [
  { value: 'light', short: 'Licht', Icon: SunIcon },
  { value: 'auto', short: 'Automatisch', Icon: AutoThemeIcon },
  { value: 'dark', short: 'Donker', Icon: MoonIcon },
]
