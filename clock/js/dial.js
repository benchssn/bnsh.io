/**
 * dial.js — The SVG 24-hour solar dial.
 *
 * Geometry: the dial is a map of *apparent solar phase* p ∈ [0, 1) to angle.
 * Solar noon (p = 0.5) is at the top, solar midnight (p = 0) at the bottom,
 * and the Sun travels clockwise — morning on the left (east), evening on the
 * right (west), as seen facing the equator from the northern hemisphere.
 *
 * A second, outer scale shows civil clock hours. It is rotated by the offset
 * between civil and apparent solar time (longitude within the zone, daylight
 * saving, equation of time), which makes the gap between clock noon and solar
 * noon directly visible.
 *
 * Two traditional layers sit on the solar scale: the planetary hours (twelve
 * unequal hours of daylight and twelve of night, each with its Chaldean
 * ruler) and a faint heptagram. The heptagram's seven points, taken in
 * Chaldean order and joined every third point, give the order of the weekdays,
 * because 24 hours ≡ 3 (mod 7). Between the day band and the civil scale, a
 * silver arc shows when the Moon is above the horizon.
 *
 * Outside the dial, a lunar ring maps the synodic month the same way: phase
 * 0.5 (full moon) at the top, phase 0 (new moon) at the bottom, advancing
 * clockwise. Every cycle shares this convention — the luminous extreme of
 * each cycle is at the top.
 */

import { TAU } from './phase.js';
import * as svgKit from './svg.js';

const { el, moonGlyph } = svgKit;
const C = 500; // centre of the 1000 × 1000 viewBox

const R = {
  civilLabel: 481,
  civilTickOuter: 462,
  civilTickInner: 452,
  band: 420, // day/night band centre-line
  bandWidth: 30,
  tickOuter: 399,
  tickHour: 385,
  tickQuarter: 392,
  numeral: 366,
  eventLabel: 288,
  hours: 330, // planetary-hours ring
  hoursTickIn: 319,
  hoursTickOut: 341,
  engraving: 205, // heptagram behind the readout
  moonArc: 443, // Moon above the horizon
  moonTickIn: 436,
  moonTickOut: 451,
  moonLabel: 515,
  markerInner: 400,
  markerOuter: 444,
  handInner: 352, // stops outside the planetary-hours ring
  handOuter: 403,
  sun: 13,
  lunar: 548, // lunar ring track
  lunarTick: 6,
  moon: 18, // current Moon glyph
  moonMark: 7, // principal-phase glyphs
};

const VIEW = 1000 + 2 * 90; // viewBox side, with margin for the lunar ring

// Shared helpers, bound to this dial's centre.
const polar = (p, r) => svgKit.polar(p, r, C, C);
const arcPath = (p1, p2, r) => svgKit.arcPath(p1, p2, r, C, C);
const circlePath = (r) => svgKit.circlePath(r, C, C);

/** Text anchor that keeps a label inside the dial at phase p. */
function anchorFor(p) {
  const s = Math.sin((p - 0.5) * TAU);
  if (Math.abs(s) < 0.35) return 'middle';
  return s < 0 ? 'start' : 'end';
}

