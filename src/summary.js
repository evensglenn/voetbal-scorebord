// Tekent de samenvatting van de match als één afbeelding met een vaste breedte.
// De hoogte groeit mee met de inhoud (veel doelpunten -> een langere afbeelding),
// dus niets moet krimpen om te passen. Er wordt getekend op een vast "ontwerp"-
// raster van DESIGN_W breed, dat via ctx.scale() uitvergroot wordt naar de
// werkelijke canvasgrootte (W) — zo blijft de afbeelding scherp op een groter
// scherm zonder dat elk getal in dit bestand herrekend moet worden.
const DESIGN_W = 1080
const SCALE = 4 / 3

export const W = Math.round(DESIGN_W * SCALE)

const INK = '#11161b'
const PAPER = '#ffffff'
const CLUB = '#e4600a'
const AWAY = '#98a2ab'
const HAIR = 'rgba(255, 255, 255, 0.14)'
const GRID = 'rgba(255, 255, 255, 0.22)'
const FADED = 'rgba(255, 255, 255, 0.55)'

const PAD = 70
const font = (weight, size) =>
  `${weight} ${size}px "Barlow Semi Condensed", system-ui, sans-serif`

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

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

const HEADER_H = 360
const CHART_GAP = 64
const CHART_FOOTPRINT = 380
const SECTION_GAP = 76
const SCORER_ROW_H = 66
const TIMELINE_ROW_H = 58

// Gedeelde plattegrond: bepaalt waar elk onderdeel begint en hoe hoog de hele
// afbeelding moet worden. drawSummary() en heightFor() gebruiken exact dezelfde
// berekening, zodat het canvas altijd precies past op wat er getekend wordt.
function computeLayout(d) {
  const chartTop = HEADER_H + CHART_GAP

  const scorersTop = chartTop + CHART_FOOTPRINT + SECTION_GAP
  const scorersContentH = d.scorers.length === 0 ? 66 : d.scorers.length * SCORER_ROW_H
  const scorersEnd = scorersTop + 66 + scorersContentH

  const allPeriods = Array.from({ length: d.periodsCount || 4 }, (_, i) => i + 1)
  const periods = allPeriods.filter((p) => d.events.some((e) => e.period === p))
  const timelineTop = scorersEnd + SECTION_GAP
  let timelineContentH = 0
  if (periods.length > 0) {
    timelineContentH += 60
    for (const p of periods) {
      timelineContentH += 46 + d.events.filter((e) => e.period === p).length * TIMELINE_ROW_H + 18
    }
  }
  const timelineEnd = timelineTop + timelineContentH

  const totalHeight = timelineEnd + 200

  return { chartTop, scorersTop, timelineTop, periods, totalHeight }
}

export function heightFor(d) {
  return Math.round(computeLayout(d).totalHeight * SCALE)
}

export function drawSummary(ctx, d, logo) {
  const layout = computeLayout(d)

  ctx.save()
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, DESIGN_W, layout.totalHeight)
  ctx.textBaseline = 'alphabetic'

  // Groot, grijs en gedempt clublogo op de achtergrond onderaan — zichtbaar als
  // afzender, maar getekend vóór de tekst zodat die er leesbaar overheen blijft staan.
  if (logo) {
    const logoSize = 160
    ctx.save()
    ctx.filter = 'grayscale(1)'
    ctx.globalAlpha = 0.3
    ctx.drawImage(
      logo,
      (DESIGN_W - logoSize) / 2,
      layout.totalHeight - logoSize - 8,
      logoSize,
      logoSize,
    )
    ctx.restore()
  }

  // Datum
  ctx.fillStyle = FADED
  ctx.font = font(500, 30)
  ctx.textAlign = 'left'
  ctx.fillText(d.date, PAD, 86)

  // Uitslag
  const scoreY = 250
  const NAME_FADED = 'rgba(255, 255, 255, 0.82)'
  ctx.font = font(500, 40)
  ctx.textAlign = 'left'
  ctx.fillStyle = d.left.ours ? CLUB : NAME_FADED
  ctx.fillText(d.left.name, PAD, 168)
  ctx.textAlign = 'right'
  ctx.fillStyle = d.right.ours ? CLUB : NAME_FADED
  ctx.fillText(d.right.name, DESIGN_W - PAD, 168)

  ctx.font = font(700, 150)
  ctx.textAlign = 'left'
  ctx.fillStyle = d.left.ours ? CLUB : PAPER
  ctx.fillText(String(d.left.goals), PAD, scoreY + 60)
  ctx.textAlign = 'right'
  ctx.fillStyle = d.right.ours ? CLUB : PAPER
  ctx.fillText(String(d.right.goals), DESIGN_W - PAD, scoreY + 60)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.font = font(400, 90)
  ctx.textAlign = 'center'
  ctx.fillText('–', DESIGN_W / 2, scoreY + 44)

  if (d.ageGroup) {
    ctx.fillStyle = FADED
    ctx.font = font(600, 22)
    ctx.textAlign = 'center'
    ctx.fillText(d.ageGroup, DESIGN_W / 2, scoreY + 78)
  }

  ctx.strokeStyle = HAIR
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, HEADER_H)
  ctx.lineTo(DESIGN_W - PAD, HEADER_H)
  ctx.stroke()

  drawChart(ctx, d, layout.chartTop)
  drawScorers(ctx, d, layout.scorersTop)
  drawTimeline(ctx, d, layout)

  ctx.restore()
}

