// Spelregels en gegevens van een wedstrijd: leeftijdscategorieën, een lege ploeg,
// opgeslagen gegevens inlezen, hattricks en de samenvatting van een afgewerkte match.
export const STORAGE_KEY = 'matchblad.v1'

export const TEAM = 'Lummen United'

export const OPPONENT = 'Tegenstander'

export const CLUB_LOGO = `${import.meta.env.BASE_URL}club-logo.png`

// Officiële Voetbal Vlaanderen-spelfiches: formaat + aanbevolen periodes/minuten
// per leeftijd. Periodes/minuten zijn nadien vrij aanpasbaar (oefenmatchen en
// tornooien wijken vaak af); dit dient enkel als slim standaardvoorstel.
// U18 komt niet voor in de officiële fiches (die springen van U17 naar
// U19-U21) en krijgt daarom voorlopig dezelfde waarden als U19-U21.
// U7 wijkt bewust af van de officiële fiche (2 × 5') naar de waarde die bij
// deze club effectief gebruikt wordt (4 × 10').
export const AGE_CONFIG = {
  U6: { format: '2v2', periods: 2, minutes: 3 },
  U7: { format: '3v3', periods: 4, minutes: 10 },
  U8: { format: '5v5', periods: 4, minutes: 15 },
  U9: { format: '5v5', periods: 4, minutes: 15 },
  U10: { format: '8v8', periods: 4, minutes: 15 },
  U11: { format: '8v8', periods: 4, minutes: 15 },
  U12: { format: '8v8', periods: 4, minutes: 20 },
  U13: { format: '8v8', periods: 4, minutes: 20 },
  U14: { format: '11v11', periods: 4, minutes: 20 },
  U15: { format: '11v11', periods: 4, minutes: 20 },
  U16: { format: '11v11', periods: 4, minutes: 20 },
  U17: { format: '11v11', periods: 4, minutes: 20 },
  U18: { format: '11v11', periods: 2, minutes: 45 },
  U19: { format: '11v11', periods: 2, minutes: 45 },
  U20: { format: '11v11', periods: 2, minutes: 45 },
  U21: { format: '11v11', periods: 2, minutes: 45 },
}

export const AGE_ORDER = Object.keys(AGE_CONFIG)

export const FORMAT_LABELS = {
  '2v2': '2 tegen 2',
  '3v3': '3 tegen 3',
  '5v5': '5 tegen 5',
  '8v8': '8 tegen 8',
  '11v11': '11 tegen 11',
}

export const FORMAT_RULES_URL = {
  '2v2': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/2V2_Spelreglement+jeugdvoetbal.pdf',
  '3v3': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/3V3_Spelreglementjeugdvoetbalposter.pdf',
  '5v5': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/5V5_Spelreglementjeugdvoetbalposter.pdf',
  '8v8': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/8V8_Spelreglementjeugdvoetbalposter.pdf',
  '11v11': 'https://belgianfootball.s3.eu-central-1.amazonaws.com/s3fs-public/voetbalvlaanderen/Club/Jeugdvoetbal/11V11_Spelreglementjeugdvoetbalposter.pdf',
}

// Wisselmelding: aftellen vanaf zoveel seconden vooraf, en de melding
// zoveel seconden laten staan na het wisselmoment zelf. subMinutes per ploeg:
// null = halverwege elke periode, 0 = uit, anders om de zoveel minuten.
export const SUB_COUNTDOWN = 30

export const SUB_NOTICE = 20

export const uid = () => Math.random().toString(36).slice(2, 10)

export const emptyTeam = (ageGroup = 'U9') => {
  const cfg = AGE_CONFIG[ageGroup] ?? AGE_CONFIG.U9
  return {
    id: uid(),
    ageGroup,
    periodsCount: cfg.periods,
    periodMinutes: cfg.minutes,
    home: true,
    opponent: '',
    players: [],
    events: [],
    penalties: [],
    period: 1,
    clocks: Array(cfg.periods).fill(0),
    started: false,
    activePlayerIds: [],
    runningSince: null,
    subMinutes: null,
  }
}

