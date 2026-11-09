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

let width, height, dpr, scale, cx, cy

function step(s) {
  const dx = SIGMA * (s.y - s.x)
  const dy = s.x * (RHO - s.z) - s.y
  const dz = s.x * s.y - BETA * s.z
  s.x += dx * DT
  s.y += dy * DT
  s.z += dz * DT
}

function createTrail(seed, warmup, color) {
  const s = { ...seed }
  for (let i = 0; i < warmup; i++) step(s)
  const trail = { s, color, points: new Float32Array(TRAIL * 3), head: 0, count: 0 }
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

// Trail colours (rgb), line alpha and line width for each homepage style
const THEMES = {
  0: { colors: ['214, 222, 236', '170, 186, 214', '236, 232, 224'], alpha: 0.28, width: 0.9 },
  1: { colors: ['29, 27, 24', '200, 67, 43', '70, 90, 120'], alpha: 0.5, width: 1.1 },
  2: { colors: ['120, 220, 255', '255, 140, 200', '190, 170, 255'], alpha: 0.4, width: 1.2 },
  3: { colors: ['255, 240, 200', '255, 90, 150', '255, 225, 60'], alpha: 0.6, width: 1.5 }
}
let theme = THEMES[0]

const trails = [
  createTrail({ x: 0.1, y: 0, z: 0 }, 2000, 0),
  createTrail({ x: -6, y: 4, z: 22 }, 3500, 1),
  createTrail({ x: 3, y: -8, z: 30 }, 5000, 2)
]

// Style switcher: ?style=1|2|3 (or the buttons) picks a look; remembered between visits
const root = document.documentElement
const switchButtons = document.querySelectorAll('.style-switch button')
function setStyle(id) {
  if (!THEMES[id]) id = '1'
  root.dataset.style = id
  theme = THEMES[id]
  switchButtons.forEach((b) => b.classList.toggle('on', b.dataset.style === String(id)))
  try { localStorage.setItem('bnsh-style', id) } catch {}
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  document.querySelector('meta[name="theme-color"]').content = bg
  if (reduceMotion && width) draw(0)
}
switchButtons.forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)))

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

  ctx.lineWidth = theme.width
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
      ctx.strokeStyle = `rgba(${theme.colors[trail.color]}, ${theme.alpha * t * t})`
      ctx.stroke()
    }

    const i = ((head - 1 + TRAIL) % TRAIL) * 3
    const [hx, hy] = project(points[i], points[i + 1], points[i + 2])
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 10)
    glow.addColorStop(0, `rgba(${theme.colors[trail.color]}, 0.55)`)
    glow.addColorStop(1, `rgba(${theme.colors[trail.color]}, 0)`)
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

let saved = null
try { saved = localStorage.getItem('bnsh-style') } catch {}
setStyle(new URLSearchParams(location.search).get('style') ?? saved ?? '1')

resize()
if (reduceMotion) draw(0)
else requestAnimationFrame(animate)
