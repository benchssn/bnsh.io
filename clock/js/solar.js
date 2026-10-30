/**
 * solar.js — Solar ephemeris, apparent solar time and the events of the
 * solar day (sunrise, solar noon, sunset, solar midnight).
 *
 * Sources: the low-precision solar theory in Jean Meeus, "Astronomical
 * Algorithms" (2nd ed., ch. 25 & 28) — the same formulation used by the NOAA
 * Solar Calculator. Over 1800–2200 it gives the Sun's declination to ~0.01°
 * and the equation of time to a few seconds.
 *
 * Time scale: instants are JavaScript milliseconds since 1970-01-01T00:00Z.
 * We treat UTC ≈ UT1 (they differ by < 0.9 s) and neglect ΔT = TT − UT
 * (~69 s), which moves the Sun by less than 3″ — far below what this clock
 * can show.
 *
 * Longitude convention: degrees, east positive. Latitude: degrees, north
 * positive.
 */

import { TAU, createCycle, timeOfPhase } from './phase.js';

export const DAY_MS = 86_400_000;

/** TT − UT ≈ 69 s in the 2020s; used where a minute of time is visible (Moon, seasons, planets). */
export const DELTA_T_MS = 69_000;

/** J2000.0 epoch (2000-01-01 12:00 TT) as a UTC millisecond value. */
export const J2000_MS = Date.UTC(2000, 0, 1, 12) - 64_000;
export const CENTURY_MS = 36525 * DAY_MS;
const DEG = Math.PI / 180;

/** Altitude of the Sun's centre at sunrise/sunset: −34′ refraction − 16′ semi-diameter. */
export const SUNRISE_ALTITUDE_DEG = -0.833;

const julianDay = (t) => t / DAY_MS + 2440587.5;
const mod360 = (x) => ((x % 360) + 360) % 360;

/**
 * Apparent solar coordinates at instant t.
 * @returns {{declination:number, eotMinutes:number, eclipticLongitude:number}}
 *   declination in radians, equation of time in minutes (apparent − mean),
 *   apparent ecliptic longitude in degrees.
 */
export function sunEphemeris(t) {
  const T = (julianDay(t) - 2451545.0) / 36525; // Julian centuries since J2000.0

  // Mean longitude, mean anomaly and orbital eccentricity of the Earth–Sun orbit.
  const L0 = mod360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) * DEG;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  // Equation of the centre → true longitude → apparent longitude
  // (correcting for nutation and aberration).
  const C =
    Math.sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * DEG;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;

  // Obliquity of the ecliptic, corrected for nutation.
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG;

  const declination = Math.asin(Math.sin(eps) * Math.sin(lambda));

  // Equation of time (Smart 1956 / Meeus eq. 28.3 series form): the hour
  // angle of the true Sun minus that of the fictitious mean Sun.
  const y = Math.tan(eps / 2) ** 2;
  const L = L0 * DEG;
  const E =
    y * Math.sin(2 * L) -
    2 * e * Math.sin(M) +
    4 * e * y * Math.sin(M) * Math.cos(2 * L) -
    0.5 * y * y * Math.sin(4 * L) -
    1.25 * e * e * Math.sin(2 * M);

  return {
    declination,
    eotMinutes: (4 * E) / DEG, // 1° of hour angle = 4 minutes of time
    eclipticLongitude: lambda / DEG,
    obliquity: eps / DEG, // true obliquity of the ecliptic, degrees
  };
}

/**
 * Local mean sidereal time at longitude λ, in degrees:
 * Greenwich mean sidereal time (Meeus eq. 12.4, from UT) plus longitude.
 * The hour angle of any body is LST − α.
 */
export function localSiderealTime(t, lonDeg) {
  const d = t / DAY_MS + 2440587.5 - 2451545.0;
  const T = d / 36525;
  return mod360(280.46061837 + 360.98564736629 * d + T * T * (0.000387933 - T / 38710000) + lonDeg);
}

