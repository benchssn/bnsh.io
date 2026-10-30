/**
 * alignment.js — Relative phase and alignment (Iteration 4).
 *
 * Two views of the same instant:
 *
 * 1. Orrery (heliocentric, seen from the north ecliptic pole). A synodic
 *    phase is a *relative* phase: the angle at the Sun between Earth and a
 *    planet. The line through the Sun and Earth is the alignment axis: a
 *    planet on it, on Earth's side, is at opposition (or inferior
 *    conjunction); on the far side, at conjunction. Distances are drawn on a
 *    square-root scale so Mercury and Saturn fit together; directions are true.
 *
 * 2. Ecliptic ring (geocentric). Ecliptic longitudes of the Sun, Moon and
 *    planets as seen from Earth. Bodies close in longitude are in
 *    conjunction. The arc from Sun to Moon is the lunar phase seen as a
 *    relative angle. The Moon's nodes are marked with the eclipse seasons
 *    around them: an eclipse needs a new or full moon while the Sun is within
 *    ~18° of a node.
 *
 * Both views use the astronomical orientation: longitude 0° (the March
 * equinox direction, γ) to the right, increasing counter-clockwise.
 */

import { el, setAttrs, moonGlyph } from '../svg.js';
import { PLANETS, heliocentric, orbitPoints, geocentric } from '../planets.js';
import { moonState } from '../lunar.js';
import { DAY_MS, DELTA_T_MS, sunEphemeris } from '../solar.js';
import { nextEvent } from '../cycles.js';
import { GLYPH, SIGNS } from '../esoterica.js';

const DEG = Math.PI / 180;
const mod360 = (x) => ((x % 360) + 360) % 360;
const ORRERY_SCALE = 60; // px per √AU
const RING = 150;
const ECLIPSE_LIMIT = 18.5; // degrees: Sun–node distance within which a solar eclipse is possible
const ECLIPSE_YEAR_DAYS = 346.62; // Sun returns to the same node
const CLOSE_PAIR = 8; // degrees

/** Screen point for ecliptic longitude λ (degrees) at radius r. */
const eclPoint = (λ, r) => [r * Math.cos(λ * DEG), -r * Math.sin(λ * DEG)];

