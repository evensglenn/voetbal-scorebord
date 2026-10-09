// Uitslagen en statistieken berekenen uit de bewaarde wedstrijden.
// Uitslag vanuit ons standpunt na de reguliere speeltijd (W/G/V); een
// strafschoppenreeks telt apart mee.
export function resultOf(h) {
  const diff = ourGoals(h) - theirGoals(h)
  return diff > 0 ? 'W' : diff < 0 ? 'V' : 'G'
}

export const ourGoals = (h) => (h.left.ours ? h.left : h.right).goals

export const theirGoals = (h) => (h.left.ours ? h.right : h.left).goals

export const RESULT_LABELS = { W: 'Winst', G: 'Gelijk', V: 'Verlies' }

// Bewaarde wedstrijden van vóór het teamId-veld kennen enkel de
// leeftijdscategorie; die vallen terug op de ploeg met die categorie.
export function playedBy(team, history) {
  return history.filter((h) => (h.teamId ? h.teamId === team.id : h.ageGroup === team.ageGroup))
}

export function teamStats(played) {
  const record = { W: 0, G: 0, V: 0 }
  let goalsFor = 0
  let goalsAgainst = 0
  let biggestWin = null
  let heaviestLoss = null
  const perPeriod = []
  const scorers = {}
  const takers = {}
  const shootouts = { won: 0, drawn: 0, lost: 0 }

  for (const h of played) {
    const us = ourGoals(h)
    const them = theirGoals(h)
    record[resultOf(h)] += 1
    goalsFor += us
    goalsAgainst += them
    const diff = us - them
    if (diff > 0 && (!biggestWin || diff > ourGoals(biggestWin) - theirGoals(biggestWin))) biggestWin = h
    if (diff < 0 && (!heaviestLoss || diff < ourGoals(heaviestLoss) - theirGoals(heaviestLoss)))
      heaviestLoss = h

    for (const e of h.events ?? []) {
      const i = Math.max(0, (e.period ?? 1) - 1)
      perPeriod[i] ??= { us: 0, them: 0 }
      perPeriod[i][e.team === 'us' ? 'us' : 'them'] += 1
    }

    for (const sc of h.scorers ?? []) {
      if (sc.name === 'Own goal') continue
      // Oudere historiek bewaarde enkel de samengevoegde regel ("A, B & C").
      for (const name of sc.names ?? sc.name.split(/, | & /)) {
        const row = (scorers[name] ??= { name, goals: 0, hattricks: 0, matches: 0 })
        row.goals += sc.goals
        row.hattricks += sc.hattricks ?? 0
        row.matches += 1
      }
    }

    const pens = h.penalties
    if (pens) {
      if (pens.us.scored > pens.them.scored) shootouts.won += 1
      else if (pens.us.scored < pens.them.scored) shootouts.lost += 1
      else shootouts.drawn += 1
      for (const a of pens.attempts) {
        if (a.team !== 'us') continue
        const row = (takers[a.name] ??= { name: a.name, scored: 0, total: 0 })
        row.total += 1
        if (a.scored) row.scored += 1
      }
    }
  }

  return {
    record,
    goalsFor,
    goalsAgainst,
    biggestWin,
    heaviestLoss,
    perPeriod: Array.from(perPeriod, (p) => p ?? { us: 0, them: 0 }),
    scorers: Object.values(scorers).sort(
      (a, b) => b.goals - a.goals || b.hattricks - a.hattricks || a.name.localeCompare(b.name),
    ),
    takers: Object.values(takers),
    shootouts,
    // Historiek staat nieuwste eerst; de vorm leest van oud (links) naar nieuw.
    form: played.slice(0, 5).map(resultOf).reverse(),
  }
}

export const scoreLine = (h) => `${ourGoals(h)}–${theirGoals(h)} tegen ${h.theirName}`

// Korte datum voor de lijst ("za 4 okt 2026"); oudere uitslagen zonder
// tijdstip tonen de bewaarde, voluit geschreven datum.
export const shortDate = (h) =>
  h.finishedAt
    ? new Date(h.finishedAt).toLocaleDateString('nl-BE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : h.date