// Houdt clocks/period in lijn met periodsCount, ook nadat iemand dat aantal
// handmatig wijzigt of na het inladen van (mogelijk verouderde) opslag.
export function normalizeTeam(team) {
  const n = Math.max(1, team.periodsCount || 1)
  const playerIds = team.players.map((p) => p.id)
  return {
    ...team,
    periodsCount: n,
    clocks: Array.from({ length: n }, (_, i) => team.clocks?.[i] ?? 0),
    period: Math.min(Math.max(team.period || 1, 1), n),
    started: team.started ?? hadActivity(team),
    // Opslag van vóór dit veld had geen selectie: dan telt de hele ploeg mee.
    // Verwijderde spelers vallen automatisch weg uit de selectie.
    activePlayerIds: (team.activePlayerIds ?? playerIds).filter((id) => playerIds.includes(id)),
    runningSince: team.runningSince ?? null,
    penalties: team.penalties ?? [],
    subMinutes: team.subMinutes ?? null,
    extraPeriods: team.extraPeriods ?? 0,
    endedEarly: team.endedEarly ?? false,
  }
}

// Voor opslag van vóór het "started"-veld: een team met al gescoorde
// doelpunten of een gelopen klok was toen al onderweg.
export const hadActivity = (t) =>
  Boolean(t.events?.length > 0 || (t.clocks ?? []).some((c) => c > 0))

// Zet opgeslagen gegevens (uit localStorage of een back-up) om naar een
// geldige app-staat; null als er niets bruikbaars in zit.
export function fromStored(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const history = Array.isArray(parsed.history) ? parsed.history : []
  if (Array.isArray(parsed.teams) && parsed.teams.length > 0) {
    const teams = parsed.teams.map((t) =>
      normalizeTeam({
        ...emptyTeam(t.ageGroup),
        ...t,
        started: t.started ?? hadActivity(t),
        activePlayerIds: t.activePlayerIds ?? (t.players ?? []).map((p) => p.id),
      }),
    )
    const activeTeamId = teams.some((t) => t.id === parsed.activeTeamId)
      ? parsed.activeTeamId
      : teams[0].id
    return { teams, activeTeamId, history }
  }
  // Oud, plat matchformaat (vóór meerdere ploegen): wrap als eerste ploeg
  // zodat bestaande matchgegevens niet verloren gaan.
  if (!Array.isArray(parsed.players) && !Array.isArray(parsed.events)) return null
  const legacy = normalizeTeam({
    ...emptyTeam(parsed.ageGroup ?? 'U9'),
    ...parsed,
    started: parsed.started ?? hadActivity(parsed),
    activePlayerIds: parsed.activePlayerIds ?? (parsed.players ?? []).map((p) => p.id),
  })
  return { teams: [legacy], activeTeamId: legacy.id, history }
}

// "Ploeg" zolang er maar één is (bv. ouders van één voetballend kind),
// "Ploegen" vanaf de tweede.
export const teamsLabel = (teams) => (teams.length > 1 ? 'Ploegen' : 'Ploeg')

export function freshState() {
  const first = emptyTeam('U9')
  return { teams: [first], activeTeamId: first.id, history: [] }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const restored = raw && fromStored(JSON.parse(raw))
    if (restored) return restored
  } catch {
    // onleesbare opslag: begin met een lege ploeg
  }
  return freshState()
}

export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Een hattrick is drie doelpunten na elkaar van dezelfde speler. Elk ander doelpunt
// breekt de reeks: van een ploegmaat, van de tegenstander, of een doelpunt zonder naam.
export function analyseRuns(events) {
  const n = events.length
  const lens = new Array(n).fill(0)
  let prev = null

  events.forEach((e, i) => {
    if (e.team === 'us' && e.playerId) {
      lens[i] = e.playerId === prev ? lens[i - 1] + 1 : 1
      prev = e.playerId
    } else {
      lens[i] = 0
      prev = null
    }
  })

  // Terugwaarts bepalen hoe lang de reeks wordt waar dit doelpunt bij hoort.
  const inHattrick = new Array(n).fill(false)
  let runMax = 0
  for (let i = n - 1; i >= 0; i--) {
    const continues = i + 1 < n && lens[i] > 0 && lens[i + 1] === lens[i] + 1
    runMax = continues ? runMax : lens[i]
    inHattrick[i] = lens[i] > 0 && runMax >= 3
  }

  const streak = {}
  const hat = {}
  const hattricks = {}
  events.forEach((e, i) => {
    streak[e.id] = lens[i]
    hat[e.id] = inHattrick[i]
    if (lens[i] === 3) hattricks[e.playerId] = (hattricks[e.playerId] ?? 0) + 1
  })

  const last = n > 0 && lens[n - 1] > 0 ? { playerId: events[n - 1].playerId, len: lens[n - 1] } : null

  return { streak, hat, hattricks, live: last }
}