/** Counter-clockwise arc from λ1 to λ2 (increasing longitude). */
function eclArc(λ1, λ2, r) {
  const span = mod360(λ2 - λ1);
  const [x1, y1] = eclPoint(λ1, r);
  const [x2, y2] = eclPoint(λ2, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 0 ${x2} ${y2}`;
}

/** Orrery projection: heliocentric (x, y) in AU → square-root-scaled screen point. */
function orreryPoint({ x, y }) {
  const rho = Math.hypot(x, y);
  const s = (ORRERY_SCALE * Math.sqrt(rho)) / rho;
  return [x * s, -y * s];
}

function buildOrrery(svg, t) {
  svg.setAttribute('viewBox', '-215 -215 430 430');
  const axis = el('line', { class: 'al-axis' }, svg);
  for (const id of ['earth', ...PLANETS.map((p) => p.id)]) {
    const d = orbitPoints(id, t).map((pt, i) => `${i ? 'L' : 'M'} ${orreryPoint(pt).join(' ')}`).join(' ') + ' Z';
    el('path', { d, class: `al-orbit orbit-${id}` }, svg);
  }
  const [gx, gy] = [208, 0];
  el('line', { x1: gx - 10, y1: gy, x2: gx, y2: gy, class: 'al-gamma' }, svg);
  el('text', { x: gx - 2, y: gy - 9, class: 'al-gamma-label', 'text-anchor': 'end' }, svg).textContent = 'γ 0°';
  el('circle', { r: 8, class: 'al-sun', filter: 'url(#cc-glow)' }, svg);

  const bodies = {};
  for (const b of [{ id: 'earth' }, ...PLANETS]) {
    const g = el('g', { class: `al-body body-${b.id}` }, svg);
    el('circle', { r: b.id === 'earth' ? 5 : 4.5 }, g);
    el('text', { x: 9, y: -9, class: 'al-body-label glyph' }, g).textContent = GLYPH[b.id];
    bodies[b.id] = g;
  }
  return {
    update(t) {
      const earth = heliocentric('earth', t);
      const [ex, ey] = orreryPoint(earth);
      const len = Math.hypot(ex, ey);
      setAttrs(axis, { x1: (-ex / len) * 205, y1: (-ey / len) * 205, x2: (ex / len) * 205, y2: (ey / len) * 205 });
      bodies.earth.setAttribute('transform', `translate(${ex} ${ey})`);
      for (const p of PLANETS) {
        const [x, y] = orreryPoint(heliocentric(p.id, t));
        bodies[p.id].setAttribute('transform', `translate(${x} ${y})`);
      }
    },
  };
}

function buildRing(svg) {
  svg.setAttribute('viewBox', '-215 -215 430 430');
  el('circle', { r: RING, class: 'al-ring' }, svg);
  const seasons = [el('path', { class: 'al-eclipse-zone' }, svg), el('path', { class: 'al-eclipse-zone' }, svg)];
  for (let λ = 0; λ < 360; λ += 10) {
    const major = λ % 30 === 0;
    const [x1, y1] = eclPoint(λ, RING + 3);
    const [x2, y2] = eclPoint(λ, RING + (major ? 12 : 7));
    el('line', { x1, y1, x2, y2, class: major ? 'al-tick major' : 'al-tick' }, svg);
    if (major) {
      const [x, y] = eclPoint(λ, RING + 26);
      el('text', { x, y, class: 'al-degree', 'text-anchor': 'middle' }, svg).textContent = `${λ}°`;
      // The sign occupying the next 30° of longitude (tropical zodiac).
      const [gx, gy] = eclPoint(λ + 15, RING + 24);
      const sign = el('text', { x: gx, y: gy, class: 'al-sign glyph', 'text-anchor': 'middle' }, svg);
      sign.textContent = SIGNS[λ / 30].glyph;
      el('title', {}, sign).textContent = `${SIGNS[λ / 30].name}: ecliptic longitude ${λ}°–${λ + 30}°`;
    }
  }
  const nodes = [el('line', { class: 'al-node' }, svg), el('line', { class: 'al-node' }, svg)];
  const nodeGlyphs = [GLYPH.ascendingNode, GLYPH.descendingNode].map((g) => {
    const text = el('text', { class: 'al-node-glyph glyph', 'text-anchor': 'middle' }, svg);
    text.textContent = g;
    return text;
  });
  const elongArc = el('path', { class: 'al-elong' }, svg);
  const elongText = el('text', { class: 'al-elong-label', 'text-anchor': 'middle' }, svg);

  const sun = el('circle', { r: 9, class: 'al-sun', filter: 'url(#cc-glow)' }, svg);
  const moon = moonGlyph(svg, 8, 'al-moon');
  const planets = {};
  for (const p of PLANETS) {
    const g = el('g', { class: `al-body body-${p.id}` }, svg);
    const dot = el('circle', { r: 4.5 }, g);
    const label = el('text', { class: 'al-body-label glyph', 'text-anchor': 'middle' }, g);
    label.textContent = GLYPH[p.id];
    planets[p.id] = { dot, label };
  }

  return {
    update(t, sky) {
      const { sunλ, moon: m, planets: pl } = sky;
      // Eclipse seasons around each node; node markers.
      [m.node, m.node + 180].forEach((λn, i) => {
        seasons[i].setAttribute('d', eclArc(λn - ECLIPSE_LIMIT, λn + ECLIPSE_LIMIT, RING));
        const [x1, y1] = eclPoint(λn, RING - 12);
        const [x2, y2] = eclPoint(λn, RING + 12);
        setAttrs(nodes[i], { x1, y1, x2, y2 });
        const [gx, gy] = eclPoint(λn, RING + 44); // outside the ring, clear of planet labels
        setAttrs(nodeGlyphs[i], { x: gx, y: gy });
      });
      // Sun → Moon elongation: the lunar phase as a relative angle.
      elongArc.setAttribute('d', eclArc(sunλ, m.longitude, 108));
      const [lx, ly] = eclPoint(sunλ + m.elongation / 2, 90);
      setAttrs(elongText, { x: lx, y: ly });
      elongText.textContent = `${m.elongation.toFixed(0)}°`;

      const [sx, sy] = eclPoint(sunλ, RING);
      setAttrs(sun, { cx: sx, cy: sy });
      moon.moveTo(...eclPoint(m.longitude, RING));
      moon.set(m.illuminated, m.elongation < 180);

      // Planets: labels inside the ring, staggered when bodies crowd together.
      const order = PLANETS.map((p) => ({ p, λ: pl[p.id].longitude })).sort((a, b) => a.λ - b.λ);
      let prev = -Infinity;
      let level = 0;
      for (const { p, λ } of order) {
        level = λ - prev < 9 ? level + 1 : 0;
        prev = λ;
        const [x, y] = eclPoint(λ, RING);
        setAttrs(planets[p.id].dot, { cx: x, cy: y });
        const [tx, ty] = eclPoint(λ, RING - 20 - level * 13);
        setAttrs(planets[p.id].label, { x: tx, y: ty });
      }
    },
  };
}

/** Everything both views and the lists need about the sky at t. */
function skyAt(t) {
  const planets = Object.fromEntries(PLANETS.map((p) => [p.id, geocentric(p.id, t)]));
  return { sunλ: sunEphemeris(t + DELTA_T_MS).eclipticLongitude, moon: moonState(t), planets };
}

function closePairs(sky) {
  const bodies = [
    { name: 'Sun', glyph: GLYPH.sun, λ: sky.sunλ },
    { name: 'Moon', glyph: GLYPH.moon, λ: sky.moon.longitude },
    ...PLANETS.map((p) => ({ name: p.name, glyph: GLYPH[p.id], λ: sky.planets[p.id].longitude })),
  ];
  const pairs = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const d = Math.abs(mod360(bodies[i].λ - bodies[j].λ + 180) - 180);
      if (d < CLOSE_PAIR) pairs.push({ a: bodies[i], b: bodies[j], d });
    }
  }
  return pairs.sort((x, y) => x.d - y.d);
}

function eclipseSeason(sky) {
  const toAsc = Math.abs(mod360(sky.sunλ - sky.moon.node + 180) - 180);
  const toDesc = Math.abs(mod360(sky.sunλ - sky.moon.node) - 180);
  const d = Math.min(toAsc, toDesc);
  const which = toAsc < toDesc ? 'ascending' : 'descending';
  if (d < ECLIPSE_LIMIT) {
    return `The Sun is ${d.toFixed(1)}° from the Moon's ${which} node. This is an eclipse season, so a new or full moon now can produce an eclipse.`;
  }
  // The Sun approaches the next node at 360°/eclipse year relative to the regressing node.
  const ahead = mod360(sky.moon.node - sky.sunλ) % 180; // degrees to the next node the Sun will reach
  const days = (ahead - ECLIPSE_LIMIT) * (ECLIPSE_YEAR_DAYS / 360);
  return `The Sun is ${d.toFixed(1)}° from the nearest lunar node. The next eclipse season begins in about ${Math.max(0, days).toFixed(0)} days.`;
}

