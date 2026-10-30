/**
 * main.js — Wires location, astronomy and views together, and drives the
 * animation.
 *
 * Every frame derives everything from one instant, t = timebase.now(): live
 * wall-clock time, or simulated time when exploring. Nothing is accumulated
 * frame to frame, so there is no drift at any rate, and every view always
 * shows the same instant.
 */

import { DAY_MS, DELTA_T_MS, SUNRISE_ALTITUDE_DEG, apparentSolarCycle, equationOfTime, solarDay, sunEphemeris, sunPosition } from './solar.js';
import { SYNODIC_MONTH_MS, lunarCycle, lunation, moonRiseSet, moonState, phaseName } from './lunar.js';
import { planetaryHours, zodiacal } from './esoterica.js';
import { frac, wrapHalf } from './phase.js';
import { buildCycles, setLongitude } from './cycles.js';
import { createDial } from './dial.js';
import { createCycleGrid } from './views/cycle-grid.js';
import { createAlignment } from './views/alignment.js';
import { createRecurrence } from './views/recurrence.js';
import { createTimebar } from './views/timebar.js';
import { createTimebase } from './timebase.js';
import { pad, signedDuration } from './format.js';
import {
  browserTimeZone,
  formatCoordinates,
  isValidTimeZone,
  listTimeZones,
  loadLocation,
  requestGeolocation,
  saveLocation,
  zoneOffsetMinutes,
} from './location.js';

const $ = (id) => document.getElementById(id);
const timebase = createTimebase();
const dial = createDial($('dial'));

const state = {
  location: null,
  sun: null, // apparent solar cycle for the current longitude
  day: null, // current solar day (see solar.solarDay)
  midnight: null, // which solar midnight is labelled (start or end of day)
  lunation: null, // current lunation (see lunar.lunation)
  moonSky: null, // { upAtStart, events } — moonrises and moonsets in the current solar day
  hours: null, // planetary hours around the current solar day (null in polar conditions)
  hourIndex: -1,
  fmt: makeFormatters(browserTimeZone()),
  lastSecond: -1,
};

// All cycles (Iteration 3) and the views built on them (Iterations 3–5).
const cycles = buildCycles(0);
const grid = createCycleGrid($('cycle-grid'), cycles);
const alignment = createAlignment(
  { orrerySvg: $('orrery'), ringSvg: $('ecliptic'), pairsList: $('al-pairs'), seasonText: $('al-season'), upcomingList: $('al-upcoming') },
  timebase.now(),
  cycles
);
const timebar = createTimebar(timebase, () => state.location?.tz ?? browserTimeZone(), () => {
  state.lastSecond = -1; // force a text refresh after any time control
});
const recurrence = createRecurrence(
  {
    a: $('rc-a'),
    b: $('rc-b'),
    n: $('rc-n'),
    model: { get value() { return document.querySelector('input[name="rc-model"]:checked').value; }, addEventListener: (type, fn) => document.querySelectorAll('input[name="rc-model"]').forEach((r) => r.addEventListener(type, fn)) },
    join: $('rc-join'),
    table: $('rc-table'),
    summary: $('rc-summary'),
    note: $('rc-note'),
    rerun: $('rc-rerun'),
    presets: [...document.querySelectorAll('[data-preset]')],
    torus3d: $('tp-torus'),
    torusFlat: $('tp-flat'),
    portraitNote: $('tp-note'),
  },
  $('rc-svg'),
  cycles,
  () => timebase.now(),
  () => state.fmt
);

// ---- formatting --------------------------------------------------------------

