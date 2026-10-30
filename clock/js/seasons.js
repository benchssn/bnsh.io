/**
 * seasons.js — The tropical year: the Sun's journey around the ecliptic,
 * equinox to equinox.
 *
 * Phase is defined from the Sun's apparent ecliptic longitude λ☉:
 *
 *     phase = (λ☉ − 270°) / 360
 *
 * so the December solstice is phase 0 (bottom of a dial) and the June
 * solstice phase 0.5 (top). That puts the *northern* summer at the top. The
 * astronomy is the same for both hemispheres, so the phase is not flipped for
 * southern observers. The names describe the event, not the local season.
 *
 * Mean model: the Sun's mean longitude L₀ advances uniformly at
 * 36000.76983° per century, which gives the tropical year
 * T = 365.24219 d. The correction Δ(t) = true − mean is the Sun's equation
 * of the centre (Earth's orbital eccentricity), which swings by about ±1.9°,
 * or roughly ±2 days. It is why the seasons have unequal lengths: northern
 * summer, from June solstice to September equinox, is about 4.6 days longer
 * than northern winter.
 */

import { createCycle, wrapHalf } from './phase.js';
import { CENTURY_MS, DELTA_T_MS, J2000_MS, sunEphemeris } from './solar.js';

const MEAN_RATE = 36000.76983; // degrees per Julian century
export const TROPICAL_YEAR_MS = (360 / MEAN_RATE) * CENTURY_MS;
const EPOCH = J2000_MS + ((270 - 280.46646) / MEAN_RATE) * CENTURY_MS; // mean longitude = 270°

export function seasonalPhase(t) {
  const λ = sunEphemeris(t + DELTA_T_MS).eclipticLongitude;
  return (((λ - 270) % 360) + 360) % 360 / 360;
}

export const seasonalCycle = createCycle({
  name: 'tropical year',
  period: TROPICAL_YEAR_MS,
  epoch: EPOCH,
  correction: (t) => wrapHalf(seasonalPhase(t) - (t - EPOCH) / TROPICAL_YEAR_MS),
});

export const SEASON_EVENTS = [
  { phase: 0, name: 'December solstice', short: 'Dec sol.' },
  { phase: 0.25, name: 'March equinox', short: 'Mar eq.' },
  { phase: 0.5, name: 'June solstice', short: 'Jun sol.' },
  { phase: 0.75, name: 'September equinox', short: 'Sep eq.' },
];
