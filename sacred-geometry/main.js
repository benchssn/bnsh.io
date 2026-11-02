// Flower of Life base, with a cube floating inside a star tetrahedron above it.
// Everything breathes and drifts on Perlin noise.
import './style.css'
import p5 from 'p5'

const R = 48 // flower-of-life circle radius
const STAR = 92 // star tetrahedron half-extent (its points sit on a cube of this size)
const BASE_Y = 170 // height of the flower plane (p5's y axis points down)
const SEGMENTS = 96 // points per circle
const MOTE_COUNT = 160

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

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const sketch = p => {
  const flowerCenters = []
  const motes = []
  let paused = reduceMotion
  let t = 0
  let starSpin = 0
  let cubeSpinX = 0
  let cubeSpinY = 0

  p.setup = () => {
    p.createCanvas(window.innerWidth, window.innerHeight, p.WEBGL)
    p.setAttributes('antialias', true)
    p.colorMode(p.HSB, 360, 100, 100, 100)
    p.noiseDetail(4, 0.45)

    // 19 circles on a hex lattice (axial coords within distance 2 of the center)
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) > 2) continue
        flowerCenters.push(p.createVector(R * (q + r / 2), R * r * Math.sqrt(3) / 2))
      }
    }

    for (let i = 0; i < MOTE_COUNT; i++) motes.push(newMote(true))
  }

  p.draw = () => {
    if (!paused) {
      t += 0.004
      starSpin += 0.004 + (p.noise(t, 300) - 0.5) * 0.02
      cubeSpinX += (p.noise(t * 0.9, 400) - 0.5) * 0.03
      cubeSpinY -= 0.006 + (p.noise(t * 0.9, 500) - 0.5) * 0.02
    }

    p.blendMode(p.BLEND)
    p.background(235, 50, 5)
    // Additive glow with no depth sorting: overlapping lines brighten instead of occluding
    p.drawingContext.disable(p.drawingContext.DEPTH_TEST)
    p.blendMode(p.ADD)

    p.orbitControl(1, 1, 0.3)
    // in portrait the caption covers the lower screen, so lift the scene clear of it
    if (p.height > p.width) p.translate(0, -p.height * 0.1)
    p.scale(Math.min(p.width, p.height) / 820)
    p.rotateX(-0.42 + (p.noise(t * 0.5, 100) - 0.5) * 0.25)
    p.rotateY(t * 0.5 + (p.noise(t * 0.3, 200) - 0.5) * 1.5)

    drawFlower()
    drawBeam()
    drawStar()
    drawMotes()
  }

  // ---------- Flower of Life ----------

  function drawFlower() {
    p.push()
    p.translate(0, BASE_Y, 0)
    p.rotateX(p.HALF_PI)
    p.noFill()

    flowerCenters.forEach((c, i) => {
      // brightness ripples outward from the center, shaped by noise
      const d = c.mag() / (2 * R)
      const pulse = p.noise(c.x * 0.012 + 3, c.y * 0.012 + 3, t * 2.0 - d * 0.6)
      const hue = (195 + pulse * 110 + t * 25) % 360
      glowLoop(c.x, c.y, R, hue, 35 + pulse * 65, i)
    })

    const outerHue = (215 + p.noise(t, 700) * 80 + t * 25) % 360
    glowLoop(0, 0, R * 3, outerHue, 80, 50)
    glowLoop(0, 0, R * 3.14, outerHue, 45, 51)
    p.pop()
  }

  function glowLoop(cx, cy, r, hue, bright, seed) {
    const pts = []
    for (let k = 0; k <= SEGMENTS; k++) {
      const a = (k / SEGMENTS) * p.TWO_PI
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      // sampling noise around a circle keeps the loop seamless
      const n = p.noise(seed * 7.3 + ca * 0.9 + 10, sa * 0.9 + 10, t * 1.2)
      const rr = r * (1 + (n - 0.5) * 0.12)
      pts.push([cx + ca * rr, cy + sa * rr])
    }
    p.strokeWeight(5)
    p.stroke(hue, 80, bright, 10)
    polyline(pts)
    p.strokeWeight(1.3)
    p.stroke(hue, 35, 100, bright * 0.85)
    polyline(pts)
  }

  function polyline(pts) {
    p.beginShape()
    for (const [x, y] of pts) p.vertex(x, y, 0)
    p.endShape()
  }

  // ---------- Light beam between base and star ----------

  function drawBeam() {
    const glow = p.noise(t * 3, 900)
    for (let i = 0; i < 3; i++) {
      p.strokeWeight(1 + i * 4)
      p.stroke(45, 30, 100, (8 - i * 2.5) * (0.4 + glow))
      p.line(0, BASE_Y, 0, 0, starY() + STAR * 0.6, 0)
    }
  }

  // ---------- Star tetrahedron with inner cube ----------

  function starY() {
    return -95 + (p.noise(t * 0.8, 50) - 0.5) * 60
  }

  function drawStar() {
    p.push()
    p.translate(0, starY(), 0)
    p.rotateY(starSpin)
    p.rotateX((p.noise(t * 0.6, 60) - 0.5) * 0.5)
    p.rotateZ((p.noise(t * 0.6, 70) - 0.5) * 0.5)
    // stand the star on a point: align the (1,1,1) diagonal with the vertical axis
    p.rotateZ(-p.HALF_PI - Math.atan2(1, Math.sqrt(2)))
    p.rotateY(p.QUARTER_PI)

    const hueA = (190 + p.noise(t, 800) * 90 + t * 30) % 360
    const hueB = (hueA + 150) % 360
    drawTetra(TET_A, hueA, 0)
    drawTetra(TET_B, hueB, 4)
    drawCube((hueA + 75) % 360)
    p.pop()
  }

  function displaced(v, seed, size, amount) {
    const s = size * (1 + (p.noise(seed * 3.1, t * 1.3) - 0.5) * amount)
    return [v[0] * s, v[1] * s, v[2] * s]
  }

  function drawTetra(base, hue, seedOffset) {
    const pts = base.map((v, i) => displaced(v, i + seedOffset, STAR, 0.4))

    p.noStroke()
    p.fill(hue, 70, 55, 7)
    p.beginShape(p.TRIANGLES)
    for (const f of TET_FACES) for (const i of f) p.vertex(...pts[i])
    p.endShape()

    glowEdges(pts, TET_EDGES, hue)

    p.strokeWeight(6)
    p.stroke(hue, 20, 100, 70)
    for (const v of pts) p.point(...v)
  }

  function drawCube(hue) {
    p.push()
    p.rotateX(cubeSpinX)
    p.rotateY(cubeSpinY)
    const size = STAR * 0.4 * (1 + (p.noise(t * 1.5, 1000) - 0.5) * 0.25)
    const pts = CUBE_V.map((v, i) => displaced(v, i + 20, size, 0.15))

    p.noStroke()
    p.fill(hue, 60, 70, 9)
    for (const f of CUBE_FACES) {
      p.beginShape()
      for (const i of f) p.vertex(...pts[i])
      p.endShape(p.CLOSE)
    }

    glowEdges(pts, CUBE_E, hue)

    p.strokeWeight(5)
    p.stroke(hue, 15, 100, 80)
    for (const v of pts) p.point(...v)
    p.pop()
  }

  function glowEdges(pts, edges, hue) {
    p.strokeWeight(7)
    p.stroke(hue, 85, 80, 9)
    for (const [a, b] of edges) p.line(...pts[a], ...pts[b])
    p.strokeWeight(1.6)
    p.stroke(hue, 30, 100, 85)
    for (const [a, b] of edges) p.line(...pts[a], ...pts[b])
  }

  // ---------- Drifting motes riding a noise flow field ----------

  function newMote(anywhere) {
    const a = p.random(p.TWO_PI)
    const r = Math.sqrt(p.random()) * R * 3
    return {
      x: Math.cos(a) * r,
      y: anywhere ? p.random(-260, BASE_Y) : BASE_Y,
      z: Math.sin(a) * r,
      life: p.random(0.3, 1),
    }
  }

  function drawMotes() {
    const k = 0.006
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i]
      if (!paused) {
        m.x += (p.noise(m.x * k, m.y * k, t + 10) - 0.5) * 2.2
        m.z += (p.noise(m.x * k, m.y * k, t + 20) - 0.5) * 2.2
        m.y -= 0.25 + p.noise(m.z * k, t + 30) * 0.7
        if (m.y < -280 || m.x * m.x + m.z * m.z > (R * 3.6) ** 2) motes[i] = newMote(false)
      }
      const fade = p.constrain(p.map(m.y, BASE_Y, BASE_Y - 40, 0, 1), 0, 1)
        * p.constrain(p.map(m.y, -280, -180, 0, 1), 0, 1)
      p.strokeWeight(2.5)
      p.stroke((200 + i * 0.6 + t * 30) % 360, 40, 100, 60 * fade * m.life)
      p.point(m.x, m.y, m.z)
    }
  }

  // ---------- Interaction ----------

  p.keyPressed = () => {
    if (p.key === ' ') paused = !paused
    if (p.key === 's' || p.key === 'S') p.saveCanvas('sacred-geometry', 'png')
  }

  p.windowResized = () => {
    p.resizeCanvas(window.innerWidth, window.innerHeight)
  }
}

new p5(sketch, document.querySelector('#scene'))
