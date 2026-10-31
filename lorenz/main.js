const canvas = document.querySelector('#scene')
const ctx = canvas.getContext('2d')
const form = document.querySelector('#controls')
const panel = document.querySelector('#panel')
const togglePanel = document.querySelector('#toggle-panel')
const pauseButton = document.querySelector('#pause')
const timeEl = document.querySelector('#time')
const spreadEl = document.querySelector('#spread')
const liveParams = document.querySelector('#live-params')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const CLASSIC = { sigma: 10, rho: 28, beta: 8 / 3 }
const STEP = 0.004 // RK4 step; one trail point is recorded per step
const TIME_PER_FRAME = 0.016 // simulated time per frame at 1× speed
const CHUNK = 6 // trail points drawn per stroke

let width = 0, height = 0, dpr = 1
let trajectories = []
let t = 0
let paused = false
let maxSpeed = 1
let carry = 0

const camera = { yaw: -0.5, pitch: 0.2, zoom: 1, spin: reduceMotion ? 0 : 0.0016 }

const read = name => Number(form.elements[name].value)

function settings() {
  return {
    x0: read('x0'), y0: read('y0'), z0: read('z0'),
    count: read('count'),
    eps: 10 ** read('eps'),
    sigma: read('sigma'), rho: read('rho'), beta: read('beta'),
    speed: read('speed'),
    trail: read('trail'),
    colorMode: form.elements.colorMode.value,
  }
}

let cfg = settings()

// ── Dynamics ────────────────────────────────────────────────────────────────

function derivative(x, y, z, out) {
  out[0] = cfg.sigma * (y - x)
  out[1] = x * (cfg.rho - z) - y
  out[2] = x * y - cfg.beta * z
}

const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3)

function rk4(p, h) {
  const [x, y, z] = p
  derivative(x, y, z, k1)
  derivative(x + h / 2 * k1[0], y + h / 2 * k1[1], z + h / 2 * k1[2], k2)
  derivative(x + h / 2 * k2[0], y + h / 2 * k2[1], z + h / 2 * k2[2], k3)
  derivative(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4)
  p[0] += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
  p[1] += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
  p[2] += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
  return Math.hypot(k1[0], k1[1], k1[2])
}

// Each trajectory keeps a ring buffer of [x, y, z, speed] samples.
function makeTrajectory(x, y, z, capacity) {
  return { p: new Float64Array([x, y, z]), buf: new Float32Array(capacity * 4), capacity, head: 0, len: 0, n: 0 }
}

function record(tr, speed) {
  const o = tr.head * 4
  tr.buf[o] = tr.p[0]
  tr.buf[o + 1] = tr.p[1]
  tr.buf[o + 2] = tr.p[2]
  tr.buf[o + 3] = speed
  tr.head = (tr.head + 1) % tr.capacity
  tr.len = Math.min(tr.len + 1, tr.capacity)
  tr.n++
}

// Sample `age` steps back from the newest point (age 0 = newest).
function sampleIndex(tr, age) {
  return ((tr.head - 1 - age + tr.capacity * 2) % tr.capacity) * 4
}

function resizeTrail(tr, capacity) {
  const keep = Math.min(tr.len, capacity)
  const buf = new Float32Array(capacity * 4)
  for (let age = keep - 1, i = 0; age >= 0; age--, i++) {
    buf.set(tr.buf.subarray(sampleIndex(tr, age), sampleIndex(tr, age) + 4), i * 4)
  }
  Object.assign(tr, { buf, capacity, len: keep, head: keep % capacity })
}

function restart() {
  cfg = settings()
  t = 0
  carry = 0
  maxSpeed = 1
  spreadHistory.length = 0
  trajectories = Array.from({ length: cfg.count }, (_, i) =>
    makeTrajectory(cfg.x0 + i * cfg.eps, cfg.y0, cfg.z0, cfg.trail))
  for (const tr of trajectories) record(tr, 0)
}

function advance(dtTotal) {
  carry += dtTotal
  while (carry >= STEP) {
    carry -= STEP
    t += STEP
    for (const tr of trajectories) {
      const speed = rk4(tr.p, STEP)
      if (!Number.isFinite(tr.p[0] + tr.p[1] + tr.p[2])) return restart()
      if (speed > maxSpeed) maxSpeed = speed
      record(tr, speed)
    }
  }
}

// Largest distance from the reference trajectory — the visible face of chaos.
function spread() {
  const [a] = trajectories
  let max = 0
  for (let i = 1; i < trajectories.length; i++) {
    const b = trajectories[i]
    max = Math.max(max, Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]))
  }
  return max
}

