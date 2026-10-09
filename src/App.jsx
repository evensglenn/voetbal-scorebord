// De app zelf: de staat (ploegen, wedstrijd, historiek), de klok en meldingen,
// en welk scherm er openstaat.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCloudSync } from './cloud.js'
import { storageUsage } from './storage.js'
import {
  STORAGE_KEY,
  TEAM,
  OPPONENT,
  SUB_COUNTDOWN,
  SUB_NOTICE,
  uid,
  emptyTeam,
  normalizeTeam,
  fromStored,
  teamsLabel,
  freshState,
  load,
  mmss,
  analyseRuns,
  buildSummary,
} from './match.js'
import {
  SPEECH_KEY,
  speechEnabled,
  VIBRATE_KEY,
  vibrationEnabled,
  vibrate,
  say,
  unlockSpeech,
  notify,
  askNotificationPermission,
  THEME_KEY,
  loadTheme,
  deviceType,
  askMotionPermission,
} from './device.js'
import { Presence, Confirm } from './ui.jsx'
import {
  PlayIcon,
  PauseIcon,
  FlagIcon,
  SwapIcon,
  ResetIcon,
  UndoIcon,
  CloseIcon,
  GearIcon,
  BallIcon,
  LiveIcon,
  TeamIcon,
  HistoryIcon,
  StatsIcon,
} from './icons.jsx'
import { Summary } from './SummaryView.jsx'
import { PeriodProgress, Scoreboard } from './Scoreboard.jsx'
import { useAutoRotateOff, BigBoard } from './BigBoard.jsx'
import { HattrickBanner, Timeline, LastAction, Penalties } from './Match.jsx'
import { Home } from './Home.jsx'
import { Squad } from './Squad.jsx'
import { Login, JoinChoice } from './Account.jsx'
import { Settings } from './Settings.jsx'
import { Stats } from './Stats.jsx'
import { History } from './History.jsx'
import { SubSettings, StartMatch } from './StartMatch.jsx'

