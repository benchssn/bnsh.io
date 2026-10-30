/**
 * recurrence.js — Recurring patterns between two cycles (Iteration 5).
 *
 * Stroboscope: sample cycle B each time cycle A returns to phase 0 (each
 * new moon, each December solstice, …). Plot sample k at radius ∝ k and at
 * B's phase angle, using the common dial convention. If q·T_A ≈ p·T_B, the
 * points fall into q spiral arms. The closer the match, the straighter the
 * arms. The continued-fraction convergents of T_A/T_B list these
 * near-recurrences in order of improving accuracy, at ever longer
 * timescales (8 yr → 19 yr → 334 yr for the Moon and the year).
 *
 * That nesting is a hierarchy of near-commensurabilities of a
 * quasi-periodic system. It is not, by itself, evidence of fractal
 * structure. The "mean" model shows the pure arithmetic of the two mean
 * periods. "True" uses the real phases, so each cycle's correction Δ(t)
 * scatters the points about the ideal arms.
 */

import { convergents, frac, nextPhaseEvent, timeOfPhase, wrapHalf } from '../phase.js';
import { el, polar, sectorPath } from '../svg.js';
import * as fmt from '../format.js';
import { createTorus } from './torus.js';

const R_IN = 36;
const R_OUT = 196;
const ECLIPSE_WINDOW = 18.5 / 360; // turns either side of a node
const PORTRAIT_POINTS = 12000; // trajectory samples on the torus
const PER_FAST_CYCLE = 24; // samples per period of the faster cycle

export const PRESETS = {
  metonic: { a: 'year', b: 'month', n: 200, join: false, note: 'Lunar phase at each December solstice. Nineteen arms show the Metonic cycle: 19 years ≈ 235 lunations.' },
  venus: { a: 'venus', b: 'year', n: 30, join: true, note: 'Time of year at each superior conjunction of Venus. Five points per 8 years trace the pentagram: 5 synodic periods ≈ 8 years.' },
  saros: { a: 'month', b: 'draconic', n: 400, join: false, note: 'Moon’s position relative to its nodes at each new moon. New moons inside the shaded windows can produce solar eclipses; their pattern repeats with the Saros, 223 lunations ≈ 242 draconic months.' },
  mars: { a: 'mars', b: 'year', n: 40, join: false, note: 'Time of year at each conjunction of Mars. Seven arms: 7 synodic periods ≈ 15 years, refined to 37 ≈ 79.' },
};

/** Name of one period of a cycle, for running text: "synodic month", "Venus synodic period". */
const unitName = (entry) => (entry.kind === 'planetary' ? `${entry.name} synodic period` : entry.name.toLowerCase());

/** Event name for running text: keep month names capitalised. */
const eventName = (ev) => (/^(January|February|March|April|May|June|July|August|September|October|November|December)/.test(ev.name) ? ev.name : ev.name[0].toLowerCase() + ev.name.slice(1));

