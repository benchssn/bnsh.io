/**
 * lunar.js — The synodic month: lunar phase, illumination and the principal
 * phases (new, first quarter, full, last quarter).
 *
 * The phase of the Moon is defined geometrically as its elongation: the
 * difference between the apparent ecliptic longitudes of the Moon and the Sun.
 *
 *     phase = (λ☾ − λ☉) / 360°     0 = new, 0.25 = first quarter,
 *                                  0.5 = full, 0.75 = last quarter
 *
 * The Moon's longitude uses the main periodic terms of the ELP-2000/82 theory
 * as tabulated by Meeus ("Astronomical Algorithms", ch. 47), truncated at
 * 0.0003°. This gives the elongation to ~0.003°, i.e. principal-phase times to
 * about a minute. The illuminated fraction follows Meeus ch. 48.
 *
 * Unlike the solar computations, a 69 s error in time is visible here (the
 * Moon moves its own diameter in about an hour), so we convert UTC to
 * Terrestrial Time with a fixed ΔT = TT − UT ≈ 69 s, appropriate for the
 * 2020s.
 */

import { createCycle, timeOfPhase, wrapHalf } from './phase.js';
import { DAY_MS, DELTA_T_MS, localSiderealTime, sunEphemeris } from './solar.js';

const DEG = Math.PI / 180;
const mod360 = (x) => ((x % 360) + 360) % 360;

/** Mean synodic month (new moon to new moon), Meeus eq. 49.1. */
export const SYNODIC_MONTH_MS = 29.530588861 * DAY_MS;

/** A mean new moon: JDE 2451550.09766 (2000-01-06), converted from TT to UTC. */
const MEAN_NEW_MOON_EPOCH = (2451550.09766 - 2440587.5) * DAY_MS - 64_000;

