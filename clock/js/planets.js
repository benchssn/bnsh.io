/**
 * planets.js — Planetary positions and synodic cycles.
 *
 * Positions come from Keplerian orbital elements with linear rates: E. M.
 * Standish, "Keplerian Elements for Approximate Positions of the Major
 * Planets" (JPL), table 1, valid 1800–2050. Heliocentric longitudes are good
 * to a few arcminutes (Saturn is the worst, up to ~10′), so conjunction and
 * opposition dates are good to a fraction of a day. The frame is the J2000
 * ecliptic; geocentric longitudes are moved to the equinox of date with the
 * general precession (1.397° per century) so they share a frame with the Sun
 * and Moon.
 *
 * Synodic phase. A planet's synodic cycle is the *relative* phase of two
 * orbits: Earth's and the planet's, seen from the Sun. We define
 *
 *     superior planets (Mars, Jupiter, Saturn):  phase = ½ + (L⊕ − Lₚ)/360
 *     inferior planets (Mercury, Venus):         phase = ½ + (Lₚ − L⊕)/360
 *
 * with L the heliocentric ecliptic longitudes. Phase 0.5 (top of a dial) is
 * the alignment with Earth and the planet on the same side of the Sun:
 * opposition for a superior planet, inferior conjunction for an inferior one.
 * Phase 0 (bottom) is the planet behind the Sun: conjunction or superior
 * conjunction. Collinearity in heliocentric longitude is exactly
 * collinearity in geocentric longitude, so these are the almanac events.
 */

import { createCycle, wrapHalf } from './phase.js';
import { CENTURY_MS, DELTA_T_MS, J2000_MS } from './solar.js';

const DEG = Math.PI / 180;
const mod360 = (x) => ((x % 360) + 360) % 360;
const PRECESSION_PER_CENTURY = 1.396971; // general precession in longitude, degrees

// [value at J2000, rate per Julian century] for
// a (AU), e, I (°), L mean longitude (°), ϖ longitude of perihelion (°), Ω node (°)
const ELEMENTS = {
  mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
  venus: { a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
  earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0, 0] },
  mars: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
  jupiter: { a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
  saturn: { a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
};

export const PLANETS = [
  { id: 'mercury', name: 'Mercury', abbr: 'Me', inferior: true },
  { id: 'venus', name: 'Venus', abbr: 'Ve', inferior: true },
  { id: 'mars', name: 'Mars', abbr: 'Ma', inferior: false },
  { id: 'jupiter', name: 'Jupiter', abbr: 'Ju', inferior: false },
  { id: 'saturn', name: 'Saturn', abbr: 'Sa', inferior: false },
];

const centuries = (t) => (t + DELTA_T_MS - J2000_MS) / CENTURY_MS;

/** Heliocentric position at T centuries, optionally at a forced mean anomaly (for orbit drawing). */
function heliocentricAt(id, T, forcedMeanAnomaly) {
  const el = ELEMENTS[id];
  const v = (k) => el[k][0] + el[k][1] * T;
  const [a, e, I, L, w, O] = [v('a'), v('e'), v('I') * DEG, v('L'), v('w'), v('O')];
  const argPeri = (w - O) * DEG;
  const node = O * DEG;

  // Solve Kepler's equation E − e·sin E = M by Newton's method.
  const M = forcedMeanAnomaly ?? (mod360(L - w + 180) - 180) * DEG;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));

  // Position in the orbital plane, then rotated into the ecliptic frame.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cO, sO, cI, sI] = [Math.cos(argPeri), Math.sin(argPeri), Math.cos(node), Math.sin(node), Math.cos(I), Math.sin(I)];
  const x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const z = sw * sI * xp + cw * sI * yp;
  return { x, y, z, r: Math.hypot(x, y, z), longitude: mod360(Math.atan2(y, x) / DEG), meanLongitude: mod360(L) };
}

/** Heliocentric ecliptic position (J2000 frame, AU) of a planet or 'earth'. */
export const heliocentric = (id, t) => heliocentricAt(id, centuries(t));

/** Sampled orbit (n points) at instant t, for drawing. */
export function orbitPoints(id, t, n = 160) {
  const T = centuries(t);
  return Array.from({ length: n }, (_, i) => heliocentricAt(id, T, (i / n) * 2 * Math.PI));
}

/**
 * Geocentric view of a planet: apparent ecliptic longitude (equinox of date,
 * degrees), latitude, distance (AU) and elongation from the Sun (degrees,
 * positive east of the Sun = evening sky).
 */
export function geocentric(id, t) {
  const p = heliocentric(id, t);
  const e = heliocentric('earth', t);
  const [dx, dy, dz] = [p.x - e.x, p.y - e.y, p.z - e.z];
  const distance = Math.hypot(dx, dy, dz);
  const precession = PRECESSION_PER_CENTURY * centuries(t);
  const longitude = mod360(Math.atan2(dy, dx) / DEG + precession);
  const sunLongitude = mod360(Math.atan2(-e.y, -e.x) / DEG + precession);
  const cosElong = (dx * -e.x + dy * -e.y + dz * -e.z) / (distance * e.r);
  const elongation = Math.acos(Math.max(-1, Math.min(1, cosElong))) / DEG;
  const east = wrapHalf((longitude - sunLongitude) / 360) > 0;
  return { longitude, latitude: Math.asin(dz / distance) / DEG, distance, elongation: east ? elongation : -elongation };
}

/** Synodic cycle of a planet in the common phase model. */
export function synodicCycle(planet) {
  const s = planet.inferior ? 1 : -1; // sign of (Lₚ − L⊕)
  const relative = (Lp, Le) => mod360(s * (Lp - Le)) / 360;

  // Mean model: the mean longitudes are linear in time, so their difference is too.
  const A = s * (ELEMENTS[planet.id].L[0] - ELEMENTS.earth.L[0]); // degrees at J2000
  const B = s * (ELEMENTS[planet.id].L[1] - ELEMENTS.earth.L[1]); // degrees per century
  const period = (360 / B) * CENTURY_MS;
  // Mean phase ½ + (A + B·T)/360 is zero when A + B·T = −180°.
  const epoch = J2000_MS - DELTA_T_MS + ((((-180 - A) % 360) - 360) / B) * CENTURY_MS;

  const truePhase = (t) => (0.5 + relative(heliocentric(planet.id, t).longitude, heliocentric('earth', t).longitude)) % 1;
  return createCycle({
    name: `${planet.name} synodic`,
    period,
    epoch,
    correction: (t) => wrapHalf(truePhase(t) - (t - epoch) / period),
  });
}

export function synodicEvents(planet) {
  return planet.inferior
    ? [
        { phase: 0, name: 'Superior conjunction', short: 'Sup. conj.' },
        { phase: 0.5, name: 'Inferior conjunction', short: 'Inf. conj.' },
      ]
    : [
        { phase: 0, name: 'Conjunction', short: 'Conj.' },
        { phase: 0.5, name: 'Opposition', short: 'Opp.' },
      ];
}
