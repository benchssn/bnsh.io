import './style.css'

const canvas = document.querySelector('#field')
const ctx = canvas.getContext('2d')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Lorenz system, classic parameters
const SIGMA = 10
const RHO = 28
const BETA = 8 / 3
const DT = 0.004
const STEPS_PER_FRAME = 2
const TRAIL = 1800
const BUCKETS = 20
const TILT = 0.38
const SPIN = 0.00005 // radians per ms, ~2 minutes per revolution

// Subtle rainbow: low-saturation hues that spread along each trail and drift slowly
const HUE_SPAN = 150 // degrees of hue from the oldest to the newest part of a trail
const HUE_SPEED = 0.006 // degrees per ms, ~1 minute per full cycle
const SATURATION = 50
const LIGHTNESS = 78
const hue = (base, t, time) => (base + t * HUE_SPAN + time * HUE_SPEED) % 360

let width, height, dpr, scale, cx, cy

function step(s) {
  const dx = SIGMA * (s.y - s.x)
  const dy = s.x * (RHO - s.z) - s.y
  const dz = s.x * s.y - BETA * s.z
  s.x += dx * DT
  s.y += dy * DT
  s.z += dz * DT
}

function createTrail(seed, warmup, hueBase) {
  const s = { ...seed }
  for (let i = 0; i < warmup; i++) step(s)
  const trail = { s, hueBase, points: new Float32Array(TRAIL * 3), head: 0, count: 0 }
  for (let i = 0; i < TRAIL; i++) advance(trail)
  return trail
}

function advance(trail) {
  step(trail.s)
  const i = trail.head * 3
  trail.points[i] = trail.s.x
  trail.points[i + 1] = trail.s.y
  trail.points[i + 2] = trail.s.z
  trail.head = (trail.head + 1) % TRAIL
  trail.count = Math.min(trail.count + 1, TRAIL)
}

const trails = [
  createTrail({ x: 0.1, y: 0, z: 0 }, 2000, 210),
  createTrail({ x: -6, y: 4, z: 22 }, 3500, 330),
  createTrail({ x: 3, y: -8, z: 30 }, 5000, 90)
]

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const wide = width > 900
  scale = Math.min(height / 62, (wide ? width * 0.5 : width) / 58)
  cx = wide ? width * 0.68 : width * 0.5
  cy = height * 0.5
}

function draw(time) {
  ctx.clearRect(0, 0, width, height)

  const angle = time * SPIN
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  const cosT = Math.cos(TILT)
  const sinT = Math.sin(TILT)

  // Rotate around the vertical (z) axis, tilt toward the viewer, project
  const project = (x, y, z) => {
    const rx = x * cosA - y * sinA
    const ry = x * sinA + y * cosA
    const rz = z - 25
    return [cx + rx * scale, cy - (rz * cosT - ry * sinT) * scale]
  }

  ctx.lineWidth = 0.9
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const trail of trails) {
    const { points, head, count } = trail
    const start = (head - count + TRAIL) % TRAIL
    const perBucket = Math.ceil(count / BUCKETS)

    // Older segments fade out: draw in bands of increasing opacity
    for (let b = 0; b < BUCKETS; b++) {
      const from = b * perBucket
      const to = Math.min(count - 1, from + perBucket)
      if (from >= to) break

      ctx.beginPath()
      for (let k = from; k <= to; k++) {
        const i = ((start + k) % TRAIL) * 3
        const [px, py] = project(points[i], points[i + 1], points[i + 2])
        if (k === from) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      const t = (b + 1) / BUCKETS
      ctx.strokeStyle = `hsla(${hue(trail.hueBase, t, time)}, ${SATURATION}%, ${LIGHTNESS}%, ${0.28 * t * t})`
      ctx.stroke()
    }

    const i = ((head - 1 + TRAIL) % TRAIL) * 3
    const [hx, hy] = project(points[i], points[i + 1], points[i + 2])
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10)
    const headHue = hue(trail.hueBase, 1, time)
    glow.addColorStop(0, `hsla(${headHue}, ${SATURATION}%, ${LIGHTNESS}%, 0.55)`)
    glow.addColorStop(1, `hsla(${headHue}, ${SATURATION}%, ${LIGHTNESS}%, 0)`)
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(hx, hy, 10, 0, Math.PI * 2)
    ctx.fill()
  }
}

function animate(time) {
  for (const trail of trails) {
    for (let i = 0; i < STEPS_PER_FRAME; i++) advance(trail)
  }
  draw(time)
  requestAnimationFrame(animate)
}

window.addEventListener('resize', () => {
  resize()
  if (reduceMotion) draw(0)
})

resize()
if (reduceMotion) draw(0)
else requestAnimationFrame(animate)