export function createDial(svg) {
  svg.setAttribute('viewBox', `${C - VIEW / 2} ${C - VIEW / 2} ${VIEW} ${VIEW}`);

  // ---- definitions: gradients and glow ------------------------------------
  const defs = el('defs', {}, svg);
  const face = el('radialGradient', { id: 'face', cx: '50%', cy: '42%', r: '60%' }, defs);
  el('stop', { offset: '0%', class: 'face-stop-inner' }, face);
  el('stop', { offset: '100%', class: 'face-stop-outer' }, face);

  // Vertical gradient: brightest at the top of the dial (noon), deepening
  // toward the horizon crossings.
  const day = el('linearGradient', { id: 'daylight', gradientUnits: 'userSpaceOnUse', x1: C, y1: 60, x2: C, y2: 940 }, defs);
  el('stop', { offset: '0%', class: 'day-stop-noon' }, day);
  el('stop', { offset: '55%', class: 'day-stop-low' }, day);
  el('stop', { offset: '100%', class: 'day-stop-horizon' }, day);

  const glow = el('filter', { id: 'glow', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
  el('feGaussianBlur', { stdDeviation: 7, result: 'blur' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'blur' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  // ---- static face -------------------------------------------------------
  el('circle', { cx: C, cy: C, r: 498, class: 'face' }, svg);
  el('circle', { cx: C, cy: C, r: R.civilTickInner - 6, class: 'rule' }, svg);
  el('circle', { cx: C, cy: C, r: R.band, class: 'night-band', 'stroke-width': R.bandWidth }, svg);
  const dayArc = el('path', { class: 'day-band', 'stroke-width': R.bandWidth, d: '' }, svg);

  // Apparent-solar-time scale: hour and quarter-hour ticks, numerals.
  const ticks = el('g', { class: 'solar-ticks' }, svg);
  for (let q = 0; q < 96; q++) {
    const p = q / 96;
    const isHour = q % 4 === 0;
    const [x1, y1] = polar(p, R.tickOuter);
    const [x2, y2] = polar(p, isHour ? R.tickHour : R.tickQuarter);
    el('line', { x1, y1, x2, y2, class: isHour ? 'tick-hour' : 'tick-quarter' }, ticks);
  }
  const numerals = el('g', { class: 'solar-numerals' }, svg);
  for (let h = 0; h < 24; h++) {
    const [x, y] = polar(h / 24, R.numeral);
    const t = el('text', { x, y, class: h % 6 === 0 ? 'numeral major' : 'numeral' }, numerals);
    t.textContent = String(h).padStart(2, '0');
  }

  // Civil-time scale (repositioned by setCivilShift).
  const civil = el('g', { class: 'civil-scale' }, svg);
  const civilTicks = [];
  const civilLabels = [];
  for (let h = 0; h < 24; h++) {
    civilTicks.push(el('line', { class: h % 3 === 0 ? 'civil-tick major' : 'civil-tick' }, civil));
    if (h % 3 === 0) {
      const t = el('text', { class: h === 12 ? 'civil-numeral noon' : 'civil-numeral' }, civil);
      t.textContent = String(h).padStart(2, '0');
      civilLabels.push({ h, t });
    }
  }

  // ---- traditional layers ------------------------------------------------
  // Heptagram {7/3}: an engraving, nearly invisible behind the readout.
  const engraving = el('g', { class: 'engraving' }, svg);
  el('circle', { cx: C, cy: C, r: R.engraving, class: 'engraving-circle' }, engraving);
  const star = Array.from({ length: 7 }, (_, k) => polar(0.5 + ((k * 3) % 7) / 7, R.engraving));
  el('path', { d: `M ${star.map((pt) => pt.join(' ')).join(' L ')} Z`, class: 'engraving-star' }, engraving);

  // Planetary hours: rebuilt when the day or the current hour changes.
  const hoursGroup = el('g', { class: 'planetary-hours' }, svg);

  // Moon above the horizon: arcs, rise/set ticks and labels.
  const moonSky = el('g', { class: 'moon-sky' }, svg);

  // ---- event markers -----------------------------------------------------
  const events = el('g', { class: 'events' }, svg);
  function makeMarker(name, cls) {
    const g = el('g', { class: `event ${cls}` }, events);
    const line = el('line', {}, g);
    const label = el('text', { class: 'event-name' }, g);
    const time = el('text', { class: 'event-time' }, g);
    label.textContent = name;
    return { g, line, label, time };
  }
  const markers = {
    sunrise: makeMarker('Sunrise', 'sunrise'),
    noon: makeMarker('Solar noon', 'noon'),
    sunset: makeMarker('Sunset', 'sunset'),
    midnight: makeMarker('Solar midnight', 'midnight'),
  };

  function placeMarker(m, p, timeText) {
    if (p == null) {
      m.g.setAttribute('visibility', 'hidden');
      return;
    }
    m.g.setAttribute('visibility', 'visible');
    const [x1, y1] = polar(p, R.markerInner);
    const [x2, y2] = polar(p, R.markerOuter);
    Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => m.line.setAttribute(k, v));

    const [x, y] = polar(p, R.eventLabel);
    const anchor = anchorFor(p);
    // Labels near the top read downward (name, then time); near the bottom upward.
    const below = Math.cos((p - 0.5) * TAU) < -0.35;
    const [nameDy, timeDy] = below ? [14, -16] : [-14, 16];
    for (const [node, dy] of [
      [m.label, nameDy],
      [m.time, timeDy],
    ]) {
      node.setAttribute('x', x);
      node.setAttribute('y', y + dy);
      node.setAttribute('text-anchor', anchor);
    }
    m.time.textContent = timeText;
  }

  // ---- lunar ring --------------------------------------------------------
  const lunar = el('g', { class: 'lunar-ring' }, svg);
  el('circle', { cx: C, cy: C, r: R.lunar, class: 'lunar-track' }, lunar);
  const lunarProgress = el('path', { class: 'lunar-progress' }, lunar);
  for (let o = 1; o < 8; o += 2) {
    // octants between the principal phases
    const [x1, y1] = polar(o / 8, R.lunar - R.lunarTick);
    const [x2, y2] = polar(o / 8, R.lunar + R.lunarTick);
    el('line', { x1, y1, x2, y2, class: 'lunar-tick' }, lunar);
  }
  const marks = [0, 0.25, 0.5, 0.75].map((p) => {
    const m = moonGlyph(lunar, R.moonMark, 'moon-mark');
    const [x, y] = polar(p, R.lunar);
    m.g.setAttribute('transform', `translate(${x} ${y})`);
    return { p, m };
  });
  const moon = moonGlyph(lunar, R.moon, 'moon-current');
  moon.g.setAttribute('filter', 'url(#glow)');

  // ---- the Sun -----------------------------------------------------------
  const hand = el('g', { class: 'sun-hand' }, svg);
  el('line', { x1: C, y1: C - R.handInner, x2: C, y2: C - R.handOuter, class: 'hand-line' }, hand);
  el('circle', { cx: C, cy: C - R.band, r: R.sun, class: 'sun-disk', filter: 'url(#glow)' }, hand);
  el('circle', { cx: C, cy: C - R.band, r: 2.6, class: 'sun-point' }, hand); // ☉: the disk with its centre

  // ---- central readout ---------------------------------------------------
  const readout = el('g', { class: 'readout' }, svg);
  const text = (attrs, content = '') => {
    const t = el('text', { x: C, 'text-anchor': 'middle', ...attrs }, readout);
    t.textContent = content;
    return t;
  };
  text({ y: 412, class: 'readout-label' }, 'Apparent solar time');
  const solarTime = text({ y: 470, class: 'readout-solar' }, '--:--:--');
  text({ y: 545, class: 'readout-label' }, 'Civil time');
  const civilTime = text({ y: 588, class: 'readout-civil' }, '--:--:--');
  const zone = text({ y: 625, class: 'readout-zone' });
  const status = text({ y: 672, class: 'readout-status' });

  return {
    readout: { solarTime, civilTime, zone, status },

    /** Place sunrise/noon/sunset/midnight; phases are apparent solar phases. */
    setEvents({ sunrise, noon, sunset, midnight, condition }) {
      placeMarker(markers.sunrise, sunrise?.phase, sunrise?.label);
      placeMarker(markers.noon, noon.phase, noon.label);
      placeMarker(markers.sunset, sunset?.phase, sunset?.label);
      placeMarker(markers.midnight, midnight.phase, midnight.label);

      if (condition === 'midnight-sun') dayArc.setAttribute('d', circlePath(R.band));
      else if (condition === 'polar-night') dayArc.setAttribute('d', '');
      else dayArc.setAttribute('d', arcPath(sunrise.phase, sunset.phase, R.band));
    },

    /**
     * Planetary hours as [{p0, p1, glyph, current, daytime}] in apparent solar
     * phase, already clipped to this solar day; null hides the ring.
     */
    setHours(hours) {
      hoursGroup.replaceChildren();
      if (!hours) return;
      for (const h of hours) {
        const span = (((h.p1 - h.p0) % 1) + 1) % 1;
        if (h.current) el('path', { d: arcPath(h.p0, h.p1, R.hoursTickOut + 2), class: 'hour-current' }, hoursGroup);
        if (h.startsHere) {
          const [x1, y1] = polar(h.p0, R.hoursTickIn);
          const [x2, y2] = polar(h.p0, R.hoursTickOut);
          el('line', { x1, y1, x2, y2, class: h.daytime ? 'hour-tick day' : 'hour-tick' }, hoursGroup);
        }
        if (span > 0.012) {
          const [x, y] = polar(h.p0 + span / 2, R.hours);
          const g = el('text', { x, y, class: `hour-glyph${h.current ? ' current' : ''}${h.daytime ? ' day' : ''}` }, hoursGroup);
          g.textContent = h.glyph;
        }
      }
    },

    /**
     * When the Moon is above the horizon during this solar day.
     * @param {{p0:number, p1:number}[]} arcs   intervals in apparent solar phase
     * @param {{phase:number, label:string, kind:'rise'|'set'}[]} events
     * @param {boolean} allDay  Moon up for the whole day (no rise or set)
     */
    setMoonSky(arcs, events, allDay) {
      moonSky.replaceChildren();
      if (allDay) el('path', { d: circlePath(R.moonArc), class: 'moon-arc' }, moonSky);
      for (const a of arcs) el('path', { d: arcPath(a.p0, a.p1, R.moonArc), class: 'moon-arc' }, moonSky);
      for (const e of events) {
        const [x1, y1] = polar(e.phase, R.moonTickIn);
        const [x2, y2] = polar(e.phase, R.moonTickOut);
        el('line', { x1, y1, x2, y2, class: 'moon-tick' }, moonSky);
        const [x, y] = polar(e.phase, R.moonLabel);
        const label = el('text', { x, y, class: 'moon-label' }, moonSky);
        label.textContent = `${e.kind === 'rise' ? '☽\uFE0E↑' : '☽\uFE0E↓'} ${e.label}`;
      }
    },

    /**
     * Rotate the civil scale: civil hour h sits at apparent phase h/24 + shift,
     * where shift = (apparent solar time − civil time) in days.
     */
    setCivilShift(shift) {
      civilTicks.forEach((line, h) => {
        const p = h / 24 + shift;
        const [x1, y1] = polar(p, R.civilTickInner);
        const [x2, y2] = polar(p, h % 3 === 0 ? R.civilTickOuter + 4 : R.civilTickOuter);
        Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, v));
      });
      civilLabels.forEach(({ h, t }) => {
        const [x, y] = polar(h / 24 + shift, R.civilLabel);
        t.setAttribute('x', x);
        t.setAttribute('y', y);
      });
    },

    /** Move the Sun to apparent solar phase p; style it by altitude. */
    setSun(p, altitudeDeg) {
      hand.setAttribute('transform', `rotate(${(p - 0.5) * 360} ${C} ${C})`);
      hand.classList.toggle('below-horizon', altitudeDeg < -0.833);
    },

    /**
     * Place the Moon at lunar phase p with illuminated fraction k. The bright
     * limb faces the Sun: on the right while waxing as seen from the northern
     * hemisphere, mirrored for southern observers.
     */
    setMoon(p, k, southern) {
      const litRight = p < 0.5 !== southern;
      const [x, y] = polar(p, R.lunar);
      moon.g.setAttribute('transform', `translate(${x} ${y})`);
      moon.set(k, litRight);
      lunarProgress.setAttribute('d', p > 0.002 ? arcPath(0, p, R.lunar) : '');
      for (const { p: q, m } of marks) m.set((1 - Math.cos(q * TAU)) / 2, q < 0.5 !== southern);
    },

    setActive(active) {
      svg.classList.toggle('inactive', !active);
    },
  };
}