// Periodic terms for the Moon's longitude (Meeus table 47.A):
// multiples of [D, M, M′, F] and the coefficient in 10⁻⁶ degrees.
// Terms containing the Sun's anomaly M are scaled by E^|M| (Earth's
// decreasing orbital eccentricity).
const LONGITUDE_TERMS = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
  [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
  [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
  [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
  [2, 1, 1, 0, -810], [4, -1, -2, 0, 759], [0, 2, -1, 0, -713], [2, 2, -1, 0, -700],
  [2, 1, -2, 0, 691], [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
  [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399], [0, 0, 2, -2, -381],
  [1, 1, 1, 0, 351], [3, 0, -2, 0, -340], [4, 0, -3, 0, 330], [2, -1, 2, 0, 327],
  [0, 2, 1, 0, -323], [1, 1, -1, 0, 299], [2, 0, 3, 0, 294],
];

// Main periodic terms for the Moon's latitude (Meeus table 47.B, truncated at
// 0.0008°): multiples of [D, M, M′, F] and the coefficient in 10⁻⁶ degrees.
const LATITUDE_TERMS = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
];

// Main terms for the Earth–Moon distance (Meeus table 47.A, cosine column,
// truncated at 10 km): multiples of [D, M, M′, F] and the coefficient in metres.
const DISTANCE_TERMS = [
  [0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968], [0, 0, 2, 0, -569925],
  [2, 0, -2, 0, 246158], [2, -1, 0, 0, -204586], [2, 0, 1, 0, -170733], [2, -1, -1, 0, -152138],
  [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743], [0, 1, 1, 0, 104755], [0, 0, 1, -2, 79661],
  [0, 1, 0, 0, 48888], [4, 0, -1, 0, -34782], [2, 1, 0, 0, 30824], [2, 1, -1, 0, 24208],
  [0, 0, 3, 0, -23210], [4, 0, -2, 0, -21636], [1, 1, 0, 0, -16675], [2, 0, -3, 0, 14403],
  [2, -1, 1, 0, -12831], [4, 0, 0, 0, -11650], [2, 0, 2, 0, -10445], [2, 0, 0, -2, 10321],
  [2, -1, -2, 0, 10056],
];

/**
 * Elongation of the Moon and its illuminated fraction at instant t (UTC ms).
 * @returns {{elongation:number, illuminated:number, longitude:number, latitude:number,
 *   distance:number, node:number, obliquity:number}}
 *   elongation, Moon's apparent ecliptic longitude and the longitude of the
 *   mean ascending node, all in degrees [0, 360); ecliptic latitude in degrees;
 *   distance in km; illuminated fraction in [0, 1]; true obliquity in degrees
 */
export function moonState(t) {
  const tt = t + DELTA_T_MS;
  const T = (tt / DAY_MS + 2440587.5 - 2451545.0) / 36525;

  // Fundamental arguments (degrees): Moon's mean longitude, mean elongation,
  // Sun's and Moon's mean anomalies, Moon's argument of latitude.
  const Lp = 218.3164477 + T * (481267.88123421 + T * (-0.0015786 + T * (1 / 538841 - T / 65194000)));
  const D = 297.8501921 + T * (445267.1114034 + T * (-0.0018819 + T * (1 / 545868 - T / 113065000)));
  const M = 357.5291092 + T * (35999.0502909 + T * (-0.0001536 + T / 24490000));
  const Mp = 134.9633964 + T * (477198.8675055 + T * (0.0087414 + T * (1 / 69699 - T / 14712000)));
  const F = 93.272095 + T * (483202.0175233 + T * (-0.0036539 + T * (-1 / 3526000 + T / 863310000)));
  const E = 1 - T * (0.002516 + 0.0000074 * T);

  let sum = 0;
  for (const [d, m, mp, f, coeff] of LONGITUDE_TERMS) {
    sum += coeff * E ** Math.abs(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * DEG);
  }
  // Additive terms: Venus (A1), Jupiter (A2) and Earth's flattening.
  const A1 = 119.75 + 131.849 * T;
  const A2 = 53.09 + 479264.29 * T;
  sum += 3958 * Math.sin(A1 * DEG) + 1962 * Math.sin((Lp - F) * DEG) + 318 * Math.sin(A2 * DEG);

  // Apparent longitude: add the main nutation term, as the Sun's apparent
  // longitude does, so nutation cancels in the elongation.
  const omega = 125.04 - 1934.136 * T;
  const moonLongitude = Lp + sum / 1e6 - 0.00478 * Math.sin(omega * DEG);
  const sun = sunEphemeris(tt);
  const elongation = mod360(moonLongitude - sun.eclipticLongitude);

  // Latitude and distance from their own periodic series.
  let sumB = 0;
  for (const [d, m, mp, f, coeff] of LATITUDE_TERMS) {
    sumB += coeff * E ** Math.abs(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * DEG);
  }
  const A3 = 313.45 + 481266.484 * T;
  sumB +=
    -2235 * Math.sin(Lp * DEG) + 382 * Math.sin(A3 * DEG) + 175 * Math.sin((A1 - F) * DEG) +
    175 * Math.sin((A1 + F) * DEG) + 127 * Math.sin((Lp - Mp) * DEG) - 115 * Math.sin((Lp + Mp) * DEG);
  let sumR = 0;
  for (const [d, m, mp, f, coeff] of DISTANCE_TERMS) {
    sumR += coeff * E ** Math.abs(m) * Math.cos((d * D + m * M + mp * Mp + f * F) * DEG);
  }

  // Phase angle i (Sun–Moon–Earth) and illuminated fraction k, Meeus eq. 48.4.
  const i =
    180 - mod360(D) -
    6.289 * Math.sin(Mp * DEG) + 2.1 * Math.sin(M * DEG) -
    1.274 * Math.sin((2 * D - Mp) * DEG) - 0.658 * Math.sin(2 * D * DEG) -
    0.214 * Math.sin(2 * Mp * DEG) - 0.11 * Math.sin(D * DEG);
  const illuminated = (1 + Math.cos(i * DEG)) / 2;

  // Mean ascending node of the lunar orbit (regresses once per 18.6 years).
  const node = mod360(125.0445479 - 1934.1362891 * T);

  return {
    elongation,
    illuminated,
    longitude: mod360(moonLongitude),
    latitude: sumB / 1e6,
    distance: 385000.56 + sumR / 1000,
    node,
    obliquity: sun.obliquity,
  };
}

/**
 * Altitude of the Moon's centre above the horizon (geocentric, degrees) at
 * instant t for an observer at (lat, lon), and the altitude at which it rises
 * or sets.
 *
 * The Moon is close enough for its parallax (~1°) to matter: seen from the
 * surface it sits lower than from Earth's centre. The standard rise/set
 * altitude of the centre (Meeus ch. 15) is h₀ = 0.7275·π − 34′, where π is the
 * horizontal parallax, combining parallax, refraction and semi-diameter.
 */
export function moonAltitude(t, latDeg, lonDeg) {
  const m = moonState(t);
  const [λ, β, ε] = [m.longitude * DEG, m.latitude * DEG, m.obliquity * DEG];
  // Ecliptic → equatorial coordinates.
  const ra = Math.atan2(Math.sin(λ) * Math.cos(ε) - Math.tan(β) * Math.sin(ε), Math.cos(λ));
  const dec = Math.asin(Math.sin(β) * Math.cos(ε) + Math.cos(β) * Math.sin(ε) * Math.sin(λ));
  const H = (localSiderealTime(t, lonDeg) * DEG) - ra;
  const φ = latDeg * DEG;
  const altitude = Math.asin(Math.sin(φ) * Math.sin(dec) + Math.cos(φ) * Math.cos(dec) * Math.cos(H)) / DEG;
  const parallax = Math.asin(6378.14 / m.distance) / DEG;
  return { altitude, horizon: 0.7275 * parallax - 34 / 60, declination: dec / DEG };
}

/**
 * Moonrises and moonsets between t0 and t1, plus whether the Moon is up at
 * t0. The interval is scanned in 10-minute steps (the Moon's altitude cannot
 * cross the horizon twice that quickly outside the polar regions), and each
 * crossing is refined by the secant method to about a second.
 * @returns {{upAtStart:boolean, events:{time:number, kind:'rise'|'set'}[]}}
 */
export function moonRiseSet(t0, t1, latDeg, lonDeg) {
  const h = (t) => {
    const a = moonAltitude(t, latDeg, lonDeg);
    return a.altitude - a.horizon;
  };
  const step = 10 * 60000;
  const events = [];
  let ta = t0;
  let ha = h(ta);
  const upAtStart = ha > 0;
  while (ta < t1) {
    const tb = Math.min(ta + step, t1);
    const hb = h(tb);
    if (ha <= 0 !== hb <= 0) {
      let [x0, y0, x1, y1] = [ta, ha, tb, hb];
      for (let i = 0; i < 6 && y1 !== y0; i++) {
        const x2 = x1 - (y1 * (x1 - x0)) / (y1 - y0);
        [x0, y0, x1, y1] = [x1, y1, x2, h(x2)];
      }
      events.push({ time: x1, kind: hb > 0 ? 'rise' : 'set' });
    }
    [ta, ha] = [tb, hb];
  }
  return { upAtStart, events };
}

/**
 * The synodic month in the common phase model. The mean phase advances
 * uniformly from a reference mean new moon; the correction Δ(t) is the true
 * elongation minus the mean one — the Moon's real, uneven motion around its
 * elliptical, Sun-perturbed orbit (up to roughly ±20 hours: mostly the Moon's orbital eccentricity, plus evection, variation and the Sun's own uneven motion).
 */
export const lunarCycle = createCycle({
  name: 'synodic month',
  period: SYNODIC_MONTH_MS,
  epoch: MEAN_NEW_MOON_EPOCH,
  correction: (t) => wrapHalf(moonState(t).elongation / 360 - (t - MEAN_NEW_MOON_EPOCH) / SYNODIC_MONTH_MS),
});

/**
 * The draconic month: the Moon's passage from ascending node to ascending
 * node (27.2122 d). Phase = (λ☾ − ☊)/360, so 0 and 0.5 are the moments the
 * Moon crosses the ecliptic. Eclipses need a new or full moon close to one of
 * these crossings, which is why this cycle matters. The mean phase is the
 * Moon's mean argument of latitude F (Meeus ch. 47); the correction is the
 * Moon's true longitude minus its mean longitude.
 */
const DRACONIC_RATE = 483202.0175233; // degrees per Julian century
export const DRACONIC_MONTH_MS = (360 / DRACONIC_RATE) * 36525 * DAY_MS;
const DRACONIC_EPOCH = (2451545.0 - 2440587.5) * DAY_MS + (-93.272095 / DRACONIC_RATE) * 36525 * DAY_MS - DELTA_T_MS;

export function draconicPhase(t) {
  const { longitude, node } = moonState(t);
  return mod360(longitude - node) / 360;
}

export const draconicCycle = createCycle({
  name: 'draconic month',
  period: DRACONIC_MONTH_MS,
  epoch: DRACONIC_EPOCH,
  correction: (t) => wrapHalf(draconicPhase(t) - (t - DRACONIC_EPOCH) / DRACONIC_MONTH_MS),
});

export const PRINCIPAL_PHASES = ['New moon', 'First quarter', 'Full moon', 'Last quarter'];

/** Instant nearest `guess` at which the true phase equals `target`. */
const timeOfLunarPhase = (target, guess) => timeOfPhase(lunarCycle, target, guess, 8);

/**
 * The lunation containing t: the preceding new moon and the next principal phase.
 * @returns {{lastNewMoon:number, age:number, next:{index:number, name:string, time:number}}}
 */
export function lunation(t) {
  const T = SYNODIC_MONTH_MS;
  const p = lunarCycle.phase(t);

  let lastNewMoon = timeOfLunarPhase(0, t - p * T);
  if (lastNewMoon > t) lastNewMoon = timeOfLunarPhase(0, lastNewMoon - T);

  let k = Math.floor(p * 4) + 1; // next quarter, counted from this lunation's new moon
  let time = timeOfLunarPhase((k % 4) / 4, lastNewMoon + (k / 4) * T);
  if (time <= t) {
    k += 1;
    time = timeOfLunarPhase((k % 4) / 4, lastNewMoon + (k / 4) * T);
  }
  return { lastNewMoon, age: t - lastNewMoon, next: { index: k % 4, name: PRINCIPAL_PHASES[k % 4], time } };
}

/**
 * Conventional name of the phase. Principal phases are instants; here each
 * is given a ±12-hour window, with crescent/gibbous names in between.
 */
export function phaseName(phase) {
  const w = (0.5 * DAY_MS) / SYNODIC_MONTH_MS;
  for (let q = 0; q < 4; q++) {
    if (Math.abs(wrapHalf(phase - q / 4)) < w) return PRINCIPAL_PHASES[q];
  }
  const waxing = phase < 0.5;
  const gibbous = phase > 0.25 && phase < 0.75;
  return `${waxing ? 'Waxing' : 'Waning'} ${gibbous ? 'gibbous' : 'crescent'}`;
}
