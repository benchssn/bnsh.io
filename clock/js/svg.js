/**
 * svg.js — Small SVG helpers shared by the dial and the cycle views.
 *
 * Phase-dial convention used everywhere: phase p maps to an angle measured
 * clockwise from the top, with p = 0.5 at the top and p = 0 at the bottom.
 */

import { TAU } from './phase.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  setAttrs(node, attrs);
  if (parent) parent.appendChild(node);
  return node;
}

export function setAttrs(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
}

/** Point at phase p and radius r on a dial centred at (cx, cy). */
export function polar(p, r, cx = 0, cy = 0) {
  const a = (p - 0.5) * TAU;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** Clockwise arc of radius r from phase p1 to p2. */
export function arcPath(p1, p2, r, cx = 0, cy = 0) {
  const span = (((p2 - p1) % 1) + 1) % 1;
  const [x1, y1] = polar(p1, r, cx, cy);
  const [x2, y2] = polar(p2, r, cx, cy);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Full circle as a path (two half arcs, starting at the bottom). */
export function circlePath(r, cx = 0, cy = 0) {
  return `M ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r}`;
}

/** Filled annular sector between radii r1 < r2, clockwise from phase p1 to p2. */
export function sectorPath(p1, p2, r1, r2, cx = 0, cy = 0) {
  const span = (((p2 - p1) % 1) + 1) % 1;
  const large = span > 0.5 ? 1 : 0;
  const [a, b] = [polar(p1, r2, cx, cy), polar(p2, r2, cx, cy)];
  const [c, d] = [polar(p2, r1, cx, cy), polar(p1, r1, cx, cy)];
  return `M ${a} A ${r2} ${r2} 0 ${large} 1 ${b} L ${c} A ${r1} ${r1} 0 ${large} 0 ${d} Z`;
}

/**
 * Path of the lit part of a Moon disk of radius r centred on the origin,
 * for illuminated fraction k. The bright limb is a semicircle; the terminator
 * is a half-ellipse with horizontal semi-axis r·|1 − 2k| (the projection of
 * the day/night great circle), bulging toward the dark side when gibbous.
 */
export function litPath(r, k, litRight) {
  const rx = r * Math.abs(1 - 2 * k);
  const gibbous = k > 0.5;
  const limbSweep = litRight ? 1 : 0;
  const termSweep = litRight === gibbous ? 1 : 0;
  return `M 0 ${-r} A ${r} ${r} 0 0 ${limbSweep} 0 ${r} A ${rx} ${r} 0 0 ${termSweep} 0 ${-r} Z`;
}

/** A Moon glyph: dark disk, lit part, faint outline. */
export function moonGlyph(parent, r, cls) {
  const g = el('g', { class: cls }, parent);
  el('circle', { r, class: 'moon-dark' }, g);
  const lit = el('path', { class: 'moon-lit' }, g);
  el('circle', { r, class: 'moon-rim' }, g);
  return {
    g,
    set(k, litRight) {
      lit.setAttribute('d', litPath(r, k, litRight));
    },
    moveTo(x, y) {
      g.setAttribute('transform', `translate(${x} ${y})`);
    },
  };
}
