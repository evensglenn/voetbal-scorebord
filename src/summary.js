// Tekent de samenvatting van de match als één afbeelding met een 4:5-verhouding,
// het formaat dat in WhatsApp en op Instagram volledig getoond wordt.
// Er wordt getekend op een vast "ontwerp"-raster van DESIGN_W × DESIGN_H, dat via
// ctx.scale() uitvergroot wordt naar de werkelijke canvasgrootte (W × H) — zo blijft
// de afbeelding scherp op een groter scherm zonder dat elk getal in dit bestand
// herrekend moet worden.
const DESIGN_W = 1080
const DESIGN_H = 1350
const SCALE = 4 / 3

export const W = Math.round(DESIGN_W * SCALE)
export const H = Math.round(DESIGN_H * SCALE)

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

export function drawSummary(ctx, d, logo) {
  ctx.save()
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H)
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
  ctx.moveTo(PAD, 360)
  ctx.lineTo(DESIGN_W - PAD, 360)
  ctx.stroke()

  drawChart(ctx, d, 424)
  drawScorers(ctx, d, 880)

  // Grijs en gedempt clublogo onderaan — een subtiele afzender, geen blikvanger.
  if (logo) {
    const logoSize = 40
    ctx.save()
    ctx.filter = 'grayscale(1)'
    ctx.globalAlpha = 0.3
    ctx.drawImage(logo, (DESIGN_W - logoSize) / 2, DESIGN_H - logoSize - 8, logoSize, logoSize)
    ctx.restore()
  }

  ctx.restore()
}

function drawChart(ctx, d, top) {
  ctx.fillStyle = FADED
  ctx.font = font(600, 30)
  ctx.textAlign = 'left'
  ctx.fillText('Zo verliep de score', PAD, top)

  const x0 = PAD
  const x1 = DESIGN_W - PAD
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

  // Iedereen die scoorde krijgt een regel; bij veel scorers krimpt de rijhoogte
  // zodat de lijst binnen het vaste canvasformaat blijft passen.
  const rows = d.scorers
  const listTop = top + 66
  const available = DESIGN_H - 40 - listTop
  const rowH = Math.min(66, Math.max(30, available / rows.length))
  const nameSize = rowH >= 58 ? 42 : rowH >= 48 ? 36 : rowH >= 40 ? 30 : 24
  const dotR = rowH >= 58 ? 12 : rowH >= 48 ? 10 : rowH >= 40 ? 8 : 6
  const dotGap = dotR * 2 + 10

  rows.forEach((s, i) => {
    const y = listTop + i * rowH

    ctx.fillStyle = PAPER
    ctx.font = font(i === 0 ? 700 : 500, nameSize)
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
      ctx.arc(DESIGN_W - PAD - dotGap / 2 - k * dotGap, y - rowH * 0.2, dotR, 0, Math.PI * 2)
      ctx.fill()
    }
    if (s.goals > 8) {
      ctx.fillStyle = CLUB
      ctx.font = font(600, Math.max(22, nameSize - 10))
      ctx.textAlign = 'right'
      ctx.fillText(`${s.goals}`, DESIGN_W - PAD - dotGap / 2 - 8 * dotGap, y - 2)
    }

    ctx.strokeStyle = HAIR
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(PAD, y + rowH * 0.33)
    ctx.lineTo(DESIGN_W - PAD, y + rowH * 0.33)
    ctx.stroke()
  })
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