/** Equation of time at t, in minutes. */
export const equationOfTime = (t) => sunEphemeris(t).eotMinutes;

/**
 * The apparent solar day as a cycle in the common phase model.
 *
 * Mean solar time:      phase̅ = frac((t − t₀)/T),  t₀ = −(λ/360)·T
 *                       (Unix time 0 is midnight at Greenwich, so local mean
 *                       midnight occurs λ/360 of a day earlier east of it.)
 * Apparent solar time:  phase = phase̅ + EoT(t)/1440
 *
 * Phase 0 = solar midnight, 0.5 = solar noon (the Sun crosses the meridian).
 */
export function apparentSolarCycle(lonDeg) {
  return createCycle({
    name: 'apparent solar day',
    period: DAY_MS,
    epoch: -(lonDeg / 360) * DAY_MS,
    correction: (t) => equationOfTime(t) / 1440,
  });
}

/**
 * Topocentric-horizon position of the Sun's centre (geometric, i.e. without
 * atmospheric refraction).
 * @returns {{altitude:number, azimuth:number}} degrees; azimuth from north, eastward.
 */
export function sunPosition(t, latDeg, lonDeg) {
  const { declination: d } = sunEphemeris(t);
  const phi = latDeg * DEG;
  const H = (apparentSolarCycle(lonDeg).phase(t) - 0.5) * TAU; // local hour angle
  const altitude = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) + Math.PI;
  return { altitude: altitude / DEG, azimuth: mod360(azimuth / DEG) };
}

/**
 * cos of the hour angle at which the Sun's centre reaches altitude h0.
 * > 1: never that high (polar night); < −1: never that low (midnight sun).
 */
function cosHourAngleAt(t, latDeg, h0Deg) {
  const { declination: d } = sunEphemeris(t);
  const phi = latDeg * DEG;
  return (Math.sin(h0Deg * DEG) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d));
}

/**
 * The apparent solar day containing instant t: from the solar midnight before
 * t to the solar midnight after it, with its sunrise, noon and sunset.
 *
 * @returns {{
 *   start:number, noon:number, end:number,
 *   condition:'normal'|'polar-night'|'midnight-sun',
 *   sunrise:number|null, sunset:number|null,
 *   noonAltitude:number
 * }}
 */
export function solarDay(t, latDeg, lonDeg) {
  // Avoid the singular cos(φ) = 0 exactly at the poles.
  const lat = Math.max(-89.99, Math.min(89.99, latDeg));
  const sun = apparentSolarCycle(lonDeg);

  let start = timeOfPhase(sun, 0, t - sun.phase(t) * DAY_MS);
  if (start > t) start = timeOfPhase(sun, 0, start - DAY_MS);
  const end = timeOfPhase(sun, 0, start + DAY_MS);
  const noon = timeOfPhase(sun, 0.5, start + DAY_MS / 2);

  const day = {
    start,
    noon,
    end,
    condition: 'normal',
    sunrise: null,
    sunset: null,
    noonAltitude: sunPosition(noon, lat, lonDeg).altitude,
  };

  const cosH0 = cosHourAngleAt(noon, lat, SUNRISE_ALTITUDE_DEG);
  if (cosH0 > 1) day.condition = 'polar-night';
  else if (cosH0 < -1) day.condition = 'midnight-sun';
  else {
    // Phase of the horizon crossing = 0.5 ∓ H₀/2π, re-evaluated at the crossing
    // itself because the declination drifts by up to ~0.4° per day.
    const crossing = (sign) => (tt) => {
      const c = Math.max(-1, Math.min(1, cosHourAngleAt(tt, lat, SUNRISE_ALTITUDE_DEG)));
      return 0.5 + (sign * Math.acos(c)) / TAU;
    };
    const H0 = Math.acos(cosH0) / TAU; // in turns
    day.sunrise = timeOfPhase(sun, crossing(-1), noon - H0 * DAY_MS);
    day.sunset = timeOfPhase(sun, crossing(+1), noon + H0 * DAY_MS);
  }
  return day;
}
