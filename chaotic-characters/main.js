const $ = selector => document.querySelector(selector)

const glyphEl = $('#glyph')
const sequenceEl = $('#sequence')
const countEl = $('#count')
const seedInput = $('#seed')
const alphabetSelect = $('#alphabet')
const customWrap = $('#custom-wrap')
const customInput = $('#custom')
const copyButton = $('#copy')
const canvas = $('#cobweb')
const ctx = canvas.getContext('2d')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const WARMUP = 64 // iterations discarded after seeding
const STIR = 5 // iterations of each map between draws
const EDGE = 1e-12

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

// ── Page ────────────────────────────────────────────────────────────────────

const history = []

function alphabet() {
  const source = alphabetSelect.value === 'custom' ? customInput.value : alphabetSelect.value
  const chars = [...new Set(Array.from(source).filter(ch => ch.trim()))]
  return chars.length ? chars : ['?']
}

const hueFor = (index, n) => (n > 1 ? (index / (n - 1)) * 300 : 0)

function generate() {
  const chars = alphabet()
  const start = state.x
  const trail = []
  const index = drawIndex(chars.length, trail)
  const ch = chars[index]
  const hue = hueFor(index, chars.length)

  history.push({ ch, hue })
  glyphEl.textContent = ch
  glyphEl.style.setProperty('--hue', hue)
  glyphEl.classList.remove('pop', 'empty')
  void glyphEl.offsetWidth // restart the animation
  glyphEl.classList.add('pop')

  const span = document.createElement('span')
  span.textContent = ch
  span.style.setProperty('--hue', hue)
  sequenceEl.append(span)
  countEl.value = history.length

  showState()
  animateCobweb(start, trail)
}

function showState() {
  $('#state-x').textContent = state.x.toFixed(15)
  $('#state-y').textContent = state.y.toFixed(15)
  $('#state-n').textContent = state.steps.toLocaleString()
}

function reset() {
  seed(seedInput.value)
  history.length = 0
  sequenceEl.textContent = ''
  countEl.value = 0
  glyphEl.textContent = '?'
  glyphEl.classList.add('empty')
  showState()
  animateCobweb(state.x, [])
}

function randomSeed() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 10)
}

// ── Cobweb diagram ──────────────────────────────────────────────────────────

let cobwebFrame = 0

function animateCobweb(start, trail) {
  cancelAnimationFrame(cobwebFrame)
  const points = [start, ...trail]
  const total = points.length - 1
  const duration = reduceMotion ? 0 : 140 * total
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

alphabetSelect.addEventListener('change', () => {
  customWrap.hidden = alphabetSelect.value !== 'custom'
})

$('#clear').addEventListener('click', reset)

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(history.map(h => h.ch).join(''))
    copyButton.textContent = 'Copied'
  } catch {
    copyButton.textContent = 'Copy failed'
  }
  setTimeout(() => { copyButton.textContent = 'Copy' }, 1400)
})

window.addEventListener('resize', () => animateCobweb(state.x, []))

seedInput.value = randomSeed()
reset()