// ── Rendering ───────────────────────────────────────────────────────────────

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
}

function viewport() {
  const panelOpen = !panel.hidden && width > 720
  const left = panelOpen ? panel.getBoundingClientRect().right : 0
  const bottom = !panel.hidden && width <= 720 ? panel.getBoundingClientRect().top : height
  const cx = (left + width) / 2
  const cy = bottom / 2 + 20
  const size = Math.min(width - left, bottom)
  const reach = 1.8 * Math.max(cfg.rho, 12)
  return { cx, cy, scale: camera.zoom * size * 0.85 / reach, zc: Math.max(cfg.rho - 1, 0) }
}

function hue(mode, i, n, age, speed) {
  if (mode === 'speed') return 270 * (1 - Math.min(speed / maxSpeed, 1))
  if (mode === 'trajectory' && n > 1) return (i / n) * 330
  return ((age * 0.12) + i * 25) % 360
}

function draw() {
  const { cx, cy, scale, zc } = viewport()
  const cy0 = Math.cos(camera.yaw), sy0 = Math.sin(camera.yaw)
  const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch)
  const depth = 4 * Math.max(cfg.rho, 12)

  const project = (x, y, z, out) => {
    z -= zc
    const x1 = x * cy0 - y * sy0
    const y1 = x * sy0 + y * cy0
    const y2 = y1 * cp - z * sp
    const z2 = y1 * sp + z * cp
    const f = depth / (depth + y2)
    out[0] = (cx + x1 * scale * f) * dpr
    out[1] = (cy - z2 * scale * f) * dpr
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.4 * dpr

  const pt = [0, 0]
  const n = trajectories.length
  const lineAlpha = n > 8 ? 0.55 : 0.8

  trajectories.forEach((tr, i) => {
    for (let start = tr.len - 1; start > 0; start -= CHUNK) {
      const end = Math.max(start - CHUNK, 0)
      const mid = sampleIndex(tr, (start + end) >> 1)
      const fade = 1 - start / tr.len
      ctx.strokeStyle = `hsla(${hue(cfg.colorMode, i, n, tr.n - ((start + end) >> 1), tr.buf[mid + 3])}, 100%, 60%, ${fade * fade * lineAlpha})`
      ctx.beginPath()
      for (let age = start; age >= end; age--) {
        const o = sampleIndex(tr, age)
        project(tr.buf[o], tr.buf[o + 1], tr.buf[o + 2], pt)
        if (age === start) ctx.moveTo(pt[0], pt[1])
        else ctx.lineTo(pt[0], pt[1])
      }
      ctx.stroke()
    }

    // Glowing head
    project(tr.p[0], tr.p[1], tr.p[2], pt)
    const h = hue(cfg.colorMode, i, n, tr.n, tr.buf[sampleIndex(tr, 0) + 3])
    const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 10 * dpr)
    glow.addColorStop(0, `hsla(${h}, 100%, 85%, 1)`)
    glow.addColorStop(0.25, `hsla(${h}, 100%, 60%, .6)`)
    glow.addColorStop(1, `hsla(${h}, 100%, 50%, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 10 * dpr, 0, Math.PI * 2)
    ctx.fill()
  })
}

// Spread over time on a log scale: a straight rising line is exponential divergence.
const spreadHistory = []

function drawSpreadPlot() {
  const plot = document.querySelector('#spread-plot')
  const w = plot.clientWidth, h = plot.clientHeight
  if (plot.width !== w * dpr) { plot.width = w * dpr; plot.height = h * dpr }
  const g = plot.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)

  const yMin = -12, yMax = 2
  const tMax = Math.max(20, t)
  const X = time => (time / tMax) * w
  const Y = v => h - ((Math.max(v, yMin) - yMin) / (yMax - yMin)) * h

  g.strokeStyle = '#222'
  g.lineWidth = 1
  for (let v = yMin; v <= yMax; v += 2) {
    g.beginPath(); g.moveTo(0, Y(v) + 0.5); g.lineTo(w, Y(v) + 0.5); g.stroke()
  }
  g.fillStyle = '#555'
  g.font = '9px ui-monospace, Menlo, monospace'
  g.fillText('10²', 2, Y(2) + 10)
  g.fillText('10⁻¹²', 2, Y(-12) - 3)

  if (spreadHistory.length < 2) return
  const grad = g.createLinearGradient(0, h, 0, 0)
  ;[0, 0.25, 0.5, 0.75, 1].forEach((s, k) => grad.addColorStop(s, `hsl(${270 - k * 67}, 100%, 60%)`))
  g.strokeStyle = grad
  g.lineWidth = 1.5
  g.beginPath()
  spreadHistory.forEach(([time, v], k) => (k ? g.lineTo : g.moveTo).call(g, X(time), Y(v)))
  g.stroke()
}

function formatSpread(d) {
  if (trajectories.length < 2) return 'needs 2+'
  if (d === 0) return '0'
  return d < 0.01 ? d.toExponential(2) : d.toFixed(2)
}

function updateReadout() {
  const d = spread()
  timeEl.textContent = t.toFixed(2)
  spreadEl.textContent = formatSpread(d)
  if (trajectories.length > 1 && d > 0) {
    const last = spreadHistory[spreadHistory.length - 1]
    if (!last || t - last[0] > 0.02) spreadHistory.push([t, Math.log10(d)])
    if (spreadHistory.length > 4000) spreadHistory.splice(0, spreadHistory.length - 4000)
  }
  drawSpreadPlot()
}

// ── Controls ────────────────────────────────────────────────────────────────

function syncOutputs() {
  const s = settings()
  const out = form.elements
  out.countOut.value = s.count
  out.epsOut.value = `1e${read('eps')}`
  out.sigmaOut.value = s.sigma.toFixed(1)
  out.rhoOut.value = s.rho.toFixed(1)
  out.betaOut.value = s.beta.toFixed(3)
  out.speedOut.value = `${s.speed.toFixed(1)}×`
  out.trailOut.value = s.trail
  liveParams.textContent = `σ = ${s.sigma.toFixed(1)} · ρ = ${s.rho.toFixed(1)} · β = ${s.beta.toFixed(3)}`
}

// Parameters, speed, trail and colour apply live; initial conditions restart the run.
const RESTART_FIELDS = new Set(['x0', 'y0', 'z0', 'count', 'eps'])

form.addEventListener('input', e => {
  syncOutputs()
  if (RESTART_FIELDS.has(e.target.name)) {
    if (e.target.type !== 'number') restart()
    return
  }
  const next = settings()
  if (next.trail !== cfg.trail) trajectories.forEach(tr => resizeTrail(tr, next.trail))
  cfg = { ...next, x0: cfg.x0, y0: cfg.y0, z0: cfg.z0, count: cfg.count, eps: cfg.eps }
})

form.addEventListener('change', e => {
  if (e.target.type === 'number') restart()
})

form.addEventListener('submit', e => {
  e.preventDefault()
  restart()
})

document.querySelector('#randomize').addEventListener('click', () => {
  const r = (lo, hi) => (lo + Math.random() * (hi - lo)).toFixed(2)
  form.elements.x0.value = r(-15, 15)
  form.elements.y0.value = r(-20, 20)
  form.elements.z0.value = r(5, 40)
  restart()
})

document.querySelector('#classic').addEventListener('click', () => {
  form.elements.sigma.value = CLASSIC.sigma
  form.elements.rho.value = CLASSIC.rho
  form.elements.beta.value = CLASSIC.beta.toFixed(4)
  form.dispatchEvent(new Event('input'))
})

pauseButton.addEventListener('click', () => {
  paused = !paused
  pauseButton.textContent = paused ? 'Play' : 'Pause'
})

togglePanel.addEventListener('click', () => {
  panel.hidden = !panel.hidden
  togglePanel.textContent = panel.hidden ? 'Show controls' : 'Hide controls'
  togglePanel.setAttribute('aria-expanded', String(!panel.hidden))
})

// Drag to rotate, wheel to zoom.
let drag = null
canvas.addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY }
  canvas.setPointerCapture(e.pointerId)
  canvas.classList.add('dragging')
})
canvas.addEventListener('pointermove', e => {
  if (!drag) return
  camera.yaw += (e.clientX - drag.x) * 0.006
  camera.pitch = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, camera.pitch + (e.clientY - drag.y) * 0.006))
  drag = { x: e.clientX, y: e.clientY }
})
const endDrag = () => { drag = null; canvas.classList.remove('dragging') }
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('wheel', e => {
  e.preventDefault()
  camera.zoom = Math.min(6, Math.max(0.3, camera.zoom * Math.exp(-e.deltaY * 0.001)))
}, { passive: false })

// ── Loop ────────────────────────────────────────────────────────────────────

function frame() {
  if (!paused) advance(TIME_PER_FRAME * cfg.speed)
  if (!drag) camera.yaw += camera.spin
  draw()
  updateReadout()
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
syncOutputs()
restart()
requestAnimationFrame(frame)
