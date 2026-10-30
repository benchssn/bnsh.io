/**
 * cycles.js — The registry of cycles shown by the instrument.
 *
 * Every entry wraps a phase-model cycle (see phase.js) with the events that
 * give it meaning (named phases) and a cache of the next upcoming event. All
 * views, the alignment list and the recurrence explorer read from here, so
 * they agree with one another by construction.
 */

import { nextPhaseEvent } from './phase.js';
import { apparentSolarCycle } from './solar.js';
import { lunarCycle, draconicCycle } from './lunar.js';
import { seasonalCycle, SEASON_EVENTS } from './seasons.js';
import { PLANETS, synodicCycle, synodicEvents } from './planets.js';

/**
 * @typedef {object} CycleEntry
 * @property {string} id
 * @property {string} name
 * @property {string} kind        'solar' | 'lunar' | 'seasonal' | 'planetary'
 * @property {object} cycle       phase-model cycle: { period, epoch, phase, meanPhase }
 * @property {{phase:number, name:string, short:string}[]} events
 * @property {string} correctionName  what the true − mean correction physically is
 */

export function buildCycles(longitude) {
  const entries = [
    {
      id: 'day',
      name: 'Solar day',
      kind: 'solar',
      cycle: apparentSolarCycle(longitude),
      events: [
        { phase: 0, name: 'Solar midnight', short: 'Midnight' },
        { phase: 0.5, name: 'Solar noon', short: 'Noon' },
      ],
      correctionName: 'equation of time',
    },
    {
      id: 'month',
      name: 'Synodic month',
      kind: 'lunar',
      cycle: lunarCycle,
      events: [
        { phase: 0, name: 'New moon', short: 'New' },
        { phase: 0.25, name: 'First quarter', short: 'FQ' },
        { phase: 0.5, name: 'Full moon', short: 'Full' },
        { phase: 0.75, name: 'Last quarter', short: 'LQ' },
      ],
      correctionName: 'lunar inequalities',
    },
    {
      id: 'draconic',
      name: 'Draconic month',
      kind: 'lunar',
      cycle: draconicCycle,
      events: [
        { phase: 0, name: 'Moon at ascending node', short: 'Asc. node' },
        { phase: 0.25, name: 'Moon furthest north of the ecliptic', short: 'North' },
        { phase: 0.5, name: 'Moon at descending node', short: 'Desc. node' },
        { phase: 0.75, name: 'Moon furthest south of the ecliptic', short: 'South' },
      ],
      correctionName: 'lunar inequalities',
    },
    {
      id: 'year',
      name: 'Tropical year',
      kind: 'seasonal',
      cycle: seasonalCycle,
      events: SEASON_EVENTS,
      correctionName: 'equation of the centre',
    },
    ...PLANETS.map((planet) => ({
      id: planet.id,
      name: planet.name,
      kind: 'planetary',
      planet,
      cycle: synodicCycle(planet),
      events: synodicEvents(planet),
      correctionName: 'orbital eccentricities',
    })),
  ];
  entries.forEach((e) => (e.cache = null));
  return entries;
}

/**
 * Next named event of a cycle after t, cached until it passes. The cache is
 * also invalidated if time moves backwards past the instant it was computed
 * (time scrubbing), because an earlier event might then come first.
 */
export function nextEvent(entry, t) {
  const c = entry.cache;
  if (c && t >= c.from && t < c.time) return c;
  const found = nextPhaseEvent(
    entry.cycle,
    entry.events.map((e) => e.phase),
    t
  );
  entry.cache = { from: t, time: found.time, event: entry.events[found.index] };
  return entry.cache;
}

/** The solar day depends on longitude; swap its cycle when the location changes. */
export function setLongitude(entries, longitude) {
  const day = entries.find((e) => e.id === 'day');
  day.cycle = apparentSolarCycle(longitude);
  day.cache = null;
}