function drawChart(ctx, d, top) {
  ctx.fillStyle = FADED
  ctx.font = font(600, 30)
  ctx.textAlign = 'left'
  ctx.fillText('Zo verliep de score', PAD, top)

  const periodsCount = d.periodsCount || 4
  const x0 = PAD
  const x1 = DESIGN_W - PAD
  const y0 = top + 50
  const y1 = top + 276
  const band = (x1 - x0) / periodsCount
  const max = Math.max(d.left.goals, d.right.goals, 2)
  const yFor = (v) => y1 - (v / max) * (y1 - y0)

  // Y-as: subtiele horizontale lijnen met het aantal doelpunten ernaast.
  const step = Math.max(1, Math.ceil(max / 6))
  ctx.font = font(500, 22)
  for (let v = 0; v <= max; v += step) {
    const y = yFor(v)
    ctx.strokeStyle = HAIR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()

    ctx.fillStyle = FADED
    ctx.textAlign = 'right'
    ctx.fillText(`${v}`, x0 - 16, y + 8)
  }

  // Periodes
  ctx.font = font(500, 26)
  for (let p = 1; p < periodsCount; p++) {
    ctx.strokeStyle = GRID
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x0 + p * band, y0 - 10)
    ctx.lineTo(x0 + p * band, y1)
    ctx.stroke()
  }
  for (let p = 0; p < periodsCount; p++) {
    ctx.fillStyle = FADED
    ctx.textAlign = 'center'
    ctx.fillText(`P${p + 1}`, x0 + (p + 0.5) * band, y1 + 52)
  }

  // Elk doelpunt krijgt een plaats binnen zijn periode.
  const points = []
  for (let p = 1; p <= periodsCount; p++) {
    const inPeriod = d.events.filter((e) => e.period === p)
    inPeriod.forEach((e, i) => {
      points.push({ ...e, x: x0 + (p - 1) * band + ((i + 1) * band) / (inPeriod.length + 1) })
    })
  }

  const line = (team, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.lineJoin = 'miter'
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
  }

  line('them', AWAY)
  line('us', CLUB)

  // Wie hoort bij welke lijn — een klein streepje in de teamkleur voor de naam,
  // zodat het meteen als grafieklegenda leest in plaats van gekleurde tekst.
  const legendY = y1 + 104
  const swatch = (color, x) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, legendY - 9)
    ctx.lineTo(x + 28, legendY - 9)
    ctx.stroke()
  }

  ctx.font = font(600, 28)
  ctx.textAlign = 'left'

  swatch(CLUB, x0)
  ctx.fillStyle = CLUB
  ctx.fillText(d.ourName, x0 + 38, legendY)
  const w = ctx.measureText(d.ourName).width

  const secondX = x0 + 38 + w + 32
  swatch(AWAY, secondX)
  ctx.fillStyle = AWAY
  ctx.fillText(d.theirName, secondX + 38, legendY)
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

  const listTop = top + 66
  d.scorers.forEach((s, i) => {
    const y = listTop + i * SCORER_ROW_H

    ctx.fillStyle = PAPER
    ctx.font = font(i === 0 ? 700 : 500, 42)
    ctx.textAlign = 'left'
    ctx.fillText(s.name, PAD, y)

    let x = PAD + ctx.measureText(s.name).width + 24
    if (s.hattricks > 0) {
      badge(ctx, s.hattricks === 1 ? 'hattrick' : `${s.hattricks} hattricks`, x, y - 4)
    }

    ctx.fillStyle = CLUB
    ctx.font = font(700, 42)
    ctx.textAlign = 'right'
    ctx.fillText(`${s.goals}×`, DESIGN_W - PAD, y)

    ctx.strokeStyle = HAIR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD, y + 22)
    ctx.lineTo(DESIGN_W - PAD, y + 22)
    ctx.stroke()
  })
}

function drawTimeline(ctx, d, layout) {
  const { periods, timelineTop } = layout
  if (periods.length === 0) return

  let y = timelineTop
  ctx.fillStyle = FADED
  ctx.font = font(600, 30)
  ctx.textAlign = 'left'
  ctx.fillText('Tijdslijn', PAD, y)
  y += 60

  for (const p of periods) {
    ctx.fillStyle = FADED
    ctx.font = font(600, 26)
    ctx.textAlign = 'left'
    ctx.fillText(`Periode ${p}`, PAD, y)
    y += 46

    for (const e of d.events.filter((ev) => ev.period === p)) {
      ctx.fillStyle = e.team === 'us' ? CLUB : AWAY
      ctx.font = font(700, 34)
      ctx.textAlign = 'left'
      ctx.fillText(`${e.us}–${e.them}`, PAD, y)

      ctx.fillStyle = PAPER
      ctx.font = font(500, 34)
      const who = e.team === 'us' ? (e.name ?? 'Own goal') : d.theirName
      ctx.fillText(who, PAD + 110, y)

      if (e.clock) {
        const whoW = ctx.measureText(who).width
        ctx.fillStyle = FADED
        ctx.font = font(500, 28)
        ctx.fillText(mmss(e.clock), PAD + 110 + whoW + 18, y)
      }

      if (e.hatLabel) {
        ctx.fillStyle = CLUB
        ctx.font = font(600, 26)
        ctx.textAlign = 'right'
        ctx.fillText(e.hatLabel, DESIGN_W - PAD, y)
      }

      ctx.strokeStyle = HAIR
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(PAD, y + 20)
      ctx.lineTo(DESIGN_W - PAD, y + 20)
      ctx.stroke()

      y += TIMELINE_ROW_H
    }
    y += 18
  }
}

// Laadt het clublogo één keer en hergebruikt daarna dezelfde Image, zodat
// drawSummary() het synchroon met ctx.drawImage() kan tekenen.
let logoPromise = null
export function loadClubLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = `${import.meta.env.BASE_URL}club-logo.png`
    })
  }
  return logoPromise
}
