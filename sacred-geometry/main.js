// Flower of Life base, with a cube floating inside a star tetrahedron above it.
// Everything breathes and drifts on Perlin noise. Drawn on a 2D canvas with a
// small hand-rolled 3D projection: strokes are rasterised natively, so the
// whole scene costs a couple of milliseconds a frame.
import './style.css'

const canvas = document.querySelector('#scene')
const ctx = canvas.getContext('2d')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const R = 48 // flower-of-life circle radius
const STAR = 92 // star tetrahedron half-extent (its points sit on a cube of this size)
const BASE_Y = 170 // height of the flower plane (y points down, as on screen)
const SEGMENTS = 96 // points per circle
const MOTE_COUNT = 160
const TAU = Math.PI * 2

// Star tetrahedron: two interlocking tetrahedra built from alternate cube corners
const TET_A = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
const TET_B = TET_A.map(v => v.map(c => -c))
const TET_FACES = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]]
const TET_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]

const CUBE_V = []
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CUBE_V.push([x, y, z])
const CUBE_E = []
for (let i = 0; i < 8; i++) {
  for (let j = i + 1; j < 8; j++) {
    const diff = CUBE_V[i].reduce((n, c, k) => n + (c !== CUBE_V[j][k]), 0)
    if (diff === 1) CUBE_E.push([i, j])
  }
}
const CUBE_FACES = [
  [0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5],
]

// ── Perlin noise ────────────────────────────────────────────────────────────

const perm = new Uint8Array(512)
{
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
}

const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t

function grad(h, x, y, z) {
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}

// Ken Perlin's improved noise, roughly in [-1, 1]
function perlin(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z)
  const u = fade(x), v = fade(y), w = fade(z)
  const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z
  const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z
  return lerp(
    lerp(lerp(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u),
      lerp(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
    w)
}

// Four octaves of Perlin noise mapped to [0, 1]. The small offsets keep
// integer-valued arguments off the lattice, where Perlin noise is always zero.
function noise(x, y = 0, z = 0) {
  x += 0.31; y += 0.17; z += 0.73
  let sum = 0, amp = 1, norm = 0
  for (let o = 0; o < 4; o++) {
    sum += perlin(x, y, z) * amp
    norm += amp
    amp *= 0.45
    x *= 2; y *= 2; z *= 2
  }
  return Math.min(1, Math.max(0, 0.5 + (sum / norm) * 0.9))
}

// ── 3D math ─────────────────────────────────────────────────────────────────

// 3×3 rotations stored row-major; composing A then B gives A·B, like a transform stack
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c] }
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c] }
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1] }

function mul(A, B) {
  const out = new Array(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]
    }
  }
  return out
}

const chain = (...ms) => ms.reduce(mul)

// stand the star on a point: align the (1,1,1) diagonal with the vertical axis
const STAND = mul(rotZ(-Math.PI / 2 - Math.atan2(1, Math.sqrt(2))), rotY(Math.PI / 4))

// ── State ───────────────────────────────────────────────────────────────────

let width = 0, height = 0, dpr = 1
let paused = reduceMotion
let t = 0
let starSpin = 0
let cubeSpinX = 0
let cubeSpinY = 0
let lastFrameTime = 0
let frameAccumulator = 0
const FIXED_STEP = 1 / 60
const TIME_SCALE = 0.7

const camera = { yaw: 0, pitch: 0, zoom: 1 }
let view = null // rotation, scale and offsets for the current frame

const flowerCenters = []
for (let q = -2; q <= 2; q++) {
  for (let r = -2; r <= 2; r++) {
    if (Math.abs(q + r) > 2) continue
    flowerCenters.push([R * (q + r / 2), R * r * Math.sqrt(3) / 2])
  }
}

const motes = Array.from({ length: MOTE_COUNT }, () => newMote(true))

// ── Projection ──────────────────────────────────────────────────────────────

// Model-space point → canvas pixels, through model rotation M and world offset (tx, ty, tz)
function project(M, tx, ty, tz, x, y, z, out) {
  const wx = M[0] * x + M[1] * y + M[2] * z + tx
  const wy = M[3] * x + M[4] * y + M[5] * z + ty
  const wz = M[6] * x + M[7] * y + M[8] * z + tz
  const V = view.R
  const vx = (V[0] * wx + V[1] * wy + V[2] * wz) * view.s
  const vy = (V[3] * wx + V[4] * wy + V[5] * wz) * view.s + view.lift
  const vz = (V[6] * wx + V[7] * wy + V[8] * wz) * view.s
  const f = view.eye / (view.eye - vz)
  out[0] = (view.cx + vx * f) * dpr
  out[1] = (view.cy + vy * f) * dpr
  return out
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1]

// HSB(A) on the same 360/100/100/100 scale the sketch was designed in
function hsba(h, s, b, a) {
  s /= 100; b /= 100
  const k = n => (n + h / 60) % 6
  const f = n => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)))
  return `rgba(${(f(5) * 255) | 0},${(f(3) * 255) | 0},${(f(1) * 255) | 0},${a / 100})`
}