export function createRecurrence(controls, svg, cycles, getTime, getFormatters) {
  const byId = Object.fromEntries(cycles.map((c) => [c.id, c]));
  const { a: selA, b: selB, n: selN, model, join, table, summary, note, rerun, presets, torus3d, torusFlat, portraitNote } = controls;
  const portrait = createTorus(torus3d, torusFlat);

  for (const sel of [selA, selB]) {
    for (const c of cycles) sel.add(new Option(c.name, c.id));
  }
  svg.setAttribute('viewBox', '-250 -250 500 500');

  function samples(A, B, t0, n, useMean) {
    const T = A.cycle.period;
    const times = [];
    if (useMean) {
      const start = t0 + frac(-A.cycle.meanPhase(t0)) * T;
      for (let k = 0; k < n; k++) times.push(start + k * T);
    } else {
      let t = nextPhaseEvent(A.cycle, [0], t0).time;
      for (let k = 0; k < n; k++) {
        times.push(t);
        t = timeOfPhase(A.cycle, 0, t + T);
      }
    }
    const phaseOf = useMean ? B.cycle.meanPhase : B.cycle.phase;
    return times.map((t) => ({ t, p: phaseOf(t) }));
  }

  function draw(B, pts, joined) {
    svg.replaceChildren();
    el('circle', { r: R_OUT + 4, class: 'rc-frame' }, svg);
    if (B.id === 'draconic') {
      for (const c of [0, 0.5]) el('path', { d: sectorPath(c - ECLIPSE_WINDOW, c + ECLIPSE_WINDOW, R_IN - 6, R_OUT + 4), class: 'rc-window' }, svg);
    }
    for (const ev of B.events) {
      const [x1, y1] = polar(ev.phase, R_OUT + 4);
      const [x2, y2] = polar(ev.phase, R_OUT + 14);
      el('line', { x1, y1, x2, y2, class: 'rc-tick' }, svg);
      const [x, y] = polar(ev.phase, R_OUT + 30);
      el('text', { x, y, class: 'rc-label', 'text-anchor': 'middle' }, svg).textContent = ev.short;
    }
    const n = pts.length;
    const xy = pts.map(({ p }, k) => polar(p, R_IN + ((R_OUT - R_IN) * k) / Math.max(1, n - 1)));
    if (joined) el('path', { d: xy.map(([x, y], k) => `${k ? 'L' : 'M'} ${x} ${y}`).join(' '), class: 'rc-join' }, svg);
    const dotR = n > 250 ? 2.4 : n > 100 ? 3 : 4;
    const g = el('g', { class: `rc-dots cycle-${B.id}` }, svg);
    xy.forEach(([x, y], k) => el('circle', { cx: x, cy: y, r: dotR, opacity: (0.3 + (0.7 * k) / Math.max(1, n - 1)).toFixed(3) }, g));
    el('circle', { r: 3, class: 'rc-centre' }, svg);
  }

  /**
   * Continuous trajectory (φ_A, φ_B) from the first stroboscope sample, as far
   * as PORTRAIT_POINTS samples allow at PER_FAST_CYCLE per period of the faster cycle.
   */
  function drawPortrait(A, B, pts, useMean) {
    const t0 = pts[0].t;
    const fullEnd = pts[pts.length - 1].t;
    const fast = Math.min(A.cycle.period, B.cycle.period);
    const end = Math.min(fullEnd, t0 + (PORTRAIT_POINTS / PER_FAST_CYCLE) * fast);
    const count = Math.max(2, Math.min(PORTRAIT_POINTS, Math.ceil(((end - t0) / fast) * PER_FAST_CYCLE)));
    const [phaseA, phaseB] = useMean ? [A.cycle.meanPhase, B.cycle.meanPhase] : [A.cycle.phase, B.cycle.phase];
    const points = [];
    for (let i = 0; i <= count; i++) {
      const t = t0 + ((end - t0) * i) / count;
      points.push([phaseA(t), phaseB(t)]);
    }
    const section = pts.filter((s) => s.t <= end + 1).map((s) => s.p);
    portrait.set({ points, section, idB: B.id, nameA: unitName(A), nameB: unitName(B), windings: (end - t0) / fast });
    const f = getFormatters().dateOnly;
    portraitNote.textContent =
      end < fullEnd
        ? `The path is drawn from ${f.format(t0)} to ${f.format(end)} (${section.length} of the ${pts.length} stroboscope samples). A longer path would fill the surface completely.`
        : `The path is drawn from ${f.format(t0)} to ${f.format(end)}, through all ${pts.length} stroboscope samples.`;
  }

  function tabulate(A, B, n) {
    const x = A.cycle.period / B.cycle.period;
    const rows = convergents(x, 500).filter((c) => c.q > 1 || c.p > 1);
    table.innerHTML = rows
      .map(({ p, q }) => {
        const mismatch = q * A.cycle.period - p * B.cycle.period;
        const drift = wrapHalf(q * x - p) * 360;
        const visible = q <= n;
        return `<tr class="${visible ? 'visible' : ''}">
          <td class="num">${q} × ${unitName(A)}</td>
          <td class="num">${p} × ${unitName(B)}</td>
          <td class="num">${fmt.span(q * A.cycle.period)}</td>
          <td class="num">${fmt.signedSpan(mismatch)}</td>
          <td class="num">${drift >= 0 ? '+' : '−'}${Math.abs(drift).toFixed(drift && Math.abs(drift) < 1 ? 2 : 1)}°</td>
        </tr>`;
      })
      .join('');
  }

  function run() {
    const A = byId[selA.value];
    const B = byId[selB.value];
    const n = Number(selN.value);
    const useMean = model.value === 'mean';
    const pts = samples(A, B, getTime(), n, useMean);
    draw(B, pts, join.checked);
    tabulate(A, B, n);
    drawPortrait(A, B, pts, useMean);

    const f = getFormatters().dateOnly;
    const start = eventName(A.events.find((e) => e.phase === 0));
    let text = `${n} samples of the ${unitName(B)}, one at each ${start}, from ${f.format(pts[0].t)} to ${f.format(pts[n - 1].t)}, using ${useMean ? 'mean' : 'true'} phases.`;
    if (B.id === 'draconic') {
      const inside = pts.filter(({ p }) => Math.min(Math.abs(wrapHalf(p)), Math.abs(wrapHalf(p - 0.5))) < ECLIPSE_WINDOW).length;
      text += ` ${inside} of them fall within ±18.5° of a node.`;
    }
    summary.textContent = text;
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    selA.value = preset.a;
    selB.value = preset.b;
    selN.value = String(preset.n);
    join.checked = preset.join;
    note.textContent = preset.note;
    presets.forEach((b) => b.classList.toggle('active', b.dataset.preset === name));
    run();
  }

  const custom = () => {
    note.textContent = '';
    presets.forEach((b) => b.classList.remove('active'));
    run();
  };
  [selA, selB, selN].forEach((s) => s.addEventListener('change', custom));
  model.addEventListener('change', run);
  join.addEventListener('change', run);
  rerun.addEventListener('click', run);
  presets.forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

  applyPreset('metonic');
  return { run };
}
