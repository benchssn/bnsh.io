/**
 * cycle-grid.js — One small phase dial per cycle (Iteration 3).
 *
 * Every dial is drawn with the same convention as the main clock: phase 0.5
 * at the top, phase 0 at the bottom, advancing clockwise. Each one shows
 *   • the true phase (filled marker),
 *   • the mean phase of the uniform model θ̄ = 2π·frac((t − t₀)/T) (inner tick),
 *   • the arc between them: the correction Δ(t), the cycle's own
 *     "equation of time".
 * Making the cycles look identical is the point: different mechanisms, one
 * mathematical structure.
 */

import { nextEvent } from '../cycles.js';
import { wrapHalf } from '../phase.js';
import { el, polar, arcPath, setAttrs } from '../svg.js';
import * as fmt from '../format.js';
import { CYCLE_GLYPH } from '../esoterica.js';

const R = { track: 80, tickIn: 73, tickOut: 87, label: 98, meanIn: 58, meanOut: 70, marker: 6.5 };

function anchorFor(p) {
  const s = Math.sin((p - 0.5) * 2 * Math.PI);
  if (Math.abs(s) < 0.35) return 'middle';
  return s < 0 ? 'end' : 'start';
}

function buildCard(container, entry) {
  const figure = document.createElement('figure');
  figure.className = `cycle-card cycle-${entry.id}`;
  container.appendChild(figure);

  const svg = el('svg', { viewBox: '-150 -114 300 228', role: 'img', 'aria-label': `${entry.name} phase dial` }, figure);
  el('circle', { r: R.track, class: 'cc-track' }, svg);
  for (const ev of entry.events) {
    const [x1, y1] = polar(ev.phase, R.tickIn);
    const [x2, y2] = polar(ev.phase, R.tickOut);
    el('line', { x1, y1, x2, y2, class: 'cc-tick' }, svg);
    const [x, y] = polar(ev.phase, R.label);
    const label = el('text', { x, y, 'text-anchor': anchorFor(ev.phase), class: 'cc-label' }, svg);
    label.textContent = ev.short;
  }
  const correction = el('path', { class: 'cc-correction' }, svg);
  const mean = el('line', { class: 'cc-mean' }, svg);
  const marker = el('circle', { r: R.marker, class: 'cc-marker', filter: 'url(#cc-glow)' }, svg);
  const phaseText = el('text', { y: -4, class: 'cc-phase', 'text-anchor': 'middle' }, svg);
  const phaseLabel = el('text', { y: 18, class: 'cc-phase-label', 'text-anchor': 'middle' }, svg);
  phaseLabel.textContent = 'phase';

  const caption = document.createElement('figcaption');
  caption.innerHTML = `
    <h3><span class="glyph" aria-hidden="true">${CYCLE_GLYPH[entry.id]}</span> ${entry.name}</h3>
    <p class="cc-period">T = ${fmt.period(entry.cycle.period)}</p>
    <dl>
      <div><dt title="${entry.correctionName}">True − mean</dt><dd class="cc-delta">—</dd></div>
      <div><dt class="cc-next-name">Next</dt><dd class="cc-next">—</dd></div>
    </dl>`;
  figure.appendChild(caption);

  return {
    entry,
    marker,
    mean,
    correction,
    phaseText,
    delta: caption.querySelector('.cc-delta'),
    nextName: caption.querySelector('.cc-next-name'),
    next: caption.querySelector('.cc-next'),
  };
}

export function createCycleGrid(container, entries) {
  // One shared glow filter for all the little dials.
  const defsHost = el('svg', { width: 0, height: 0, 'aria-hidden': 'true', class: 'defs-host' }, container);
  const filter = el('filter', { id: 'cc-glow', x: '-150%', y: '-150%', width: '400%', height: '400%' }, el('defs', {}, defsHost));
  el('feGaussianBlur', { stdDeviation: 3.5, result: 'b' }, filter);
  const merge = el('feMerge', {}, filter);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  const cards = entries.map((entry) => buildCard(container, entry));

  return {
    /** Geometry every frame; text only when `withText`. */
    update(t, withText, formatters) {
      for (const card of cards) {
        const { cycle } = card.entry;
        const p = cycle.phase(t);
        const m = cycle.meanPhase(t);
        const [x, y] = polar(p, R.track);
        setAttrs(card.marker, { cx: x, cy: y });
        const [x1, y1] = polar(m, R.meanIn);
        const [x2, y2] = polar(m, R.meanOut);
        setAttrs(card.mean, { x1, y1, x2, y2 });
        const d = wrapHalf(p - m);
        card.correction.setAttribute('d', Math.abs(d) > 1e-4 ? (d > 0 ? arcPath(m, p, R.meanOut - 6) : arcPath(p, m, R.meanOut - 6)) : '');

        if (!withText) continue;
        card.phaseText.textContent = p.toFixed(3);
        card.delta.textContent = fmt.signedSpan(d * cycle.period);
        const next = nextEvent(card.entry, t);
        card.nextName.textContent = next.event.name;
        card.next.textContent = (card.entry.id === 'day' ? formatters.hm : formatters.date).format(next.time);
      }
    },
  };
}
