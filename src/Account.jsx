// Alles rond het Google-account: inloggen, de keuze bij de eerste login, het
// accountblok in Instellingen, de gebruikte plaats en de back-ups in het account.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatShare } from './storage.js'
import { TEAM, CLUB_LOGO } from './match.js'
import { Confirm } from './ui.jsx'
import { Pitch } from './Scoreboard.jsx'

// Foutcodes van Firebase omgezet naar iets wat een trainer langs de lijn snapt.
export const CLOUD_ERRORS = {
  'too-large':
    'Je account zit vol: nieuwe wijzigingen gaan niet meer online. Verwijder oude wedstrijden bij Uitslagen.',
  'permission-denied': 'Je account heeft geen toegang tot de online opslag.',
  'auth/unauthorized-domain': 'Inloggen is voor dit webadres nog niet toegelaten.',
  'auth/network-request-failed': 'Geen verbinding. Probeer opnieuw zodra je bereik hebt.',
  'auth/popup-blocked': 'Het inlogvenster werd geblokkeerd.',
}

export const syncTime = (t) =>
  new Date(t).toLocaleString('nl-BE', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

// Inloggen met Google: dan staan ploegen en uitslagen ook online en op elk
// toestel waarop je met hetzelfde account inlogt.
// Hoeveel plaats er gebruikt is, met een waarschuwing ruim voor het vol is.
export function StorageUsage({ storage }) {
  const { share, level, matchesLeft } = storage
  return (
    <div className={`storage is-${level}`}>
      <div
        className="storage-bar"
        role="meter"
        aria-label="Plaats gebruikt in je account"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        style={{ '--used': share }}
      />
      <p className="backup-note">
        <strong>{formatShare(share)} gebruikt</strong>
        {` · plaats voor nog ongeveer ${countLabel(matchesLeft, 'wedstrijd', 'wedstrijden')}.`}
      </p>
      {level !== 'ok' && (
        <p className={level === 'full' ? 'backup-note is-error' : 'backup-note is-warn'} role="status">
          {level === 'full'
            ? 'Je account is bijna vol. Bewaar een back-upbestand en verwijder daarna oude wedstrijden bij Uitslagen, anders gaan nieuwe wijzigingen straks niet meer online.'
            : 'Je account raakt vol. Bewaar eens een back-upbestand en verwijder oude wedstrijden bij Uitslagen die je niet meer nodig hebt.'}
        </p>
      )}
    </div>
  )
}

export function Account({ cloud, storage }) {
  const { user, status, error, syncedAt } = cloud
  if (!user) {
    return (
      <div className="panel-card">
        <p className="backup-text">
          {cloud.loading
            ? 'Je account wordt geladen…'
            : 'Geen verbinding met je account. Wijzigingen gaan online zodra er weer bereik is.'}
        </p>
      </div>
    )
  }
  return (
    <div className="panel-card">
      <div className="account-user">
        {user.photo && (
          <img className="account-photo" src={user.photo} alt="" referrerPolicy="no-referrer" />
        )}
        <span className="account-name">
          <span>{user.name ?? user.email}</span>
          {user.name && <span className="switch-sub">{user.email}</span>}
        </span>
      </div>
      <p className={status === 'error' ? 'backup-note is-error' : 'backup-note'} role="status">
        {status === 'error'
          ? (CLOUD_ERRORS[error] ?? 'Synchroniseren is niet gelukt; de app probeert het opnieuw.')
          : status === 'offline'
            ? 'Geen verbinding. Wijzigingen gaan online zodra er weer bereik is.'
            : status === 'syncing'
              ? 'Bezig met synchroniseren…'
              : syncedAt
                ? `Gesynchroniseerd op ${syncTime(syncedAt)}.`
                : 'Gesynchroniseerd.'}
      </p>
      <StorageUsage storage={storage} />
      <div className="row row-flush account-actions">
        <button className="btn btn-wide" onClick={cloud.signOut}>
          Uitloggen
        </button>
      </div>
    </div>
  )
}

export const countLabel = (n, one, many) => `${n} ${n === 1 ? one : many}`

export const contents = ({ teams, matches }) =>
  `${countLabel(teams, 'ploeg', 'ploegen')} en ${countLabel(matches, 'wedstrijd', 'wedstrijden')}`

// Zonder account geen app: alles wordt in het account bewaard.
export function Login({ cloud }) {
  const offline = cloud.loadFailed
  return (
    <div className="shell is-home">
      <div className="pane pane-play pane-home">
        <section className="home-hero home-hero-login">
          <Pitch vertical />
          <h1 className="board-title">
            <span className="board-title-club">{TEAM}</span>
            <span className="board-title-sub">Scorebord</span>
          </h1>
          <img className="home-hero-logo" src={CLUB_LOGO} alt="" />
          <h2 className="home-hero-title">Welkom</h2>
          <p className="home-hero-sub">
            {offline
              ? 'Om de eerste keer in te loggen is er internet nodig.'
              : 'Log in met je Google-account. Je ploegen en wedstrijden worden in je account bewaard en staan zo op al je toestellen.'}
          </p>
          {cloud.error && (
            <p className="home-hero-sub login-error" role="status">
              {CLOUD_ERRORS[cloud.error] ?? 'Inloggen is niet gelukt. Probeer het opnieuw.'}
            </p>
          )}
          {offline ? (
            <button className="btn btn-start-hero" onClick={() => window.location.reload()}>
              Opnieuw proberen
            </button>
          ) : (
            <button className="btn btn-start-hero" onClick={cloud.signIn} disabled={cloud.loading}>
              {cloud.loading ? 'Even geduld…' : 'Inloggen met Google'}
            </button>
          )}
        </section>
      </div>
    </div>
  )
}

// Eerste login op een toestel waar al gegevens op staan: meenemen naar het
// account, of wissen (bv. een toestel waarop enkel wat uitgeprobeerd werd).
// Bewust zonder wegklikken: er moet gekozen worden, en wissen vraagt een
// tweede bevestiging.
export function JoinChoice({ choice, onChoose }) {
  const panel = useRef(null)
  const [wiping, setWiping] = useState(false)
  useEffect(() => panel.current?.focus(), [wiping])
  const { local, remote } = choice

  return createPortal(
    <div className="overlay">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
        tabIndex={-1}
        ref={panel}
      >
        {wiping ? (
          <>
            <h2 id="join-title">Zeker wissen?</h2>
            <p>
              {`De ${contents(local)} op dit toestel worden gewist. `}
              {remote
                ? `Daarna zie je hier wat in je account staat (${contents(remote)}).`
                : 'Daarna begin je hier met een lege ploeg.'}
              {' Dit kan niet ongedaan gemaakt worden.'}
            </p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setWiping(false)}>
                Terug
              </button>
              <button className="btn btn-danger" onClick={() => onChoose(false)}>
                Ja, wis
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="join-title">Gegevens van dit toestel meenemen?</h2>
            <p>
              {`Op dit toestel staan ${contents(local)}. `}
              {remote
                ? `In je account staan al ${contents(remote)}. Meenemen voegt ze samen; anders worden ze van dit toestel gewist.`
                : 'Je account is nog leeg. Meenemen zet ze in je account; anders worden ze van dit toestel gewist.'}
            </p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setWiping(true)}>
                Wis dit toestel
              </button>
              <button className="btn btn-primary" onClick={() => onChoose(true)}>
                Meenemen
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export const BACKUP_REASONS = { manual: ' · zelf bewaard', restore: ' · vóór terugzetten' }

// Kopieën in het account: elke week één vanzelf (zie useCloudSync), de
// laatste 8 blijven bewaard. Terugzetten bewaart eerst nog de huidige stand.
export function CloudBackups({ cloud, restoreBlocked }) {
  const { user, listBackups } = cloud
  const [backups, setBackups] = useState(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const refresh = useCallback(() => {
    if (!user) return
    listBackups()
      .then((list) => {
        setBackups(list)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [user, listBackups])
  useEffect(refresh, [refresh])

  const run = async (action, done) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      setMessage({ text: done })
      refresh()
    } catch (e) {
      setMessage({
        error: true,
        text: CLOUD_ERRORS[e?.code] ?? 'Dat is niet gelukt. Probeer het opnieuw.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="panel-card backup">
        <p className="backup-text">
          Elke week bewaart de app vanzelf een kopie in je account; de laatste 8 blijven
          bewaard. Zo zet je alles terug zoals het toen was.
        </p>
        {!user ? (
          <p className="backup-last">De kopieën zijn te zien zodra er verbinding is.</p>
        ) : failed ? (
          <p className="backup-last is-error">De kopieën konden niet geladen worden.</p>
        ) : backups === null ? (
          <p className="backup-last">Kopieën laden…</p>
        ) : backups.length === 0 ? (
          <p className="backup-last">Nog geen kopie bewaard.</p>
        ) : (
          <ul className="backup-list">
            {backups.map((b) => (
              <li key={b.id}>
                <span className="switch-text">
                  <span>{syncTime(b.createdAt)}</span>
                  <span className="switch-sub">
                    {contents(b)}
                    {BACKUP_REASONS[b.reason] ?? ''}
                  </span>
                </span>
                <button
                  className="btn"
                  onClick={() => setPending(b)}
                  disabled={restoreBlocked || busy}
                >
                  Zet terug
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row row-flush">
          <button
            className="btn btn-wide"
            onClick={() => run(cloud.backupNow, 'Er is een kopie bewaard.')}
            disabled={!user || busy}
          >
            Nu een kopie bewaren
          </button>
        </div>
        {restoreBlocked && (
          <p className="backup-note">Terugzetten kan pas na de lopende wedstrijd.</p>
        )}
        {message && (
          <p className={message.error ? 'backup-note is-error' : 'backup-note'} role="status">
            {message.text}
          </p>
        )}
      </div>

      {pending && (
        <Confirm
          title="Kopie terugzetten?"
          body={`Alles wordt teruggezet zoals het was op ${syncTime(pending.createdAt)} (${contents(pending)}). Wat er nu staat, wordt eerst zelf nog als kopie bewaard.`}
          confirmLabel="Ja, zet terug"
          danger
          onConfirm={() => {
            const backup = pending
            setPending(null)
            run(() => cloud.restoreBackup(backup), 'De kopie is teruggezet.')
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  )
}