// ── Drawing ─────────────────────────────────────────────────────────────────

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = width * dpr
  canvas.height = height * dpr
}

function draw() {
  view = {
    R: mul(
      rotX(-0.42 + (noise(t * 0.5, 100) - 0.5) * 0.25 + camera.pitch),
      rotY(t * 0.5 + (noise(t * 0.3, 200) - 0.5) * 1.5 + camera.yaw),
    ),
    s: camera.zoom * Math.min(width, height) / 820,
    // in portrait the caption covers the lower screen, so lift the scene clear of it
    lift: height > width ? -height * 0.1 : 0,
    eye: height * 0.866, // matches a 60° vertical field of view
    cx: width / 2,
    cy: height / 2,
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = hsba(235, 50, 5, 100)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // Additive glow with no depth sorting: overlapping lines brighten instead of occluding
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  drawFlower()
  drawBeam()
  drawStar()
  drawMotes()
}

function glowStroke(hue, bright, wide, thin) {
  ctx.lineWidth = wide * dpr
  ctx.strokeStyle = hsba(hue, 80, bright, 10)
  ctx.stroke()
  ctx.lineWidth = thin * dpr
  ctx.strokeStyle = hsba(hue, 35, 100, bright * 0.85)
  ctx.stroke()
}

// ---------- Flower of Life ----------

function drawFlower() {
  flowerCenters.forEach(([cx, cy], i) => {
    // brightness ripples outward from the center, shaped by noise
    const d = Math.hypot(cx, cy) / (2 * R)
    const pulse = noise(cx * 0.012 + 3, cy * 0.012 + 3, t * 2.0 - d * 0.6)
    const hue = (195 + pulse * 110 + t * 25) % 360
    glowLoop(cx, cy, R, hue, 35 + pulse * 65, i)
  })

  const outerHue = (215 + noise(t, 700) * 80 + t * 25) % 360
  glowLoop(0, 0, R * 3, outerHue, 80, 50)
  glowLoop(0, 0, R * 3.14, outerHue, 45, 51)
}

const pt = [0, 0]

function glowLoop(cx, cy, r, hue, bright, seed) {
  ctx.beginPath()
  for (let k = 0; k < SEGMENTS; k++) {
    const a = (k / SEGMENTS) * TAU
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    // sampling noise around a circle keeps the loop seamless
    const n = noise(seed * 7.3 + ca * 0.9 + 10, sa * 0.9 + 10, t * 1.2)
    const rr = r * (1 + (n - 0.5) * 0.12)
    project(IDENTITY, 0, 0, 0, cx + ca * rr, BASE_Y, cy + sa * rr, pt)
    if (k === 0) ctx.moveTo(pt[0], pt[1])
    else ctx.lineTo(pt[0], pt[1])
  }
  ctx.closePath()
  glowStroke(hue, bright, 5, 1.3)
}

// ---------- Light beam between base and star ----------

function drawBeam() {
  const glow = noise(t * 3, 900)
  const a = project(IDENTITY, 0, 0, 0, 0, BASE_Y, 0, [0, 0])
  const b = project(IDENTITY, 0, 0, 0, 0, starY() + STAR * 0.6, 0, [0, 0])
  ctx.beginPath()
  ctx.moveTo(a[0], a[1])
  ctx.lineTo(b[0], b[1])
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = (1 + i * 4) * dpr
    ctx.strokeStyle = hsba(45, 30, 100, (8 - i * 2.5) * (0.4 + glow))
    ctx.stroke()
  }
}

// ---------- Star tetrahedron with inner cube ----------

function starY() {
  return -95 + (noise(t * 0.8, 50) - 0.5) * 60
}

function drawStar() {
  const M = chain(
    rotY(starSpin),
    rotX((noise(t * 0.6, 60) - 0.5) * 0.5),
    rotZ((noise(t * 0.6, 70) - 0.5) * 0.5),
    STAND,
  )
  const ty = starY()

  const hueA = (190 + noise(t, 800) * 90 + t * 30) % 360
  const hueB = (hueA + 150) % 360
  drawSolid(M, ty, TET_A.map((v, i) => displaced(v, i, STAR, 0.4)), TET_FACES, TET_EDGES, hueA, 70, 55, 7, 6, 20, 70)
  drawSolid(M, ty, TET_B.map((v, i) => displaced(v, i + 4, STAR, 0.4)), TET_FACES, TET_EDGES, hueB, 70, 55, 7, 6, 20, 70)

  const cubeHue = (hueA + 75) % 360
  const size = STAR * 0.4 * (1 + (noise(t * 1.5, 1000) - 0.5) * 0.25)
  const cubeM = chain(M, rotX(cubeSpinX), rotY(cubeSpinY))
  drawSolid(cubeM, ty, CUBE_V.map((v, i) => displaced(v, i + 20, size, 0.15)), CUBE_FACES, CUBE_E, cubeHue, 60, 70, 9, 5, 15, 80)
}