export function createAlignment({ orrerySvg, ringSvg, pairsList, seasonText, upcomingList }, t, cycles) {
  const orrery = buildOrrery(orrerySvg, t);
  const ring = buildRing(ringSvg);
  let orbitsDrawnAt = t;

  return {
    update(t, withText, formatters) {
      // Orbits precess slowly; redraw only if time has jumped by decades.
      if (Math.abs(t - orbitsDrawnAt) > 20 * 365.25 * DAY_MS) {
        orrerySvg.replaceChildren();
        Object.assign(orrery, buildOrrery(orrerySvg, t));
        orbitsDrawnAt = t;
      }
      const sky = skyAt(t);
      orrery.update(t);
      ring.update(t, sky);
      if (!withText) return;

      const pairs = closePairs(sky);
      pairsList.innerHTML = pairs.length
        ? pairs
            .map(({ a, b, d }) => `<li><span><span class="glyph" aria-hidden="true">${a.glyph} ☌\uFE0E ${b.glyph}</span>&ensp;${a.name} · ${b.name}</span><span class="num">${d.toFixed(1)}°</span></li>`)
            .join('')
        : `<li class="none">No two bodies within ${CLOSE_PAIR}° of longitude</li>`;
      seasonText.textContent = eclipseSeason(sky);

      const upcoming = cycles
        .filter((c) => c.id !== 'day' && c.id !== 'draconic')
        .map((c) => ({ c, next: nextEvent(c, t) }))
        .sort((a, b) => a.next.time - b.next.time);
      upcomingList.innerHTML = upcoming
        .map(({ c, next }) => {
          const name = c.kind === 'planetary' ? `${c.name} · ${next.event.name.toLowerCase()}` : next.event.name;
          return `<li><span>${name}</span><span class="num">${formatters.date.format(next.time)}</span></li>`;
        })
        .join('');
    },
  };
}