export const formatNames = (names) => {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// Spelers met evenveel doelpunten (en evenveel hattricks) samen op één regel,
// bv. "Seppe & Rune". De lijst moet al gesorteerd zijn op goals/hattricks zodat
// gelijke reeksen naast elkaar staan.
export function groupScorers(scorers) {
  const groups = []
  for (const s of scorers) {
    const last = groups[groups.length - 1]
    if (last && last.goals === s.goals && last.hattricks === s.hattricks) {
      last.names.push(s.name)
    } else {
      groups.push({ names: [s.name], goals: s.goals, hattricks: s.hattricks })
    }
  }
  return groups.map((g) => ({
    name: formatNames(g.names),
    names: g.names,
    goals: g.goals,
    hattricks: g.hattricks,
  }))
}

// Zet een (lopende of afgewerkte) match om in het data-formaat dat de
// samenvattingsafbeelding (Summary/drawSummary) verwacht. Puur op basis van
// de match zelf, zodat dit ook werkt voor bewaarde matchen in de historiek.
export function buildSummary(match) {
  const opponentName = match.opponent?.trim() || OPPONENT
  const score = {
    us: match.events.filter((e) => e.team === 'us').length,
    them: match.events.filter((e) => e.team === 'them').length,
  }
  const goalsBy = {}
  for (const e of match.events) {
    if (e.playerId) goalsBy[e.playerId] = (goalsBy[e.playerId] ?? 0) + 1
  }
  const runs = analyseRuns(match.events)

  const ours = { name: TEAM, goals: score.us, ours: true }
  const theirs = { name: opponentName, goals: score.them, ours: false }
  const [left, right] = match.home ? [ours, theirs] : [theirs, ours]

  let us = 0
  let them = 0
  const events = match.events.map((e) => {
    if (e.team === 'us') us += 1
    else them += 1
    const player = match.players.find((p) => p.id === e.playerId)
    const len = runs.streak[e.id]
    const hatLabel = runs.hat[e.id] && len >= 3 ? (len === 3 ? 'hattrick' : `${len} op rij`) : null
    return {
      team: e.team,
      period: e.period,
      us,
      them,
      name: e.team === 'us' ? (player?.name ?? null) : null,
      clock: e.clock,
      hatLabel,
    }
  })

  const scorers = groupScorers(
    match.players
      .map((p) => ({
        name: p.name,
        goals: goalsBy[p.id] ?? 0,
        hattricks: runs.hattricks[p.id] ?? 0,
      }))
      .filter((s) => s.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name)),
  )

  const unnamed = match.events.filter((e) => e.team === 'us' && !e.playerId).length
  if (unnamed > 0) scorers.push({ name: 'Own goal', goals: unnamed, hattricks: 0 })

  const penalties = match.penalties ?? []
  const penaltiesSummary =
    penalties.length === 0
      ? null
      : {
          us: {
            scored: penalties.filter((p) => p.team === 'us' && p.scored).length,
            total: penalties.filter((p) => p.team === 'us').length,
          },
          them: {
            scored: penalties.filter((p) => p.team === 'them' && p.scored).length,
            total: penalties.filter((p) => p.team === 'them').length,
          },
          attempts: penalties.map((p) => ({
            team: p.team,
            name:
              p.team === 'us'
                ? (match.players.find((pl) => pl.id === p.playerId)?.name ?? 'Onbekende speler')
                : opponentName,
            scored: p.scored,
          })),
        }

  return {
    date: new Date().toLocaleDateString('nl-BE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    ourName: TEAM,
    theirName: opponentName,
    ageGroup: match.ageGroup,
    periodsCount: match.periodsCount,
    left,
    right,
    events,
    scorers,
    penalties: penaltiesSummary,
  }
}