export default function App() {
  const [state, setState] = useState(load)
  const cloud = useCloudSync(state, setState, { fromStored, freshState })
  // Enkel opnieuw meten als de gegevens veranderen (niet bij elke kloktik).
  const storage = useMemo(() => storageUsage(state), [state])
  const storageAlert = cloud.available && (storage.level !== 'ok' || cloud.error === 'too-large')
  const activeTeam = state.teams.find((t) => t.id === state.activeTeamId) ?? state.teams[0]
  const match = activeTeam
  // Zolang er al gescoord is of de klok al gelopen heeft, is deze match "bezig"
  // en staan we niet toe dat er tussentijds van ploeg gewisseld wordt — dat kan
  // enkel na "Nieuwe match".
  const matchInProgress = match.events.length > 0 || match.clocks.some((c) => c > 0)

  // Werkt op de actieve ploeg, maar laat de rest van de app ongewijzigd
  // gewoon "setMatch((m) => ({...m, ...}))" gebruiken zoals voorheen.
  const setMatch = (updater) => {
    setState((s) => ({
      ...s,
      teams: s.teams.map((t) =>
        t.id === s.activeTeamId
          ? normalizeTeam(typeof updater === 'function' ? updater(t) : { ...t, ...updater })
          : t,
      ),
    }))
  }

  const switchTeam = (id) => {
    if (id === state.activeTeamId || matchInProgress) return
    setState((s) => ({ ...s, activeTeamId: id }))
  }

  const addTeam = (ageGroup) => {
    const team = emptyTeam(ageGroup)
    setState((s) => ({ ...s, teams: [...s.teams, team], activeTeamId: team.id }))
  }

  const removeTeam = (id) => {
    setState((s) => {
      if (s.teams.length <= 1) return s
      const teams = s.teams.filter((t) => t.id !== id)
      const activeTeamId = s.activeTeamId === id ? teams[0].id : s.activeTeamId
      return { ...s, teams, activeTeamId }
    })
  }

  // De klok staat "aan" zolang runningSince gezet is — dat tijdstip wordt mee
  // opgeslagen, zodat de effectief verstreken tijd (Date.now() - runningSince)
  // ook correct blijft nadat de app op de achtergrond gooide of de tab even
  // helemaal herladen werd, in plaats van te pauzeren omdat setInterval-ticks
  // daar niet doorlopen.
  const running = match.runningSince != null
  const [screen, setScreen] = useState('match')
  const squadLabel = teamsLabel(state.teams)
  const [startingMatch, setStartingMatch] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [ending, setEnding] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [editingSubs, setEditingSubs] = useState(false)
  const [viewingHistory, setViewingHistory] = useState(null)
  const [compactBoard, setCompactBoard] = useState(false)
  // Versienummer van de klaarstaande update ('' als het niet te lezen viel),
  // null zolang er geen is of de melding weggeklikt werd.
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [theme, setTheme] = useState(loadTheme)

  // Groot scorebord zelf openen: altijd op tablet en computer, op een gsm
  // enkel als automatisch draaien uit lijkt te staan (zie useAutoRotateOff).
  const [device] = useState(deviceType)
  const [bigOpen, setBigOpen] = useState(false)
  const [bigRotated, setBigRotated] = useState(false)
  const bigHold = useRef(false)
  const autoRotateOff = useAutoRotateOff(device === 'phone' && match.started, bigHold)
  const showBigButton = device !== 'phone' || autoRotateOff

  const openBig = async () => {
    setBigOpen(true)
    bigHold.current = true
    try {
      await document.documentElement.requestFullscreen?.()
    } catch {
      // geen volledig scherm: het bord ligt toch al over alles heen
    }
    if (device !== 'phone') return
    try {
      await window.screen.orientation.lock('landscape')
    } catch {
      // stand niet te vergrendelen (bv. iPhone): het bord gedraaid tekenen
      setBigRotated(true)
    }
  }

  const closeBig = useCallback(() => {
    setBigOpen(false)
    setBigRotated(false)
    bigHold.current = false
    try {
      window.screen.orientation?.unlock?.()
    } catch {
      // niets vergrendeld
    }
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])

  // Esc, of het volledig scherm verlaten via de browser, sluit ook het bord.
  useEffect(() => {
    if (!bigOpen) return
    const onKey = (e) => e.key === 'Escape' && closeBig()
    const onFullscreen = () => !document.fullscreenElement && closeBig()
    document.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [bigOpen, closeBig])

  // Na de wedstrijd gaat het bord vanzelf dicht.
  useEffect(() => {
    if (!match.started && bigOpen) closeBig()
  }, [match.started, bigOpen, closeBig])
  const [speech, setSpeech] = useState(speechEnabled)
  const [vibration, setVibration] = useState(vibrationEnabled)
  const changeVibration = (on) => {
    try {
      if (on) localStorage.removeItem(VIBRATE_KEY)
      else localStorage.setItem(VIBRATE_KEY, 'off')
    } catch {
      // opslag geweigerd; de keuze geldt dan niet na herladen
    }
    setVibration(on)
    // Meteen even voelen dat het werkt.
    if (on) vibrate([160, 90, 160], { force: true })
  }
  const changeSpeech = (on) => {
    try {
      if (on) localStorage.removeItem(SPEECH_KEY)
      else localStorage.setItem(SPEECH_KEY, 'off')
    } catch {
      // opslag geweigerd; de keuze geldt dan niet na herladen
    }
    setSpeech(on)
    // Meteen laten horen hoe het klinkt (en iOS ontgrendelen vanuit de tik).
    if (on) say('Gesproken meldingen staan aan', { force: true })
    else window.speechSynthesis?.cancel()
  }

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      if (theme === 'auto') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, theme)
    } catch {
      // opslag geweigerd; het thema geldt dan enkel voor deze sessie
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // opslag geweigerd; de gegevens blijven in het geheugen staan
    }
  }, [state])

  // Drijft enkel her-renders aan zodat de klok (die zelf uit runningSince
  // wordt herberekend) live meetelt. Bij terugkeer uit de achtergrond — waar
  // setInterval geen doorgang vindt — haalt visibilitychange/focus de
  // weergave meteen in, in plaats van tot de volgende seconde te wachten.
  //
  // Elke tik valt net na een volle (of halve) seconde sinds de start
  // (runningSince), i.p.v. een vaste setInterval: zo verspringt de klok altijd
  // precies één seconde, ook als een drukke gsm (of energiebesparing) de timer
  // wat later laat afgaan. Met een vaste interval kon een tik net vóór en de
  // volgende net na een secondegrens vallen, waardoor de klok twee seconden
  // versprong. De halve seconden sturen het knipperende dubbelpunt.
  const [, forceTick] = useState(0)
  const runningSince = match.runningSince
  useEffect(() => {
    if (!runningSince) return
    const bump = () => forceTick((n) => n + 1)
    let id
    const schedule = () => {
      const intoHalf = (Date.now() - runningSince) % 500
      id = setTimeout(() => {
        bump()
        schedule()
      }, 500 - intoHalf + 15)
    }
    schedule()
    // Bij terugkeer uit de achtergrond meteen bijwerken en opnieuw uitlijnen.
    const resync = () => {
      clearTimeout(id)
      bump()
      schedule()
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [runningSince])

  // Zolang de klok loopt, houden we het scherm wakker: een webapp kan bij een
  // vergrendeld scherm niet meer trillen of spreken. Het systeem geeft die
  // vergrendeling vrij zodra de app naar de achtergrond gaat, dus bij
  // terugkeer vragen we ze opnieuw aan.
  useEffect(() => {
    if (!running || !navigator.wakeLock) return
    let lock = null
    let cancelled = false
    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) next.release()
        else lock = next
      } catch {
        // geweigerd (bv. batterijbesparing); de klok werkt gewoon verder
      }
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [running])

  useEffect(() => {
    // De sticky kop zelf krimpt zo'n 70px wanneer hij compact wordt (minder
    // padding, kleinere cijfers). Die krimp verschuift de pagina-inhoud, wat
    // op zijn beurt scrollY kan doen meebewegen (scroll anchoring) — met een
    // te kleine dode zone tussen de twee drempels ontstond daardoor een lus
    // die de kop constant liet "flippen" tussen groot en klein. De zone moet
    // dus ruim groter zijn dan die krimp.
    const onScroll = () => {
      setCompactBoard((compact) =>
        compact ? window.scrollY > 12 : window.scrollY > 120,
      )
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    // Het nieuwe versienummer staat in de cachenaam van sw.js (zie stamp-sw.js).
    const onUpdate = () => {
      setUpdateAvailable('')
      fetch(`${import.meta.env.BASE_URL}sw.js`, { cache: 'no-store' })
        .then((r) => r.text())
        .then((text) => {
          const version = text.match(/scorebord-v([\w.-]+)/)?.[1]
          if (version) setUpdateAvailable((v) => (v === null ? v : version))
        })
        .catch(() => {})
    }
    window.addEventListener('scorebord:update-available', onUpdate)
    return () => window.removeEventListener('scorebord:update-available', onUpdate)
  }, [])

  const PERIODS = Array.from({ length: match.periodsCount }, (_, i) => i + 1)
  const clock =
    match.clocks[match.period - 1] +
    (match.runningSince ? Math.floor((Date.now() - match.runningSince) / 1000) : 0)
  const periodSeconds = match.periodMinutes * 60
  const extraSeconds = Math.max(0, clock - periodSeconds)
  const periodProgress = periodSeconds > 0 ? Math.min(1, clock / periodSeconds) : 0
  // Enkel zolang de nieuwe periode nog niet begonnen is: daarna is
  // "Periode x gestart · Klok staat klaar" niet meer juist.
  const canUndoPeriod =
    match.period > 1 &&
    !running &&
    match.clocks[match.period - 1] === 0 &&
    !match.events.some((event) => event.period === match.period)

  const [timeUp, setTimeUp] = useState(false)
  const prevClock = useRef(clock)
  useEffect(() => {
    const prev = prevClock.current
    prevClock.current = clock
    // ">=" i.p.v. "===": als de app een tijdje op de achtergrond stond, kan de
    // klok in één keer over de periodegrens heen springen.
    if (periodSeconds <= 0 || prev >= periodSeconds || clock < periodSeconds) return
    vibrate([160, 90, 160])
    const ended = match.period >= match.periodsCount ? 'Einde wedstrijd' : `Einde periode ${match.period}`
    say(ended)
    notify(ended, `${TEAM} ${score.us}–${score.them} ${opponentName}`)
    setTimeUp(true)
    const t = setTimeout(() => setTimeUp(false), 1200)
    return () => clearTimeout(t)
  }, [clock, periodSeconds])

  // Wisselmomenten vallen op elk veelvoud van het wisselinterval binnen de
  // periode (het einde van de periode zelf niet). Vóór een moment loopt een
  // aftelling, op het moment zelf trilt de telefoon en blijft een melding
  // nog even staan. Alles wordt uit de klok afgeleid, zodat het ook klopt na
  // pauzeren, terugspoelen of terugkeren uit de achtergrond.
  const subHalfway = match.subMinutes == null
  const subInterval = subHalfway ? Math.floor(periodSeconds / 2) : match.subMinutes * 60
  const subIndex = subInterval > 0 ? Math.floor(clock / subInterval) : 0
  const lastSub = subIndex * subInterval
  const nextSub = lastSub + subInterval
  const subPhase =
    subInterval <= 0
      ? null
      : subIndex > 0 && lastSub < periodSeconds && clock - lastSub < SUB_NOTICE
        ? 'now'
        : nextSub < periodSeconds && nextSub - clock <= SUB_COUNTDOWN
          ? 'soon'
          : null
  // Met het vinkje verberg je de melding voor dit ene wisselmoment; het
  // volgende moment verschijnt gewoon weer.
  const subKey = subPhase && `${match.period}-${subPhase === 'now' ? lastSub : nextSub}`
  const [dismissedSub, setDismissedSub] = useState(null)
  const subDismissed = subKey != null && subKey === dismissedSub
  // Wie tijdens de match de wisseloptie wijzigt, krijgt daardoor niet meteen
  // een melding: enkel echte overgangen van de klok tellen.
  const prevSubInterval = useRef(subInterval)
  const intervalChanged = prevSubInterval.current !== subInterval
  useEffect(() => {
    prevSubInterval.current = subInterval
  })
  const prevSubIndex = useRef(subIndex)
  useEffect(() => {
    const prev = prevSubIndex.current
    prevSubIndex.current = subIndex
    if (intervalChanged || subIndex <= prev || subPhase !== 'now' || subDismissed) return
    vibrate([300, 120, 300, 120, 300])
    say('Tijd voor wissel')
    notify('Tijd voor wissel', `Periode ${match.period} · ${mmss(lastSub)}`)
  }, [subIndex, subPhase, subDismissed])

  // Aankondiging bij het begin van de aftelling — niet als je er pas middenin
  // belandt (na terugspoelen of terugkeren uit de achtergrond).
  const prevSubPhase = useRef(subPhase)
  useEffect(() => {
    const prev = prevSubPhase.current
    prevSubPhase.current = subPhase
    if (intervalChanged || prev === 'soon' || subPhase !== 'soon' || subDismissed) return
    if (nextSub - clock < SUB_COUNTDOWN - 3) return
    vibrate([120])
    say(`Wissel over ${SUB_COUNTDOWN} seconden`)
    notify(`Wissel over ${SUB_COUNTDOWN} seconden`, `Periode ${match.period}`)
  }, [subPhase, subDismissed, nextSub, clock])

  // Een doelpunt terwijl de klok stilstaat wijst meestal op een vergeten
  // start: dan tonen we even een herinnering bij de klok.
  const [goalWhilePaused, setGoalWhilePaused] = useState(false)
  useEffect(() => {
    if (running) setGoalWhilePaused(false)
    if (!goalWhilePaused || running) return
    const t = setTimeout(() => setGoalWhilePaused(false), 8000)
    return () => clearTimeout(t)
  }, [goalWhilePaused, running])

  const clockLabel = running ? 'Pauze' : clock > 0 ? 'Ga verder' : 'Start'
  // Voorbij als de tijd om is, of als de laatste periode vroegtijdig gestopt werd.
  const periodOver =
    (periodSeconds > 0 && clock >= periodSeconds) ||
    (match.endedEarly && match.period >= match.periodsCount)
  const lastPeriod = match.period >= match.periodsCount
  // Strafschoppen, samenvatting en beëindigen horen pas bij het einde van de
  // match: na de laatste periode, of zodra er al strafschoppen genomen zijn.
  const matchFinished = (lastPeriod && periodOver) || match.penalties.length > 0

  const opponentName = match.opponent?.trim() || OPPONENT

  const score = useMemo(() => {
    const us = match.events.filter((e) => e.team === 'us').length
    const them = match.events.filter((e) => e.team === 'them').length
    return { us, them }
  }, [match.events])

  const goalsBy = useMemo(() => {
    const map = {}
    for (const e of match.events) {
      if (e.playerId) map[e.playerId] = (map[e.playerId] ?? 0) + 1
    }
    return map
  }, [match.events])

  const runs = useMemo(() => analyseRuns(match.events), [match.events])

  const squadPlayers = useMemo(
    () => match.players.filter((p) => match.activePlayerIds.includes(p.id)),
    [match.players, match.activePlayerIds],
  )

  const addGoal = (team, playerId = null) => {
    if (!running && clock < periodSeconds) setGoalWhilePaused(true)
    setMatch((m) => ({
      ...m,
      events: [
        ...m.events,
        {
          id: uid(),
          team,
          playerId,
          period: m.period,
          // Lopende tijd meetellen: de opgeslagen klok wordt pas bij pauze bijgewerkt.
          clock: bakeElapsed(m).clocks[m.period - 1] || null,
        },
      ],
    }))
  }

  const undo = () => setMatch((m) => ({ ...m, events: m.events.slice(0, -1) }))

  const removeEvent = (id) =>
    setMatch((m) => ({ ...m, events: m.events.filter((e) => e.id !== id) }))

  const addPenalty = (team, playerId, scored) =>
    setMatch((m) => ({
      ...m,
      penalties: [...m.penalties, { id: uid(), team, playerId, scored }],
    }))

  const removePenalty = (id) =>
    setMatch((m) => ({ ...m, penalties: m.penalties.filter((p) => p.id !== id) }))

  // Zet lopende tijd (runningSince) om in vast opgeslagen seconden op de
  // huidige periode, zodat er niets verloren gaat bij het wisselen van
  // periode of het stoppen van de klok.
  const bakeElapsed = (m) => {
    if (!m.runningSince) return m
    const clocks = [...m.clocks]
    clocks[m.period - 1] += Math.floor((Date.now() - m.runningSince) / 1000)
    return { ...m, clocks, runningSince: null }
  }

  // Na de laatste periode: de klok stilzetten en meteen naar het
  // penaltyblok, opengeklapt en in beeld.
  const [penaltiesOpen, setPenaltiesOpen] = useState(false)
  // Het blok enkel open laten zolang de match ook echt afgelopen is: na een
  // extra periode, terugzetten van de klok of ongedaan maken klapt het weer
  // dicht, zodat het pas na een nieuwe tik op "Strafschoppen" verschijnt.
  useEffect(() => {
    if (!matchFinished) setPenaltiesOpen(false)
  }, [matchFinished])
  // Tijdens de strafschoppen maakt het strafschoppenblok "Wie scoorde?" overbodig.
  const penaltiesShown = matchFinished && (penaltiesOpen || match.penalties.length > 0)
  const goToPenalties = () => {
    if (running) setMatch(bakeElapsed)
    setPenaltiesOpen(true)
    requestAnimationFrame(() =>
      document
        .getElementById('penalties')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  const toggleClock = () => {
    if (!running) {
      unlockSpeech()
      askNotificationPermission()
      if (device === 'phone') askMotionPermission()
    }
    // Opnieuw starten maakt een vroegtijdige stop ongedaan.
    setMatch((m) =>
      m.runningSince ? bakeElapsed(m) : { ...m, runningSince: Date.now(), endedEarly: false },
    )
  }

  // Laatste periode vroegtijdig stoppen: klok stil, en dezelfde keuze als na
  // afloop (strafschoppen, extra periode of beëindigen).
  const endEarly = () => setMatch((m) => ({ ...bakeElapsed(m), endedEarly: true }))

  const advancePeriod = () => {
    if (match.period >= PERIODS.length) return
    setMatch((m) => ({ ...bakeElapsed(m), period: m.period + 1 }))
  }

  const undoPeriodChange = () => {
    if (match.period <= 1) return
    setMatch((m) => {
      // Een net toegevoegde extra periode ongedaan maken haalt ze ook weer weg.
      const dropExtra = m.extraPeriods > 0 && m.period === m.periodsCount
      return {
        ...bakeElapsed(m),
        period: m.period - 1,
        ...(dropExtra && {
          periodsCount: m.periodsCount - 1,
          extraPeriods: m.extraPeriods - 1,
        }),
      }
    })
  }

  // Na de laatste periode nog een periode bijspelen, even lang als de andere.
  // Ze telt mee als extra, zodat de volgende match weer met het gewone aantal
  // periodes begint.
  const addExtraPeriod = () => {
    setMatch((m) => ({
      ...bakeElapsed(m),
      endedEarly: false,
      periodsCount: m.periodsCount + 1,
      extraPeriods: m.extraPeriods + 1,
      period: m.periodsCount + 1,
    }))
  }

  const startMatch = ({
    teamId,
    opponent,
    home,
    periodsCount,
    periodMinutes,
    subMinutes,
    activePlayerIds,
  }) => {
    setState((s) => ({
      ...s,
      activeTeamId: teamId,
      teams: s.teams.map((t) =>
        t.id === teamId
          ? normalizeTeam({
              ...t,
              opponent,
              home,
              periodsCount,
              periodMinutes,
              subMinutes,
              extraPeriods: 0,
              endedEarly: false,
              events: [],
              penalties: [],
              period: 1,
              clocks: Array(periodsCount).fill(0),
              started: true,
              activePlayerIds,
              runningSince: null,
            })
          : t,
      ),
    }))
    askNotificationPermission()
    setPenaltiesOpen(false)
    setScreen('match')
    setStartingMatch(false)
  }

  const endMatch = () => {
    const finished = {
      id: uid(),
      teamId: match.id,
      finishedAt: new Date().toISOString(),
      ...buildSummary(match),
    }
    const finish = (s) => ({
      ...s,
      history: [finished, ...s.history],
      teams: s.teams.map((t) =>
        t.id === s.activeTeamId
          ? normalizeTeam({
              ...t,
              started: false,
              events: [],
              penalties: [],
              period: 1,
              periodsCount: t.periodsCount - t.extraPeriods,
              extraPeriods: 0,
              endedEarly: false,
              clocks: [],
              runningSince: null,
            })
          : t,
      ),
    })
    setState(finish)
    setPenaltiesOpen(false)
    setEnding(false)
    // Meteen de samenvatting tonen om te delen; later terug te vinden in de Historiek.
    setViewingHistory(finished)
  }

  const cancelMatch = () => {
    setMatch((m) => ({
      ...m,
      started: false,
      events: [],
      penalties: [],
      period: 1,
      periodsCount: m.periodsCount - m.extraPeriods,
      extraPeriods: 0,
      endedEarly: false,
      clocks: [],
      runningSince: null,
    }))
    setPenaltiesOpen(false)
    setCanceling(false)
  }

  const deleteHistoryEntry = (id) =>
    setState((s) => ({ ...s, history: s.history.filter((h) => h.id !== id) }))

  const resetClock = () => {
    setMatch((m) => {
      const clocks = [...m.clocks]
      clocks[m.period - 1] = 0
      return { ...m, clocks, runningSince: null, endedEarly: false }
    })
    setResetting(false)
  }

  if (cloud.locked) return <Login cloud={cloud} />

  return (
    <div className={screen === 'match' && !match.started ? 'shell is-home' : 'shell'}>
      {/* Op het startscherm zit de titel mee in de startkaart. */}
      {(screen !== 'match' || match.started) && (
        <Scoreboard
          started={match.started}
          home={match.home}
          score={score}
          opponentName={opponentName}
          compact={compactBoard}
          onOpenBig={showBigButton ? openBig : null}
        />
      )}

      <nav className="tabs">
        {/* Zonder wedstrijd is dit "Start"; tijdens een wedstrijd wordt het
            een rood "Live", en zolang de klok loopt pulseert het icoon. */}
        <button
          className={[
            'tab',
            screen === 'match' && 'is-on',
            match.started && 'is-live',
            running && 'is-running',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => setScreen('match')}
          aria-current={screen === 'match' ? 'page' : undefined}
          aria-label={match.started ? 'Live – wedstrijd bezig' : undefined}
        >
          {match.started ? <LiveIcon /> : <BallIcon />}
          <span>{match.started ? 'Live' : 'Start'}</span>
        </button>
        <button
          className={screen === 'squad' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('squad')}
          aria-current={screen === 'squad' ? 'page' : undefined}
        >
          <TeamIcon />
          <span>{squadLabel}</span>
        </button>
        <button
          className={screen === 'history' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('history')}
          aria-current={screen === 'history' ? 'page' : undefined}
        >
          <HistoryIcon />
          <span>Uitslagen</span>
        </button>
        <button
          className={screen === 'stats' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('stats')}
          aria-current={screen === 'stats' ? 'page' : undefined}
        >
          <StatsIcon />
          <span>Statistieken</span>
        </button>
        <button
          className={screen === 'settings' ? 'tab is-on' : 'tab'}
          onClick={() => setScreen('settings')}
          aria-current={screen === 'settings' ? 'page' : undefined}
          aria-label={storageAlert ? 'Instellingen – je account raakt vol' : undefined}
        >
          <GearIcon />
          {storageAlert && <span className="tab-dot" aria-hidden="true" />}
          <span>Instellingen</span>
        </button>
      </nav>

      {screen === 'match' ? (
        match.started ? (
        <>
          <div className="pane pane-play">
            {/* Tijdens de strafschoppen spelen klok en periodes geen rol meer. */}
            {!penaltiesShown && (
              <section className="clockbar">
                <PeriodProgress count={PERIODS.length} period={match.period} progress={periodProgress} />
                <div className="clock">
                  <div className="clock-readout">
                    <span className="clock-label">Periode {match.period}</span>
                    <span className={timeUp ? 'clock-num is-timeup' : 'clock-num'}>
                      {mmss(Math.min(clock, periodSeconds))}
                      {extraSeconds > 0 && <span className="clock-extra">+{mmss(extraSeconds)}</span>}
                    </span>
                  </div>
                  <button
                    className={running ? 'btn btn-clock is-running' : 'btn btn-clock'}
                    onClick={toggleClock}
                    aria-label={clockLabel}
                    title={clockLabel}
                  >
                    {running ? <PauseIcon key="pause" /> : <PlayIcon key="play" />}
                    <span>{clockLabel}</span>
                  </button>
                  {match.period < PERIODS.length && !periodOver && (
                    <button
                      className="btn btn-next-period"
                      onClick={advancePeriod}
                      aria-label={`Naar periode ${match.period + 1}`}
                      title={`Naar periode ${match.period + 1}`}
                    >
                      <span>{match.period + 1}</span>
                      <span className="next-arrow" aria-hidden="true">→</span>
                    </button>
                  )}
                  {/* In de laatste periode is er geen volgende periode meer: die
                      plek dient dan om de wedstrijd vroegtijdig te beëindigen. */}
                  {lastPeriod && !periodOver && (
                    <button
                      className="btn btn-next-period btn-end-early"
                      onClick={endEarly}
                      aria-label="Beëindig de wedstrijd vroegtijdig"
                      title="Beëindig de wedstrijd vroegtijdig"
                    >
                      <FlagIcon />
                    </button>
                  )}
                  {clock > 0 && (
                    <button
                      className="btn btn-quiet btn-clock-reset"
                      onClick={() => setResetting(true)}
                      aria-label="Klok terug op nul"
                      title="Klok terug op nul"
                    >
                      <ResetIcon />
                    </button>
                  )}
                </div>
                <Presence show={(subPhase === 'soon' || subPhase === 'now') && !subDismissed}>
                  {subPhase === 'now' ? (
                    <div className="sub-alert is-now" role="status">
                      <SwapIcon />
                      <strong>Wisselen!</strong>
                      <span>
                        {subHalfway
                          ? `Halverwege periode ${match.period}`
                          : `${mmss(lastSub)} in periode ${match.period}`}
                      </span>
                      <button
                        className="btn btn-icon btn-undo sub-dismiss"
                        onClick={() => setDismissedSub(subKey)}
                        aria-label="Verberg wisselmelding"
                        title="Verberg wisselmelding"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <div className="sub-alert">
                      <span>Wisselen over</span>
                      <strong>{nextSub - clock}s</strong>
                    </div>
                  )}
                </Presence>
                <Presence show={periodOver}>
                  <div
                    className={
                      lastPeriod ? 'period-change period-over is-final' : 'period-change period-over'
                    }
                    role="status"
                  >
                    <div className="period-change-copy">
                      <span className="period-change-check" aria-hidden="true">
                        <FlagIcon />
                      </span>
                      <span>
                        <strong>
                          {lastPeriod ? 'Laatste periode voorbij' : `Periode ${match.period} voorbij`}
                        </strong>
                        {!lastPeriod && (
                          <span>
                            {extraSeconds > 0 ? `Extra tijd +${mmss(extraSeconds)}` : 'De tijd is om'}
                          </span>
                        )}
                      </span>
                    </div>
                    {lastPeriod ? (
                      <div className="period-over-actions">
                        <button className="btn btn-undo btn-period-over" onClick={goToPenalties}>
                          Strafschoppen
                        </button>
                        <button className="btn btn-undo btn-period-over" onClick={addExtraPeriod}>
                          Extra periode
                        </button>
                        <button className="btn btn-undo btn-period-over" onClick={() => setEnding(true)}>
                          Beëindig
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-undo btn-period-over"
                        onClick={advancePeriod}
                        aria-label={`Naar periode ${match.period + 1}`}
                      >
                        Periode {match.period + 1}
                        <span className="next-arrow" aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                </Presence>
                <Presence show={!running && !periodOver && (goalWhilePaused || clock === 0)}>
                  <p className={goalWhilePaused ? 'clock-hint is-warning' : 'clock-hint'}>
                    {goalWhilePaused
                      ? 'De klok loopt niet — tik ▶ om te starten.'
                      : 'Tik ▶ bij de aftrap om de klok te starten.'}
                  </p>
                </Presence>
              </section>
            )}

          <HattrickBanner live={runs.live} players={squadPlayers} />

          {!penaltiesShown && (
            <>
            <h2 className="section-title">Wie scoorde?</h2>
            {match.players.length === 0 ? (
              <p className="empty">
                Nog geen spelers. Voeg ze toe bij <strong>{squadLabel}</strong> en tik hier daarna
                op de naam van de scorer.
              </p>
            ) : (
              squadPlayers.length === 0 && (
                <p className="empty">
                  Niemand geselecteerd voor deze wedstrijd. Pas dit aan bij{' '}
                  <strong>Nieuwe wedstrijd</strong>.
                </p>
              )
            )}
            <div className="grid">
              {squadPlayers.map((p) => {
                const onARoll = runs.live?.playerId === p.id ? runs.live.len : 0
                return (
                  <button
                    key={p.id}
                    className={onARoll >= 3 ? 'scorer is-hat' : 'scorer'}
                    onClick={() => addGoal('us', p.id)}
                  >
                    <span className="scorer-name">{p.name}</span>
                    {runs.hattricks[p.id] > 0 && (
                      <span className="hats" title="Hattricks deze match">
                        {'•'.repeat(Math.min(runs.hattricks[p.id], 3))}
                      </span>
                    )}
                    {goalsBy[p.id] > 0 && (
                      <span key={goalsBy[p.id]} className="tally">
                        {goalsBy[p.id]}
                      </span>
                    )}
                  </button>
                )
              })}
              <button className="scorer scorer-neutral" onClick={() => addGoal('us', null)}>
                Own goal
              </button>
              <button className="scorer scorer-opponent" onClick={() => addGoal('them')}>
                Tegendoelpunt
              </button>
            </div>
            </>
          )}

          {!penaltiesShown &&
            (canUndoPeriod ? (
              <section className="period-change" aria-live="polite">
                <div className="period-change-copy">
                  <span className="period-change-check" aria-hidden="true">✓</span>
                  <span>
                    <strong>Periode {match.period} gestart</strong>
                    <span>Klok staat klaar op {mmss(clock)}</span>
                  </span>
                </div>
                <button
                  className="btn btn-icon btn-undo"
                  onClick={undoPeriodChange}
                  aria-label="Maak ongedaan"
                  title="Maak ongedaan"
                >
                  <UndoIcon />
                </button>
              </section>
            ) : (
              <LastAction
                match={match}
                score={score}
                opponentName={opponentName}
                onUndo={undo}
              />
            ))}

          {penaltiesShown && (
            <Penalties
              onEnd={() => setEnding(true)}
              open={penaltiesOpen}
              penalties={match.penalties}
              players={squadPlayers}
              opponentName={opponentName}
              onAdd={addPenalty}
              onRemove={removePenalty}
            />
          )}

          </div>

          <div className="pane pane-log">
            {!penaltiesShown && (
              <Timeline match={match} runs={runs} opponentName={opponentName} onRemove={removeEvent} />
            )}
            <div className="match-links">
              {!penaltiesShown && (
                <button className="btn btn-quiet match-link" onClick={() => setEditingSubs(true)}>
                  <SwapIcon />
                  Wisselmelding
                </button>
              )}
              <button className="btn btn-quiet match-link" onClick={() => setCanceling(true)}>
                <CloseIcon />
                Annuleer wedstrijd
              </button>
            </div>

          </div>
        </>
        ) : (
          <Home
            team={match}
            onStart={() => setStartingMatch(true)}
            onOpenSquad={() => setScreen('squad')}
          />
        )
      ) : screen === 'squad' ? (
        <Squad
          teams={state.teams}
          activeTeamId={state.activeTeamId}
          matchInProgress={matchInProgress}
          onSwitchTeam={switchTeam}
          onAddTeam={addTeam}
          onRemoveTeam={removeTeam}
          players={match.players}
          onAdd={(player) => {
            const id = uid()
            setMatch((m) => ({
              ...m,
              players: [...m.players, { id, ...player }],
              activePlayerIds: [...m.activePlayerIds, id],
            }))
          }}
          onRemove={(id) =>
            setMatch((m) => ({
              ...m,
              players: m.players.filter((p) => p.id !== id),
              events: m.events.map((e) =>
                e.playerId === id ? { ...e, playerId: null } : e,
              ),
            }))
          }
        />
      ) : screen === 'history' ? (
        <History
          teams={state.teams}
          history={state.history}
          onView={setViewingHistory}
          onDelete={deleteHistoryEntry}
        />
      ) : screen === 'settings' ? (
        <Settings
          theme={theme}
          onTheme={setTheme}
          state={state}
          cloud={cloud}
          storage={storage}
          restoreBlocked={state.teams.some((t) => t.started)}
          onRestore={setState}
          speech={speech}
          onSpeech={changeSpeech}
          vibration={vibration}
          onVibration={changeVibration}
        />
      ) : (
        <Stats teams={state.teams} history={state.history} defaultTeamId={state.activeTeamId} />
      )}


      {viewingHistory && (
        <Summary data={viewingHistory} onClose={() => setViewingHistory(null)} />
      )}

      {cloud.choice && <JoinChoice choice={cloud.choice} onChoose={cloud.resolveChoice} />}

      {startingMatch && (
        <StartMatch
          teams={state.teams}
          defaultTeamId={state.activeTeamId}
          onStart={startMatch}
          onCancel={() => setStartingMatch(false)}
        />
      )}

      {resetting && (
        <Confirm
          title="Klok terug op nul zetten?"
          body={`De tijd van periode ${match.period} (${mmss(clock)}) gaat verloren.`}
          confirmLabel="Ja, terug op nul"
          danger
          onConfirm={resetClock}
          onCancel={() => setResetting(false)}
        />
      )}

      {ending && (
        <Confirm
          title="Wedstrijd beëindigen?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} wordt bewaard bij Uitslagen.`}
          confirmLabel="Ja, beëindig"
          danger
          onConfirm={endMatch}
          onCancel={() => setEnding(false)}
        />
      )}

      {canceling && (
        <Confirm
          title="Wedstrijd annuleren?"
          body={`Eindstand ${score.us}–${score.them} tegen ${opponentName} gaat verloren en wordt niet bewaard bij Uitslagen.`}
          confirmLabel="Ja, annuleer"
          danger
          onConfirm={cancelMatch}
          onCancel={() => setCanceling(false)}
        />
      )}

      {editingSubs && (
        <SubSettings
          subMinutes={match.subMinutes}
          periodMinutes={match.periodMinutes}
          onSave={(subMinutes) => {
            setMatch((m) => ({ ...m, subMinutes }))
            setEditingSubs(false)
          }}
          onCancel={() => setEditingSubs(false)}
        />
      )}

      {match.started && (
        <BigBoard
          home={match.home}
          score={score}
          opponentName={opponentName}
          period={match.period}
          clock={mmss(Math.min(clock, periodSeconds))}
          extra={extraSeconds > 0 ? mmss(extraSeconds) : null}
          running={running}
          finished={matchFinished}
          penalties={match.penalties}
          periodsCount={PERIODS.length}
          periodProgress={periodProgress}
          notice={
            periodOver
              ? { kind: 'over', text: lastPeriod ? 'Laatste periode voorbij' : `Periode ${match.period} voorbij` }
              : subPhase === 'now' && !subDismissed
                ? { kind: 'now' }
                : subPhase === 'soon' && !subDismissed
                  ? { kind: 'soon', seconds: nextSub - clock }
                  : null
          }
          onDismissSub={() => setDismissedSub(subKey)}
          onStartClock={!running && !periodOver ? toggleClock : null}
          colonOn={!running || (Date.now() - match.runningSince) % 1000 < 500}
          open={bigOpen}
          rotated={bigRotated}
          onClose={closeBig}
        />
      )}

      {updateAvailable !== null && (
        <div className="update-toast" role="status">
          <span className="update-toast-icon">
            <ResetIcon />
          </span>
          <span className="update-toast-text">
            <strong>Nieuwe versie</strong>
            <span>{updateAvailable ? `v${updateAvailable} staat klaar` : 'staat klaar'}</span>
          </span>
          <button className="btn update-toast-go" onClick={() => window.location.reload()}>
            Vernieuw
          </button>
          <button
            className="update-toast-close"
            onClick={() => setUpdateAvailable(null)}
            aria-label="Sluit melding"
            title="Later"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  )
}
