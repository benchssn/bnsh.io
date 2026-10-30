/**
 * torus.js — Phase portrait of two cycles (Iteration 5, extended).
 *
 * Two phases (φ_A, φ_B), each taken modulo 1, define a point on a torus:
 * φ_A runs around the ring, φ_B around the tube. As time passes the point
 * winds around the torus with slope T_A/T_B.
 *   • If the ratio were rational, p/q, the path would close after q turns.
 *   • Astronomical ratios are not rational, so the path never closes and
 *     gradually covers the whole surface. This is quasi-periodic motion.
 *   • Near-commensurabilities show up as strands that almost overlap.
 *
 * The amber circle is the section φ_A = 0. The points where the path crosses
 * it are exactly the stroboscope samples: a Poincaré section of the flow.
 *
 * Two drawings of the same data:
 *   • a rotating 3-D torus (drag to turn it), with depth shown by fading;
 *   • the flat torus, the unit square whose opposite edges are identified.
 * Tube orientation follows the dial convention: φ_B = ½ on top of the tube,
 * φ_B = 0 underneath.
 */

const TAU = 2 * Math.PI;
const RING = 1;
const TUBE = 0.42;
const BUCKETS = 7; // depth-sorted alpha levels

function cssColor(cls, fallback) {
  const probe = document.createElement('span');
  probe.className = cls;
  document.body.appendChild(probe);
  const value = getComputedStyle(probe).getPropertyValue('--cc').trim();
  probe.remove();
  return value || fallback;
}

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { width } = canvas.getBoundingClientRect();
  const size = Math.max(1, Math.round(width * dpr));
  if (canvas.width !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  return size;
}

/** Point on the torus for phases (a, b). */
function torusPoint(a, b) {
  const u = TAU * a;
  const v = TAU * b - Math.PI / 2; // b = ½ on top of the tube
  const w = RING + TUBE * Math.cos(v);
  return [w * Math.cos(u), w * Math.sin(u), TUBE * Math.sin(v)];
}

