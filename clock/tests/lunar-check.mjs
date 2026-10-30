/**
 * Reference checks for js/lunar.js. Run with:  node tests/lunar-check.mjs
 *
 * Reference times are published principal-phase times (USNO / NASA eclipse
 * data), rounded to the minute, so the tolerance is ±2 minutes.
 */

import { lunarCycle, lunation, moonState, phaseName, SYNODIC_MONTH_MS, moonAltitude, moonRiseSet } from '../js/lunar.js';
import { solarDay } from '../js/solar.js';
import { timeOfPhase } from '../js/phase.js';

let failures = 0;
const MIN = 60_000;

function report(ok, text) {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`);
}

const REFERENCE = [
  ['New moon', 0, '2024-04-08T18:21Z'], // total solar eclipse, North America
  ['New moon', 0, '2026-02-17T12:01Z'], // annular solar eclipse
  ['Full moon', 0.5, '2026-03-03T11:38Z'], // total lunar eclipse
  ['New moon', 0, '2026-08-12T17:37Z'], // total solar eclipse, Spain/Iceland
  ['Full moon', 0.5, '2026-08-28T04:18Z'], // partial lunar eclipse
];

for (const [name, target, iso] of REFERENCE) {
  const expected = Date.parse(iso);
  const found = timeOfPhase(lunarCycle, target, expected + 2 * 86_400_000, 8); // start 2 days off
  const err = (found - expected) / MIN;
  report(Math.abs(err) <= 2, `${name} ${iso}: error ${err.toFixed(2)} min`);
}

// Illumination at the extremes
{
  const full = moonState(Date.parse('2026-03-03T11:38Z')).illuminated;
  const nw = moonState(Date.parse('2026-08-12T17:37Z')).illuminated;
  report(full > 0.999, `illuminated at full moon: ${full.toFixed(4)}`);
  report(nw < 0.001, `illuminated at new moon: ${nw.toFixed(4)}`);
}

// Lunation bookkeeping: age, next phase, names
{
  const t = Date.parse('2026-08-23T00:00Z'); // between first quarter (Aug 20) and full (Aug 28)
  const l = lunation(t);
  report(Math.abs((l.lastNewMoon - Date.parse('2026-08-12T17:37Z')) / MIN) <= 2, `last new moon before 2026-08-23: ${new Date(l.lastNewMoon).toISOString()}`);
  report(l.next.time > t && l.next.name === 'Full moon', `next principal phase: ${l.next.name} ${new Date(l.next.time).toISOString()}`);
  report(phaseName(lunarCycle.phase(t)).startsWith('Waxing'), `phase name: ${phaseName(lunarCycle.phase(t))}`);
}

// True minus mean phase stays within the expected range (under ~22 h)
{
  let maxLead = 0;
  for (let t = Date.parse('2026-01-01T00:00Z'); t < Date.parse('2027-01-01T00:00Z'); t += 86_400_000 / 4) {
    const lead = Math.abs(((lunarCycle.phase(t) - lunarCycle.meanPhase(t) + 1.5) % 1) - 0.5) * SYNODIC_MONTH_MS;
    maxLead = Math.max(maxLead, lead);
  }
  report(maxLead / 3.6e6 > 10 && maxLead / 3.6e6 < 22, `largest |true − mean| in 2026: ${(maxLead / 3.6e6).toFixed(1)} h`);
}

// Latitude series: the 2025 major lunar standstill reached declination ±28.7°
{
  let maxDec = 0;
  for (let t = Date.parse('2025-01-01T00:00Z'); t < Date.parse('2026-01-01T00:00Z'); t += 3.6e6) {
    maxDec = Math.max(maxDec, Math.abs(moonAltitude(t, 0, 0).declination));
  }
  report(Math.abs(maxDec - 28.7) < 0.15, `max |declination| in 2025 (major standstill): ${maxDec.toFixed(2)}°`);
}

// Distance series: 2026 perigees ~356 600 km, apogees ~406 500 km
{
  let [lo, hi] = [Infinity, 0];
  for (let t = Date.parse('2026-01-01T00:00Z'); t < Date.parse('2027-01-01T00:00Z'); t += 3.6e6) {
    const d = moonState(t).distance;
    [lo, hi] = [Math.min(lo, d), Math.max(hi, d)];
  }
  report(lo > 356_300 && lo < 357_000 && hi > 406_000 && hi < 406_800, `distance range 2026: ${lo.toFixed(0)}–${hi.toFixed(0)} km`);
}

// Moonrise/moonset: a full moon rises near sunset and sets near sunrise;
// at each computed event the Moon's centre is exactly at its rise altitude h₀.
{
  const [lat, lon] = [51.4769, 0];
  const day = solarDay(Date.parse('2026-03-03T12:00Z'), lat, lon);
  const { events } = moonRiseSet(day.start, day.end, lat, lon);
  const rise = events.find((e) => e.kind === 'rise');
  const set = events.find((e) => e.kind === 'set');
  report(rise && Math.abs(rise.time - day.sunset) / MIN < 45, `full moon 2026-03-03 rises ${((rise.time - day.sunset) / MIN).toFixed(0)} min after sunset (Greenwich)`);
  report(set && Math.abs(set.time - day.sunrise) / MIN < 45, `and sets ${((set.time - day.sunrise) / MIN).toFixed(0)} min after sunrise`);
  const a = moonAltitude(rise.time, lat, lon);
  report(Math.abs(a.altitude - a.horizon) < 0.002, `altitude at moonrise − h₀: ${(a.altitude - a.horizon).toFixed(4)}°`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
