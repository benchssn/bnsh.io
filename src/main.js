
import './style.css'

const canvas = document.querySelector('#field')
const ctx = canvas.getContext('2d')

let width, height, particles = []
const mouse = { x: -1000, y: -1000 }
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function resize() {
  width = canvas.width = window.innerWidth
  height = canvas.height = window.innerHeight

  particles = Array.from({ length: Math.min(110, Math.floor(width / 12)) }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    radius: Math.random() * 1.5 + 0.5
  }))
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
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fill()
  }

  if (!reduceMotion) requestAnimationFrame(animate)
}

resize()
animate()