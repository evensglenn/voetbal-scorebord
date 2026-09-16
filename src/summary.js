// Tekent de samenvatting van de match als één afbeelding van 1080 × 1350,
// het formaat dat in WhatsApp en op Instagram volledig getoond wordt.

export const W = 1080
export const H = 1350

const INK = '#11161b'
const PAPER = '#ffffff'
const CLUB = '#e4600a'
const AWAY = '#98a2ab'
const HAIR = 'rgba(255, 255, 255, 0.14)'
const FADED = 'rgba(255, 255, 255, 0.55)'

const PAD = 70
const font = (weight, size) =>
  `${weight} ${size}px "Barlow Semi Condensed", system-ui, sans-serif`

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r)
  else {
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}

function badge(ctx, text, x, y, fill = CLUB, color = INK) {
  ctx.font = font(600, 28)
  const w = ctx.measureText(text).width + 30
  ctx.fillStyle = fill
  roundRect(ctx, x, y - 26, w, 40, 6)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'left'
  ctx.fillText(text, x + 15, y + 2)
  return w
}

export function drawSummary(ctx, d) {
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'

  // Datum
  ctx.fillStyle = FADED
  ctx.font = font(500, 30)
  ctx.textAlign = 'left'
  ctx.fillText(d.date, PAD, 86)

  // Uitslag
  const scoreY = 250
  ctx.font = font(500, 40)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)'
  ctx.textAlign = 'left'
  ctx.fillText(d.left.name, PAD, 168)
  ctx.textAlign = 'right'
  ctx.fillText(d.right.name, W - PAD, 168)

  ctx.font = font(700, 150)
  ctx.textAlign = 'left'
  ctx.fillStyle = d.left.ours ? CLUB : PAPER
  ctx.fillText(String(d.left.goals), PAD, scoreY + 60)
  ctx.textAlign = 'right'
  ctx.fillStyle = d.right.ours ? CLUB : PAPER
  ctx.fillText(String(d.right.goals), W - PAD, scoreY + 60)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.font = font(400, 90)
  ctx.textAlign = 'center'
  ctx.fillText('–', W / 2, scoreY + 44)

  ctx.strokeStyle = HAIR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 360)
  ctx.lineTo(W - PAD, 360)
  ctx.stroke()

  drawChart(ctx, d, 424)
  drawScorers(ctx, d, 880)

  ctx.fillStyle = FADED
  ctx.font = font(500, 26)
  ctx.textAlign = 'center'
  ctx.fillText('5 tegen 5 · 4 × 15 minuten', W / 2, H - 56)
}

function drawChart(ctx, d, top) {
  ctx.fillStyle = FADED
  ctx.font = font(600, 30)
  ctx.textAlign = 'left'
  ctx.fillText('Zo verliep de score', PAD, top)

  const x0 = PAD
  const x1 = W - PAD
  const y0 = top + 50
  const y1 = top + 276
  const band = (x1 - x0) / 4
  const max = Math.max(d.left.goals, d.right.goals, 2)
  const yFor = (v) => y1 - (v / max) * (y1 - y0)

  // Periodes
  ctx.font = font(500, 26)
  for (let p = 0; p < 4; p++) {
    if (p > 0) {
      ctx.strokeStyle = HAIR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x0 + p * band, y0 - 10)
      ctx.lineTo(x0 + p * band, y1)
      ctx.stroke()
    }
    ctx.fillStyle = FADED
    ctx.textAlign = 'center'
    ctx.fillText(`P${p + 1}`, x0 + (p + 0.5) * band, y1 + 44)
  }

  ctx.strokeStyle = HAIR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x0, y1)
  ctx.lineTo(x1, y1)
  ctx.stroke()

  // Elk doelpunt krijgt een plaats binnen zijn periode.
  const points = []
  for (let p = 1; p <= 4; p++) {
    const inPeriod = d.events.filter((e) => e.period === p)
    inPeriod.forEach((e, i) => {
      points.push({ ...e, x: x0 + (p - 1) * band + ((i + 1) * band) / (inPeriod.length + 1) })
    })
  }

  const line = (team, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, yFor(0))
    let value = 0
    for (const pt of points) {
      const next = team === 'us' ? pt.us : pt.them
      if (next === value) continue
      ctx.lineTo(pt.x, yFor(value))
      ctx.lineTo(pt.x, yFor(next))
      value = next
    }
    ctx.lineTo(x1, yFor(value))
    ctx.stroke()

    ctx.fillStyle = color
    for (const pt of points) {
      if (pt.team !== team) continue
      ctx.beginPath()
      ctx.arc(pt.x, yFor(team === 'us' ? pt.us : pt.them), 10, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  line('them', AWAY)
  line('us', CLUB)

  // Wie hoort bij welke lijn
  ctx.font = font(600, 28)
  ctx.textAlign = 'left'
  ctx.fillStyle = CLUB
  ctx.fillText(d.ourName, x0, y1 + 96)
  const w = ctx.measureText(d.ourName).width
  ctx.fillStyle = AWAY
  ctx.fillText(d.theirName, x0 + w + 40, y1 + 96)
}

function drawScorers(ctx, d, top) {
  ctx.fillStyle = FADED
  ctx.font = font(600, 30)
  ctx.textAlign = 'left'
  ctx.fillText('Doelpuntenmakers', PAD, top)

  if (d.scorers.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.font = font(500, 36)
    ctx.fillText('Niemand scoorde deze match.', PAD, top + 66)
    return
  }

  // Bij meer dan vijf scorers houden we een regel vrij voor de rest.
  const rows = d.scorers.slice(0, d.scorers.length > 5 ? 4 : 5)
  rows.forEach((s, i) => {
    const y = top + 66 + i * 66

    ctx.fillStyle = PAPER
    ctx.font = font(i === 0 ? 700 : 500, 42)
    ctx.textAlign = 'left'
    ctx.fillText(s.name, PAD, y)

    let x = PAD + ctx.measureText(s.name).width + 24
    if (s.hattricks > 0) {
      badge(ctx, s.hattricks === 1 ? 'hattrick' : `${s.hattricks} hattricks`, x, y - 4)
    }

    // Eén bolletje per doelpunt, zodat je de verhouding in één blik ziet.
    const dots = Math.min(s.goals, 8)
    for (let k = 0; k < dots; k++) {
      ctx.fillStyle = CLUB
      ctx.beginPath()
      ctx.arc(W - PAD - 34 - k * 34, y - 13, 12, 0, Math.PI * 2)
      ctx.fill()
    }
    if (s.goals > 8) {
      ctx.fillStyle = CLUB
      ctx.font = font(600, 32)
      ctx.textAlign = 'right'
      ctx.fillText(`${s.goals}`, W - PAD - 34 - 8 * 34, y - 2)
    }

    ctx.strokeStyle = HAIR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD, y + 22)
    ctx.lineTo(W - PAD, y + 22)
    ctx.stroke()
  })

  const rest = d.scorers.length - rows.length
  if (rest > 0) {
    ctx.fillStyle = FADED
    ctx.font = font(500, 30)
    ctx.textAlign = 'left'
    ctx.fillText(
      rest === 1 ? 'en nog één speler' : `en nog ${rest} spelers`,
      PAD,
      top + 66 + rows.length * 66,
    )
  }
}