function displaced(v, seed, size, amount) {
  const s = size * (1 + (noise(seed * 3.1, t * 1.3) - 0.5) * amount)
  return [v[0] * s, v[1] * s, v[2] * s]
}

function drawSolid(M, ty, verts, faces, edges, hue, faceSat, faceBright, faceAlpha, dot, dotSat, dotAlpha) {
  const pts = verts.map(v => project(M, 0, ty, 0, v[0], v[1], v[2], [0, 0]))

  ctx.fillStyle = hsba(hue, faceSat, faceBright, faceAlpha)
  for (const f of faces) {
    ctx.beginPath()
    f.forEach((i, k) => (k ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]))
    ctx.closePath()
    ctx.fill()
  }

  ctx.beginPath()
  for (const [a, b] of edges) {
    ctx.moveTo(pts[a][0], pts[a][1])
    ctx.lineTo(pts[b][0], pts[b][1])
  }
  ctx.lineWidth = 7 * dpr
  ctx.strokeStyle = hsba(hue, 85, 80, 9)
  ctx.stroke()
  ctx.lineWidth = 1.6 * dpr
  ctx.strokeStyle = hsba(hue, 30, 100, 85)
  ctx.stroke()

  ctx.fillStyle = hsba(hue, dotSat, 100, dotAlpha)
  ctx.beginPath()
  for (const p of pts) {
    ctx.moveTo(p[0] + dot * dpr / 2, p[1])
    ctx.arc(p[0], p[1], dot * dpr / 2, 0, TAU)
  }
  ctx.fill()
}

// ---------- Drifting motes riding a noise flow field ----------

function newMote(anywhere) {
  const a = Math.random() * TAU
  const r = Math.sqrt(Math.random()) * R * 3
  return {
    x: Math.cos(a) * r,
    y: anywhere ? -260 + Math.random() * (BASE_Y + 260) : BASE_Y,
    z: Math.sin(a) * r,
    life: 0.3 + Math.random() * 0.7,
  }
}

const clamp01 = v => Math.min(1, Math.max(0, v))

function drawMotes() {
  const k = 0.006
  const size = 2.5 * dpr
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i]
    if (!paused) {
      m.x += (noise(m.x * k, m.y * k, t + 10) - 0.5) * 2.2
      m.z += (noise(m.x * k, m.y * k, t + 20) - 0.5) * 2.2
      m.y -= 0.25 + noise(m.z * k, t + 30) * 0.7
      if (m.y < -280 || m.x * m.x + m.z * m.z > (R * 3.6) ** 2) motes[i] = newMote(false)
    }
    const fadeIn = clamp01((BASE_Y - m.y) / 40) * clamp01((m.y + 280) / 100)
    const alpha = 60 * fadeIn * m.life
    if (alpha < 1) continue
    project(IDENTITY, 0, 0, 0, m.x, m.y, m.z, pt)
    ctx.fillStyle = hsba((200 + i * 0.6 + t * 30) % 360, 40, 100, alpha)
    ctx.fillRect(pt[0] - size / 2, pt[1] - size / 2, size, size)
  }
}

// ── Interaction ─────────────────────────────────────────────────────────────

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
  camera.pitch = Math.min(1.2, Math.max(-1.2, camera.pitch - (e.clientY - drag.y) * 0.006))
  drag = { x: e.clientX, y: e.clientY }
})
const endDrag = () => { drag = null; canvas.classList.remove('dragging') }
canvas.addEventListener('pointerup', endDrag)
canvas.addEventListener('pointercancel', endDrag)
canvas.addEventListener('wheel', e => {
  e.preventDefault()
  camera.zoom = Math.min(3, Math.max(0.4, camera.zoom * Math.exp(-e.deltaY * 0.001)))
}, { passive: false })

window.addEventListener('keydown', e => {
  if (e.key === ' ') {
    e.preventDefault()
    paused = !paused
  }
  if (e.key === 's' || e.key === 'S') {
    canvas.toBlob(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'sacred-geometry.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  }
})

// ── Loop ────────────────────────────────────────────────────────────────────

function advanceSimulation(step) {
  t += step * TIME_SCALE
  starSpin += (0.004 + (noise(t, 300) - 0.5) * 0.02) * (step * 60)
  cubeSpinX += (noise(t * 0.9, 400) - 0.5) * 0.03 * (step * 60)
  cubeSpinY -= (0.006 + (noise(t * 0.9, 500) - 0.5) * 0.02) * (step * 60)
}

function frame(now) {
  if (!lastFrameTime) lastFrameTime = now

  const elapsed = (now - lastFrameTime) / 1000
  lastFrameTime = now

  if (!paused) {
    frameAccumulator += elapsed
    while (frameAccumulator >= FIXED_STEP) {
      advanceSimulation(FIXED_STEP)
      frameAccumulator -= FIXED_STEP
    }
  }
  draw()
  requestAnimationFrame(frame)
}

window.addEventListener('resize', resize)
resize()
requestAnimationFrame(frame)
