/**
 * Reference checks for js/solar.js. Run with:  node tests/solar-check.mjs
 *
 * Reference values are published almanac figures (NOAA Solar Calculator /
 * USNO), rounded to the minute, so tolerances are ±1–2 minutes.
 */

import { solarDay, equationOfTime, sunEphemeris, sunPosition } from '../js/solar.js';

let failures = 0;
const MIN = 60_000;

function check(label, actual, expected, tolerance, unit = '') {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  const fmt = (x) => (typeof x === 'number' ? x.toFixed(2) : x);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${fmt(actual)}${unit} (expected ${fmt(expected)} ± ${tolerance}${unit})`);
}

const minutesBetween = (a, iso) => (a - Date.parse(iso)) / MIN;

// Equation of time extrema and zeros (minutes)
check('EoT 2026-11-03', equationOfTime(Date.parse('2026-11-03T12:00Z')), 16.45, 0.15, ' min');
check('EoT 2026-02-11', equationOfTime(Date.parse('2026-02-11T12:00Z')), -14.2, 0.15, ' min');
check('EoT 2026-04-15', equationOfTime(Date.parse('2026-04-15T12:00Z')), 0.0, 0.3, ' min');

// Declination at the June solstice 2026 (2026-06-21 08:24 UTC)
check(
  'Declination at June solstice',
  (sunEphemeris(Date.parse('2026-06-21T08:24Z')).declination * 180) / Math.PI,
  23.436,
  0.01,
  '°'
);

// Greenwich, 2026-06-21: sunrise 03:43 UTC, noon 12:02 UTC, sunset 20:21 UTC
{
  const d = solarDay(Date.parse('2026-06-21T12:00Z'), 51.4769, -0.0005);
  check('Greenwich sunrise', minutesBetween(d.sunrise, '2026-06-21T03:43Z'), 0, 1.5, ' min');
  check('Greenwich noon', minutesBetween(d.noon, '2026-06-21T12:02Z'), 0, 1, ' min');
  check('Greenwich sunset', minutesBetween(d.sunset, '2026-06-21T20:21Z'), 0, 1.5, ' min');
}

// New York, 2026-12-21: sunrise 07:16 EST, noon 11:54 EST, sunset 16:32 EST (UTC−5)
{
  const d = solarDay(Date.parse('2026-12-21T17:00Z'), 40.7128, -74.006);
  check('New York sunrise', minutesBetween(d.sunrise, '2026-12-21T12:16Z'), 0, 1.5, ' min');
  check('New York noon', minutesBetween(d.noon, '2026-12-21T16:54Z'), 0, 1, ' min');
  check('New York sunset', minutesBetween(d.sunset, '2026-12-21T21:32Z'), 0, 1.5, ' min');
}

// Polar conditions at Tromsø (69.65° N)
{
  const summer = solarDay(Date.parse('2026-06-21T12:00Z'), 69.65, 18.96);
  const winter = solarDay(Date.parse('2026-12-21T12:00Z'), 69.65, 18.96);
  console.log(`${summer.condition === 'midnight-sun' ? 'ok  ' : 'FAIL'}  Tromsø June: ${summer.condition}`);
  console.log(`${winter.condition === 'polar-night' ? 'ok  ' : 'FAIL'}  Tromsø December: ${winter.condition}`);
  if (summer.condition !== 'midnight-sun') failures++;
  if (winter.condition !== 'polar-night') failures++;
}

// Consistency: geometric altitude at computed sunrise equals −0.833°
{
  const d = solarDay(Date.parse('2026-03-20T12:00Z'), -33.87, 151.21); // Sydney
  check('Altitude at Sydney sunrise', sunPosition(d.sunrise, -33.87, 151.21).altitude, -0.833, 0.01, '°');
  check('Azimuth at Sydney noon', sunPosition(d.noon, -33.87, 151.21).azimuth % 360, 0, 0.05, '°');
}

// The solar day brackets the instant it was asked for
{
  const t = Date.parse('2026-10-30T09:00Z');
  const d = solarDay(t, 45, -73);
  const ok = d.start <= t && t < d.end && d.start < d.noon && d.noon < d.end;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  solar day brackets t (length ${((d.end - d.start) / 1000 - 86400).toFixed(1)} s from 24 h)`);
  if (!ok) failures++;
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