export function createTorus(canvas3d, canvasFlat) {
  let data = null; // { points: [[a,b],…], section: [b,…], colour }
  let spin = -0.6;
  let tilt = 1.05; // radians from edge-on
  let dragging = null;
  let visible = true;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Fixed wireframe: meridians (constant φ_A) and parallels (constant φ_B).
  const wire = [];
  for (let i = 0; i < 16; i++) wire.push(Array.from({ length: 49 }, (_, k) => torusPoint(i / 16, k / 48)));
  for (const b of [0, 0.25, 0.5, 0.75]) wire.push(Array.from({ length: 97 }, (_, k) => torusPoint(k / 96, b)));
  const section = Array.from({ length: 65 }, (_, k) => torusPoint(0, k / 64));

  function project(size) {
    const [cs, ss, ct, st] = [Math.cos(spin), Math.sin(spin), Math.cos(tilt), Math.sin(tilt)];
    const scale = size * 0.3;
    const centre = size / 2;
    return ([x, y, z]) => {
      const x1 = x * cs - y * ss;
      const y1 = x * ss + y * cs;
      const depth = y1 * ct - z * st; // larger = farther
      const up = y1 * st + z * ct;
      const f = 4 / (4 + depth);
      return [centre + scale * x1 * f, centre - scale * up * f, depth];
    };
  }

  /** Stroke a polyline with per-segment alpha by depth (bucketed into a few paths). */
  function strokeDepth(ctx, pts, colour, width, alphaNear, alphaFar) {
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0, d0] = pts[i - 1];
      const [x1, y1, d1] = pts[i];
      const k = Math.max(0, Math.min(BUCKETS - 1, Math.floor((((d0 + d1) / 2 + 1.45) / 2.9) * BUCKETS)));
      paths[k].moveTo(x0, y0);
      paths[k].lineTo(x1, y1);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    paths.forEach((p, k) => {
      ctx.globalAlpha = alphaNear + ((alphaFar - alphaNear) * k) / (BUCKETS - 1);
      ctx.stroke(p);
    });
    ctx.globalAlpha = 1;
  }

  function draw3d() {
    const size = fitCanvas(canvas3d);
    const ctx = canvas3d.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const P = project(size);
    const px = size / 600; // line widths scale with canvas size

    for (const line of wire) strokeDepth(ctx, line.map(P), 'rgb(233,228,216)', 0.8 * px, 0.13, 0.03);
    if (data) strokeDepth(ctx, data.points.map(([a, b]) => P(torusPoint(a, b))), data.colour, 1.1 * px, data.alpha, data.alpha * 0.15);
    strokeDepth(ctx, section.map(P), '#f4b860', 1.6 * px, 0.9, 0.25);

    if (data) {
      ctx.fillStyle = '#ffd58f';
      ctx.shadowColor = '#f4b860';
      ctx.shadowBlur = 6 * px;
      for (const b of data.section) {
        const [x, y, d] = P(torusPoint(0, b));
        ctx.globalAlpha = d < 0 ? 1 : 0.35;
        ctx.beginPath();
        ctx.arc(x, y, 2.4 * px, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  function drawFlat() {
    const size = fitCanvas(canvasFlat);
    const ctx = canvasFlat.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const px = size / 400;
    const m = 34 * px;
    const w = size - 2 * m;
    const X = (a) => m + a * w;
    const Y = (b) => m + (1 - b) * w;

    // Frame and quarter lines; opposite edges are the same place on the torus.
    ctx.strokeStyle = 'rgba(233,228,216,0.12)';
    ctx.lineWidth = px;
    for (const q of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(X(q), Y(0));
      ctx.lineTo(X(q), Y(1));
      ctx.moveTo(X(0), Y(q));
      ctx.lineTo(X(1), Y(q));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(233,228,216,0.28)';
    ctx.strokeRect(X(0), Y(1), w, w);
    ctx.strokeStyle = '#f4b860';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(0), Y(1));
    ctx.moveTo(X(1), Y(0));
    ctx.lineTo(X(1), Y(1));
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (data) {
      ctx.strokeStyle = data.colour;
      ctx.globalAlpha = data.alpha * 0.6;
      ctx.lineWidth = 0.9 * px;
      ctx.beginPath();
      data.points.forEach(([a, b], i) => {
        const prev = data.points[i - 1];
        const jump = !prev || Math.abs(a - prev[0]) > 0.5 || Math.abs(b - prev[1]) > 0.5;
        if (jump) ctx.moveTo(X(a), Y(b));
        else ctx.lineTo(X(a), Y(b));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd58f';
      for (const b of data.section) {
        ctx.beginPath();
        ctx.arc(X(0), Y(b), 2.2 * px, 0, TAU);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(233,228,216,0.45)';
    ctx.font = `${11 * px}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(data ? `phase of ${data.nameA} →` : '', X(0.5), size - 10 * px);
    ctx.save();
    ctx.translate(13 * px, Y(0.5));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(data ? `phase of ${data.nameB} →` : '', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillText('0', X(0) - 4 * px, Y(0) + 14 * px);
    ctx.textAlign = 'right';
    ctx.fillText('1', X(1) + 4 * px, Y(0) + 14 * px);
  }

  function loop() {
    if (visible && !dragging && !reduceMotion) {
      spin += 0.0025;
      draw3d();
    }
    requestAnimationFrame(loop);
  }

  // Drag to turn: horizontal spins, vertical tilts.
  canvas3d.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY, spin, tilt };
    canvas3d.setPointerCapture(e.pointerId);
  });
  canvas3d.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    spin = dragging.spin + (e.clientX - dragging.x) * 0.01;
    tilt = Math.max(0.15, Math.min(1.5, dragging.tilt + (e.clientY - dragging.y) * 0.01));
    draw3d();
  });
  const release = () => (dragging = null);
  canvas3d.addEventListener('pointerup', release);
  canvas3d.addEventListener('pointercancel', release);

  // Only animate while on screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(canvas3d);
  }
  window.addEventListener('resize', () => {
    draw3d();
    drawFlat();
  });
  requestAnimationFrame(loop);

  return {
    /**
     * @param {object} d
     * @param {[number, number][]} d.points   trajectory (φ_A, φ_B)
     * @param {number[]} d.section            φ_B at each φ_A = 0 crossing
     * @param {string} d.idB                  cycle id of B (for its colour)
     * @param {number} d.windings             number of turns of the faster phase
     * @param {string} d.nameA
     * @param {string} d.nameB
     */
    set(d) {
      // Dense windings would saturate to a solid surface; thin the line as
      // the number of windings grows so the strands stay distinguishable.
      const alpha = Math.min(0.9, 0.12 + 30 / Math.max(1, d.windings));
      data = { ...d, alpha, colour: cssColor(`cycle-${d.idB}`, '#d3d9e6') };
      draw3d();
      drawFlat();
    },
  };
}
