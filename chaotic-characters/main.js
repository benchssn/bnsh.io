const $ = selector => document.querySelector(selector)

const glyphEl = $('#glyph')
const sequenceEl = $('#sequence')
const countEl = $('#count')
const seedInput = $('#seed')
const styleSelect = $('#style')
const complexityInput = $('#complexity')
const canvas = $('#cobweb')
const ctx = canvas.getContext('2d')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const SVG_NS = 'http://www.w3.org/2000/svg'

const WARMUP = 64 // iterations discarded after seeding
const STIR = 5 // iterations of each map between draws
const EDGE = 1e-12
const BOX = { w: 100, h: 140 } // glyph cell in SVG units
const COBWEB_STEPS = 40 // iterations shown in the cobweb diagram

// ── The chaotic source ──────────────────────────────────────────────────────

// Two independent 53-bit hashes of the seed text (cyrb53), mapped into (0, 1).
function hashSeed(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (const ch of text) {
    const c = ch.codePointAt(0)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const a = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  const b = 4294967296 * (2097151 & h1) + (h2 >>> 0)
  const toUnit = v => (v + 0.5) / 2 ** 53
  return [toUnit(a), toUnit(b)]
}

const state = { x: 0.5, y: 0.5, steps: 0 }

// x ↦ 4x(1 − x). Floating point can land on 0 or 1, where the orbit would
// freeze, so nudge it back into the interior if that ever happens.
function logistic(v) {
  const next = 4 * v * (1 - v)
  if (next > EDGE && next < 1 - EDGE) return next
  return (v + 0.6180339887498949 + state.steps * 1e-9) % 1 || 0.5
}

function step(trail) {
  state.x = logistic(state.x)
  state.y = logistic(state.y)
  state.steps++
  trail?.push(state.x)
}

// Conjugacy with the tent map: makes the arcsine-distributed x uniform on (0, 1).
const flatten = v => (2 / Math.PI) * Math.asin(Math.sqrt(v))

// 16 bits from deep in both orbits, combined with XOR.
function drawBits(trail) {
  for (let i = 0; i < STIR; i++) step(trail)
  const a = Math.floor(flatten(state.x) * 2 ** 32)
  const b = Math.floor(flatten(state.y) * 2 ** 32)
  return ((a ^ b) >>> 0) & 0xffff
}

// Rejection sampling keeps every character equally likely.
function drawIndex(n, trail) {
  const limit = 65536 - (65536 % n)
  for (;;) {
    const v = drawBits(trail)
    if (v < limit) return v % n
  }
}

function seed(text) {
  ;[state.x, state.y] = hashSeed(text)
  state.steps = 0
  for (let i = 0; i < WARMUP; i++) step()
}


// Uniform number in [0, 1) from the chaotic source.
const rand = trail => drawBits(trail) / 65536


// ── Glyphs ──────────────────────────────────────────────────────────────────

// A glyph is a few strokes over a jittered 3 × 4 grid of points. Every choice
// (stroke count, start, direction, curvature, dots, tails) comes from the chaos.
function buildGlyph(style, complexity, trail) {
  const r = () => rand(trail)
  const pick = list => list[drawIndex(list.length, trail)]

  for (;;) {
    const nodes = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        nodes.push({ col, row, x: 20 + 30 * col + (r() - 0.5) * 12, y: 22 + 32 * row + (r() - 0.5) * 12 })
      }
    }

    const strokes = []
    const touched = []
    let segments = 0
    const strokeCount = 1 + drawIndex(complexity, trail)

    for (let s = 0; s < strokeCount; s++) {
      let cur = touched.length && r() < 0.7 ? pick(touched) : pick(nodes)
      let prev = null
      let d = `M${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`
      touched.push(cur)
      const length = 1 + drawIndex(3, trail)

      for (let k = 0; k < length; k++) {
        const options = nodes.filter(n => n !== cur && n !== prev &&
          Math.abs(n.col - cur.col) <= 1 && Math.abs(n.row - cur.row) <= 2)
        const next = pick(options)
        const curved = style === 'flowing' || (style === 'mixed' && r() < 0.5)
        if (curved) {
          const dx = next.x - cur.x, dy = next.y - cur.y
          const bend = (r() - 0.5) * 1.3
          const cx = (cur.x + next.x) / 2 - dy * bend
          const cy = (cur.y + next.y) / 2 + dx * bend
          d += ` Q${cx.toFixed(1)} ${cy.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
        } else {
          d += ` L${next.x.toFixed(1)} ${next.y.toFixed(1)}`
        }
        prev = cur
        cur = next
        touched.push(cur)
        segments++
      }

      // Occasional short tail off the end of a stroke.
      if (r() < 0.25) {
        const angle = r() * Math.PI * 2
        d += ` l${(Math.cos(angle) * 12).toFixed(1)} ${(Math.sin(angle) * 12).toFixed(1)}`
      }
      strokes.push(d)
    }

    // Occasional dot, offset from a point the glyph touches.
    if (r() < 0.35) {
      const n = pick(touched)
      const x = Math.min(92, Math.max(8, n.x + (r() - 0.5) * 30))
      const y = r() < 0.5 ? 8 : Math.min(134, n.y + 18)
      strokes.push(`M${x.toFixed(1)} ${y.toFixed(1)} l0.01 0`)
    }

    // Too simple to read as a character (and too likely to match a real one).
    if (segments >= 3) return { strokes, hue: r() * 300 }
  }
}

function glyphSvg(glyph, { animate = false } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `${-(glyph.dx ?? 0)} 0 ${BOX.w} ${BOX.h}`)
  svg.style.setProperty('--hue', glyph.hue)
  if (animate && !reduceMotion) svg.classList.add('writing')
  glyph.strokes.forEach((d, i) => {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('pathLength', '1')
    path.style.setProperty('--i', i)
    svg.append(path)
  })
  return svg
}

// ── Page ────────────────────────────────────────────────────────────────────

const history = []

function generate() {
  const start = state.x
  const trail = []
  const glyph = buildGlyph(styleSelect.value, Number(complexityInput.value), trail)
  history.push(glyph)

  // Centre the glyph horizontally once its real extent is known.
  const big = glyphSvg(glyph, { animate: true })
  glyphEl.replaceChildren(big)
  const box = big.getBBox()
  glyph.dx = BOX.w / 2 - (box.x + box.width / 2)
  big.setAttribute('viewBox', `${-glyph.dx} 0 ${BOX.w} ${BOX.h}`)
  const label = `Invented character ${history.length}`
  glyphEl.setAttribute('aria-label', label)

  const small = glyphSvg(glyph)
  small.setAttribute('role', 'img')
  small.setAttribute('aria-label', label)
  sequenceEl.append(small)
  countEl.value = history.length

  showState()
  // A glyph can take hundreds of iterations; the diagram shows the last few.
  const shown = trail.slice(-COBWEB_STEPS)
  animateCobweb(trail.length > COBWEB_STEPS ? trail[trail.length - COBWEB_STEPS - 1] : start, shown)
  $('#cobweb-note').textContent = trail.length > COBWEB_STEPS
    ? `Showing the last ${COBWEB_STEPS} of ${trail.length} iterations behind this character.`
    : `All ${trail.length} iterations behind this character.`
}

function showState() {
  $('#state-x').textContent = state.x.toFixed(15)
  $('#state-y').textContent = state.y.toFixed(15)
  $('#state-n').textContent = state.steps.toLocaleString()
}

function reset() {
  seed(seedInput.value)
  history.length = 0
  sequenceEl.replaceChildren()
  countEl.value = 0
  glyphEl.replaceChildren()
  glyphEl.removeAttribute('aria-label')
  showState()
  animateCobweb(state.x, [])
}

function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

// The manuscript as a standalone SVG, twelve characters to a line.
function manuscriptSvg() {
  const perLine = 12, gap = 10
  const lines = Math.max(1, Math.ceil(history.length / perLine))
  const width = perLine * (BOX.w + gap) + gap
  const height = lines * (BOX.h + gap) + gap
  const cells = history.map((g, i) => {
    const x = gap + (i % perLine) * (BOX.w + gap)
    const y = gap + Math.floor(i / perLine) * (BOX.h + gap)
    const paths = g.strokes.map(d => `<path d="${d}"/>`).join('')
    return `<g transform="translate(${x + (g.dx ?? 0)} ${y})" stroke="hsl(${g.hue.toFixed(0)}, 100%, 64%)">${paths}</g>`
  })
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="#000"/>` +
    `<g fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${cells.join('')}</g></svg>`
}

// ── Cobweb diagram ──────────────────────────────────────────────────────────

let cobwebFrame = 0

function animateCobweb(start, trail) {
  cancelAnimationFrame(cobwebFrame)
  const points = [start, ...trail]
  const total = points.length - 1
  const duration = reduceMotion ? 0 : Math.min(140 * total, 3000)
  const began = performance.now()

  const tick = now => {
    const progress = duration ? Math.min((now - began) / duration, 1) : 1
    drawCobweb(points, progress * total)
    if (progress < 1) cobwebFrame = requestAnimationFrame(tick)
  }
  cobwebFrame = requestAnimationFrame(tick)
}

function drawCobweb(points, shown) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const size = canvas.clientWidth
  if (canvas.width !== Math.round(size * dpr)) {
    canvas.width = canvas.height = Math.round(size * dpr)
  }
  const pad = 14
  const span = size - pad * 2
  const X = v => pad + v * span
  const Y = v => size - pad - v * span

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  ctx.strokeStyle = '#1c1c1c'
  ctx.lineWidth = 1
  ctx.strokeRect(X(0), Y(1), span, span)

  ctx.strokeStyle = '#3a3a3a'
  ctx.beginPath()
  ctx.moveTo(X(0), Y(0))
  ctx.lineTo(X(1), Y(1))
  ctx.stroke()

  ctx.strokeStyle = '#8a8a8a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i <= 120; i++) {
    const v = i / 120
    ctx[i ? 'lineTo' : 'moveTo'](X(v), Y(4 * v * (1 - v)))
  }
  ctx.stroke()

  // Each iteration: up/down to the parabola, then across to the diagonal.
  ctx.lineWidth = 1.75
  ctx.lineCap = 'round'
  let x = points[0]
  let head = [X(x), Y(0)]
  const full = Math.floor(shown)
  for (let i = 0; i < Math.min(full + 1, points.length - 1); i++) {
    const next = points[i + 1]
    const t = i === full ? shown - full : 1
    ctx.strokeStyle = `hsl(${(i / Math.max(points.length - 2, 1)) * 300}, 100%, 62%)`
    ctx.beginPath()
    ctx.moveTo(X(x), i ? Y(x) : Y(0))
    const fromY = i ? x : 0
    const midY = fromY + (next - fromY) * Math.min(t * 2, 1)
    ctx.lineTo(X(x), Y(midY))
    head = [X(x), Y(midY)]
    if (t > 0.5) {
      const midX = x + (next - x) * (t * 2 - 1)
      ctx.lineTo(X(midX), Y(next))
      head = [X(midX), Y(next)]
    }
    ctx.stroke()
    x = next
  }

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(head[0], head[1], 3, 0, Math.PI * 2)
  ctx.fill()
}


// ── Events ──────────────────────────────────────────────────────────────────

$('#generate').addEventListener('click', generate)

document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat) return
  if (e.target.closest('input, select, textarea, button')) return
  e.preventDefault()
  generate()
})

seedInput.addEventListener('input', reset)

$('#reseed').addEventListener('click', () => {
  seedInput.value = randomSeed()
  reset()
})

complexityInput.addEventListener('input', () => {
  $('#complexity-out').value = complexityInput.value
})

$('#clear').addEventListener('click', reset)

$('#download').addEventListener('click', () => {
  if (!history.length) return
  const url = URL.createObjectURL(new Blob([manuscriptSvg()], { type: 'image/svg+xml' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `chaotic-characters-${seedInput.value || 'seed'}.svg` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})

window.addEventListener('resize', () => animateCobweb(state.x, []))

seedInput.value = randomSeed()
reset()