function makeFormatters(tz) {
  const base = { timeZone: tz, hourCycle: 'h23' };
  return {
    hms: new Intl.DateTimeFormat('en-US', { ...base, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    hm: new Intl.DateTimeFormat('en-US', { ...base, hour: '2-digit', minute: '2-digit' }),
    zone: new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }),
    date: new Intl.DateTimeFormat('en-US', { ...base, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateOnly: new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' }),
    weekday: new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** Apparent solar phase → "HH:MM:SS". */
function phaseToClock(p) {
  const s = Math.floor(frac(p) * 86400);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

function zoneLabel(t) {
  const abbr = state.fmt.zone.formatToParts(t).find((p) => p.type === 'timeZoneName')?.value ?? '';
  const off = zoneOffsetMinutes(t, state.location.tz);
  const utc = `UTC${off < 0 ? '−' : '+'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${state.fmt.weekday.format(t)} · ${abbr && !abbr.startsWith('GMT') ? `${abbr} · ${utc}` : utc}`;
}

// ---- solar day ---------------------------------------------------------------

function refreshDay(t) {
  const { lat, lon } = state.location;
  state.day = solarDay(t, lat, lon);
  state.midnight = null;
  updateEvents(t);
  refreshMoonSky();
  state.hours = planetaryHours(state.day, lat, lon, state.location.tz);
  state.hourIndex = null;
  updateHours(t);
}

/** Moonrise/moonset within the solar day, drawn as arcs where the Moon is up. */
function refreshMoonSky() {
  const { day, sun, fmt } = state;
  const { lat, lon } = state.location;
  const sky = moonRiseSet(day.start, day.end, lat, lon);
  state.moonSky = sky;

  const arcs = [];
  let up = sky.upAtStart;
  let from = day.start;
  for (const e of sky.events) {
    if (e.kind === 'set' && up) arcs.push([from, e.time]);
    if (e.kind === 'rise') from = e.time;
    up = e.kind === 'rise';
  }
  const allDay = sky.upAtStart && sky.events.length === 0;
  if (up && !allDay) arcs.push([from, day.end]);
  dial.setMoonSky(
    arcs.map(([a, b]) => ({ p0: sun.phase(a), p1: sun.phase(b) })),
    sky.events.map((e) => ({ phase: sun.phase(e.time), label: fmt.hm.format(e.time), kind: e.kind })),
    allDay
  );
}

/** Redraw the planetary-hours ring when the hour changes; returns the current hour. */
function updateHours(t) {
  const { hours, day, sun } = state;
  if (!hours) {
    if (state.hourIndex !== -2) dial.setHours(null);
    state.hourIndex = -2;
    return null;
  }
  const index = hours.findIndex((h) => t >= h.start && t < h.end);
  if (index !== state.hourIndex) {
    state.hourIndex = index;
    dial.setHours(
      hours
        .filter((h) => h.end > day.start && h.start < day.end)
        .map((h) => ({
          p0: sun.phase(Math.max(h.start, day.start)),
          p1: sun.phase(Math.min(h.end, day.end)),
          glyph: h.ruler.glyph,
          current: h === hours[index],
          daytime: h.daytime,
          startsHere: h.start >= day.start,
        }))
    );
  }
  return hours[index] ?? null;
}

/** Place the event markers. The labelled solar midnight is the one nearer t. */
function updateEvents(t) {
  const { day, sun, fmt } = state;
  const midnight = t - day.start < day.end - t ? day.start : day.end;
  if (midnight === state.midnight) return;
  state.midnight = midnight;

  const event = (x) => (x == null ? null : { phase: sun.phase(x), label: fmt.hm.format(x) });
  dial.setEvents({
    condition: day.condition,
    sunrise: event(day.sunrise),
    noon: event(day.noon),
    sunset: event(day.sunset),
    midnight: event(midnight),
  });

  const lengthMin = { normal: Math.round((day.sunset - day.sunrise) / 6e4), 'polar-night': 0, 'midnight-sun': 1440 }[day.condition];
  $('f-daylength').textContent = `${Math.floor(lengthMin / 60)} h ${pad(lengthMin % 60)} m`;
}

// ---- readouts ------------------------------------------------------------------

function updateReadouts(t, phase, position) {
  const { location, fmt } = state;
  dial.readout.solarTime.textContent = phaseToClock(phase);
  dial.readout.civilTime.textContent = fmt.hms.format(t);
  dial.readout.zone.textContent = zoneLabel(t);

  // Apparent solar time − civil time, decomposed into the equation of time
  // and everything else (longitude within the zone + daylight saving).
  const offsetMin = zoneOffsetMinutes(t, location.tz);
  const civilPhase = frac((t + offsetMin * 60000) / DAY_MS);
  const shift = wrapHalf(phase - civilPhase); // in days
  dial.setCivilShift(shift);

  const hour = updateHours(t);
  const polar = {
    'polar-night': 'Polar night — the Sun does not rise',
    'midnight-sun': 'Midnight sun — the Sun does not set',
  }[state.day.condition];
  dial.readout.status.textContent = polar ?? (hour ? `Hour of ${hour.ruler.name} · day of ${hour.dayRuler.name}` : '');

  $('f-sign').textContent = zodiacal(sunEphemeris(t + DELTA_T_MS).eclipticLongitude).text;
  $('f-eot').textContent = signedDuration(equationOfTime(t), { seconds: true });
  $('f-offset').textContent = signedDuration(shift * 1440);
  $('f-altitude').textContent = `${position.altitude.toFixed(1)}°`;
  $('f-azimuth').textContent = `${position.azimuth.toFixed(1)}°`;
}

/** Moon on the main dial every frame; its readouts with the text. */
function updateMoon(t, withText) {
  const l = state.lunation;
  if (!l || t < l.lastNewMoon || t >= l.next.time) state.lunation = lunation(t);

  const phase = lunarCycle.phase(t);
  const { illuminated, longitude } = moonState(t);
  dial.setMoon(phase, illuminated, state.location.lat < 0);
  if (!withText) return;

  const { lunation: lun, fmt } = state;
  const lead = wrapHalf(phase - lunarCycle.meanPhase(t)) * SYNODIC_MONTH_MS; // ms
  $('m-phase').textContent = phaseName(phase);
  $('m-illuminated').textContent = `${(illuminated * 100).toFixed(1)} %`;
  $('m-age').textContent = `${((t - lun.lastNewMoon) / DAY_MS).toFixed(2)} d`;
  $('m-lead').textContent = signedDuration(lead / 60000);
  $('m-next-name').textContent = lun.next.name;
  $('m-next').textContent = fmt.date.format(lun.next.time);
  $('m-sign').textContent = zodiacal(longitude).text;
  const { upAtStart, events } = state.moonSky;
  $('m-riseset').textContent = events.length
    ? events.map((e) => `${e.kind === 'rise' ? '↑' : '↓'} ${fmt.hm.format(e.time)}`).join('  ')
    : upAtStart
      ? 'Up all day'
      : 'Below all day';
}

// ---- animation loop ----------------------------------------------------------

function frame() {
  requestAnimationFrame(frame);
  if (!state.location) return;

  const t = timebase.now();
  if (!state.day || t >= state.day.end || t < state.day.start) refreshDay(t);

  // Live: text once per displayed second. Simulated: every frame, so that
  // every number on screen always describes the same instant as the geometry.
  const second = Math.floor(t / 1000);
  const withText = !timebase.live || second !== state.lastSecond;
  state.lastSecond = second;

  const { lat, lon } = state.location;
  const phase = state.sun.phase(t);
  const position = sunPosition(t, lat, lon);
  dial.setSun(phase, position.altitude);
  updateMoon(t, withText);
  grid.update(t, withText, state.fmt);
  alignment.update(t, withText, state.fmt);

  if (withText) {
    updateEvents(t);
    updateReadouts(t, phase, position);
    timebar.update(t);
  }
}

// ---- location ------------------------------------------------------------------

function setLocation(location, { persist = true } = {}) {
  state.location = location;
  state.sun = apparentSolarCycle(location.lon);
  state.fmt = makeFormatters(location.tz);
  setLongitude(cycles, location.lon);
  state.day = null;
  state.lastSecond = -1;
  if (persist) saveLocation(location);

  $('place-coords').textContent = formatCoordinates(location);
  $('place-zone').textContent = `${location.tz} · ${location.source === 'geolocation' ? 'device location' : 'manual'}`;
  dial.setActive(true);
}

const dialog = $('location-dialog');
const form = $('location-form');

function openDialog(message = '') {
  const { location } = state;
  form.lat.value = location ? location.lat.toFixed(4) : '';
  form.lon.value = location ? location.lon.toFixed(4) : '';
  form.tz.value = location?.tz ?? browserTimeZone();
  $('location-message').textContent = message;
  dialog.showModal();
}

function populateTimeZones() {
  const select = form.tz;
  const zones = listTimeZones();
  const browser = browserTimeZone();
  if (!zones.includes(browser)) zones.unshift(browser);
  for (const tz of zones) select.add(new Option(tz === browser ? `${tz} (this device)` : tz, tz));
}

async function locateDevice({ silent = false } = {}) {
  if (!silent) dial.readout.status.textContent = state.location ? dial.readout.status.textContent : 'Locating…';
  try {
    setLocation(await requestGeolocation());
    if (dialog.open) dialog.close();
  } catch (err) {
    if (silent) return;
    if (!state.location) dial.readout.status.textContent = 'Location needed';
    openDialog(`${err.message} Enter coordinates instead.`);
  }
}

form.addEventListener('submit', (e) => {
  if (e.submitter?.value === 'cancel') return; // dialog closes itself
  const lat = Number(form.lat.value);
  const lon = Number(form.lon.value);
  const tz = form.tz.value;
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || form.lat.value === '' || form.lon.value === '') {
    e.preventDefault();
    $('location-message').textContent = 'Latitude must be within ±90° and longitude within ±180°.';
    return;
  }
  if (!isValidTimeZone(tz)) {
    e.preventDefault();
    $('location-message').textContent = 'Unknown time zone.';
    return;
  }
  setLocation({ lat, lon, tz, source: 'manual' });
});

$('use-device').addEventListener('click', () => {
  $('location-message').textContent = 'Requesting device location…';
  locateDevice();
});
$('change-location').addEventListener('click', () => openDialog());

// ---- start -----------------------------------------------------------------------

populateTimeZones();
dial.setActive(false);

const saved = loadLocation();
if (saved) {
  setLocation(saved, { persist: false });
  if (saved.source === 'geolocation') locateDevice({ silent: true }); // refresh quietly
} else {
  locateDevice();
}

requestAnimationFrame(frame);

// Exposed for inspection from the browser console.
window.celestialClock = { state, cycles, timebase, recurrence, SUNRISE_ALTITUDE_DEG };
