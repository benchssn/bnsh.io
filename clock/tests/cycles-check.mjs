/**
 * Reference checks for the seasonal, draconic and planetary cycles and the
 * recurrence arithmetic. Run with:  node tests/cycles-check.mjs
 *
 * Reference instants are published almanac values (USNO / IMCCE), rounded
 * to the minute or hour. Tolerances reflect each model's accuracy.
 */

import { seasonalCycle, TROPICAL_YEAR_MS } from '../js/seasons.js';
import { draconicCycle, DRACONIC_MONTH_MS, SYNODIC_MONTH_MS } from '../js/lunar.js';
import { PLANETS, synodicCycle, geocentric } from '../js/planets.js';
import { timeOfPhase, convergents, wrapHalf } from '../js/phase.js';
import { planetaryHours, zodiacal } from '../js/esoterica.js';
import { solarDay } from '../js/solar.js';

let failures = 0;
const HOUR = 3.6e6;
const DAY = 864e5;

function report(ok, text) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`);
}

function checkEvent(label, cycle, target, iso, toleranceHours) {
  const expected = Date.parse(iso);
  const found = timeOfPhase(cycle, target, expected + 0.1 * cycle.period); // start ~10% of a period off
  const err = (found - expected) / HOUR;
  report(Math.abs(err) <= toleranceHours, `${label} ${iso}: error ${err.toFixed(2)} h (±${toleranceHours} h)`);
}

// Equinoxes and solstices 2026 — Sun longitude good to ~0.01°, i.e. ~15 min
checkEvent('March equinox', seasonalCycle, 0.25, '2026-03-20T14:46Z', 0.33);
checkEvent('June solstice', seasonalCycle, 0.5, '2026-06-21T08:24Z', 0.33);
checkEvent('September equinox', seasonalCycle, 0.75, '2026-09-23T00:05Z', 0.33);
checkEvent('December solstice', seasonalCycle, 0, '2026-12-21T20:50Z', 0.33);
report(Math.abs(TROPICAL_YEAR_MS / DAY - 365.24219) < 1e-4, `tropical year ${(TROPICAL_YEAR_MS / DAY).toFixed(5)} d`);

// Planetary synodic events — Keplerian elements, fraction of a day
const planet = Object.fromEntries(PLANETS.map((p) => [p.id, synodicCycle(p)]));
checkEvent('Mercury inferior conjunction (transit)', planet.mercury, 0.5, '2019-11-11T15:20Z', 3);
checkEvent('Venus inferior conjunction', planet.venus, 0.5, '2025-03-23T01:00Z', 12);
checkEvent('Mars opposition', planet.mars, 0.5, '2025-01-16T02:00Z', 12);
checkEvent('Jupiter opposition', planet.jupiter, 0.5, '2026-01-10T08:00Z', 24);
checkEvent('Saturn opposition', planet.saturn, 0.5, '2025-09-21T04:00Z', 24);
for (const [id, days] of [['mercury', 115.88], ['venus', 583.92], ['mars', 779.94], ['jupiter', 398.88], ['saturn', 378.09]]) {
  report(Math.abs(planet[id].period / DAY - days) < 0.05, `${id} mean synodic period ${(planet[id].period / DAY).toFixed(2)} d (expected ${days})`);
}
{
  const g = geocentric('venus', Date.parse('2025-06-01T00:00Z')); // greatest western elongation 2025-06-01: 45.9° W
  report(Math.abs(g.elongation + 45.9) < 0.5, `Venus elongation 2025-06-01: ${g.elongation.toFixed(1)}° (expected −45.9°, west)`);
}

// Eclipses happen at a new or full moon with the Moon near a node:
// draconic phase near 0 or 0.5.
for (const iso of ['2026-02-17T12:01Z', '2026-03-03T11:38Z', '2026-08-12T17:37Z', '2026-08-28T04:18Z']) {
  const p = draconicCycle.phase(Date.parse(iso));
  const fromNode = Math.min(Math.abs(wrapHalf(p)), Math.abs(wrapHalf(p - 0.5))) * 360;
  report(fromNode < 15, `eclipse ${iso}: Moon ${fromNode.toFixed(1)}° from a node`);
}
report(Math.abs(DRACONIC_MONTH_MS / DAY - 27.21222) < 1e-4, `draconic month ${(DRACONIC_MONTH_MS / DAY).toFixed(5)} d`);

// Known commensurabilities fall out of the continued fractions
function hasConvergent(x, p, q) {
  return convergents(x).some((c) => c.p === p && c.q === q);
}
report(hasConvergent(TROPICAL_YEAR_MS / SYNODIC_MONTH_MS, 235, 19), 'Metonic cycle: 19 years ≈ 235 synodic months');
report(hasConvergent(SYNODIC_MONTH_MS / DRACONIC_MONTH_MS, 242, 223), 'Saros: 223 synodic ≈ 242 draconic months');
report(hasConvergent(planet.venus.period / TROPICAL_YEAR_MS, 8, 5), 'Venus: 5 synodic periods ≈ 8 years');

// Traditional notation
report(zodiacal(217.4).text === '♏\uFE0E 7°24′', `zodiacal(217.4°) = ${zodiacal(217.4).text}`);
report(zodiacal(0).sign.name === 'Aries' && zodiacal(359.99).sign.name === 'Pisces', 'sign boundaries at 0° and 360°');
{
  // Sunday 2026-11-01 at Greenwich: first hour of the day is the Sun's, the
  // second Venus's; the sequence runs on unbroken into Monday, ruled by the Moon.
  const [lat, lon] = [51.4769, 0];
  const sunday = planetaryHours(solarDay(Date.parse('2026-11-01T12:00Z'), lat, lon), lat, lon, 'Europe/London');
  const monday = planetaryHours(solarDay(Date.parse('2026-11-02T12:00Z'), lat, lon), lat, lon, 'Europe/London');
  const first = sunday.find((h) => h.daytime);
  report(first.ruler.id === 'sun' && sunday[13].ruler.id === 'venus', `Sunday hours 1–2: ${first.ruler.id}, ${sunday[13].ruler.id}`);
  report(monday.find((h) => h.daytime).ruler.id === 'moon', 'Monday hour 1: moon');
  const lastSunday = sunday[35];
  const firstMonday = monday[12];
  report(Math.abs(lastSunday.end - firstMonday.start) < 1000, 'night hours end exactly at the next sunrise');
  const dayLen = sunday[12].end - sunday[12].start;
  const nightLen = sunday[24].end - sunday[24].start;
  report(dayLen < nightLen, `November: day hours (${(dayLen / 6e4).toFixed(1)} min) shorter than night hours (${(nightLen / 6e4).toFixed(1)} min)`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
