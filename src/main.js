import './style.css'

const canvas = document.querySelector('#field')
const ctx = canvas.getContext('2d')
const lorenzCanvas = document.querySelector('.lorenz-preview')
const lorenzCtx = lorenzCanvas ? lorenzCanvas.getContext('2d') : null

let width, height, particles = []
const mouse = { x: -1000, y: -1000 }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const LORENZ = {
  sigma: 10,
  rho: 28,
  beta: 8 / 3,
  x: 0.1,
  y: 0,
  z: 0,
}

function resize() {
  width = canvas.width = window.innerWidth
  height = canvas.height = window.innerHeight

  particles = Array.from({ length: Math.min(70, Math.floor(width / 18)) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.25,
    radius: Math.random() * 1.2 + 0.5
  }))

  if (lorenzCanvas) {
    const rect = lorenzCanvas.getBoundingClientRect()
    lorenzCanvas.width = Math.max(220, Math.floor(rect.width * (window.devicePixelRatio || 1)))
    lorenzCanvas.height = Math.max(120, Math.floor(rect.height * (window.devicePixelRatio || 1)))
  }
}

window.addEventListener('resize', resize)
window.addEventListener('pointermove', e => {
  mouse.x = e.clientX
  mouse.y = e.clientY
})
window.addEventListener('pointerleave', () => {
  mouse.x = -1000
  mouse.y = -1000
})

function stepLorenz(dt) {
  if (!lorenzCtx || !lorenzCanvas) return
  const dx = LORENZ.sigma * (LORENZ.y - LORENZ.x)
  const dy = LORENZ.x * (LORENZ.rho - LORENZ.z) - LORENZ.y
  const dz = LORENZ.x * LORENZ.y - LORENZ.beta * LORENZ.z

  LORENZ.x += dx * dt
  LORENZ.y += dy * dt
  LORENZ.z += dz * dt
}

function drawLorenz() {
  if (!lorenzCtx || !lorenzCanvas) return

  const w = lorenzCanvas.width
  const h = lorenzCanvas.height
  lorenzCtx.clearRect(0, 0, w, h)

  const pts = []
  for (let i = 0; i < 160; i++) {
    stepLorenz(0.006)
    pts.push({
      x: LORENZ.x,
      y: LORENZ.y,
      z: LORENZ.z,
    })
  }

  lorenzCtx.beginPath()
  pts.forEach((p, index) => {
    const x = (p.x * 6) + (w * 0.5)
    const y = (p.z * 4) + (h * 0.52)
    if (index === 0) lorenzCtx.moveTo(x, y)
    else lorenzCtx.lineTo(x, y)
  })
  lorenzCtx.strokeStyle = 'rgba(132, 182, 255, 0.9)'
  lorenzCtx.lineWidth = 1.5
  lorenzCtx.stroke()

  const head = pts[pts.length - 1]
  const hx = (head.x * 6) + (w * 0.5)
  const hy = (head.z * 4) + (h * 0.52)
  const gradient = lorenzCtx.createRadialGradient(hx, hy, 0, hx, hy, 18)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.3, 'rgba(123, 198, 255, 0.9)')
  gradient.addColorStop(1, 'rgba(123, 198, 255, 0)')
  lorenzCtx.fillStyle = gradient
  lorenzCtx.beginPath()
  lorenzCtx.arc(hx, hy, 18, 0, Math.PI * 2)
  lorenzCtx.fill()
}

function animate() {
  ctx.clearRect(0, 0, width, height)

  for (const p of particles) {
    const dx = p.x - mouse.x
    const dy = p.y - mouse.y
    const distance = Math.hypot(dx, dy)

    if (!reduceMotion) {
      if (distance < 150 && distance > 0) {
        p.x += (dx / distance) * 0.7
        p.y += (dy / distance) * 0.7
      }

      p.x += p.vx
      p.y += p.vy

      if (p.x < 0) p.x = width
      if (p.x > width) p.x = 0
      if (p.y < 0) p.y = height
      if (p.y > height) p.y = 0
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fill()
  }

  drawLorenz()

  if (!reduceMotion) requestAnimationFrame(animate)
}

resize()
animate()