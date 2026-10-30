/**
 * timebar.js — Time controls (Iteration 5): play/pause, rate, jump to a
 * date, return to live time.
 */

import { zoneOffsetMinutes } from '../location.js';
import { pad } from '../format.js';

const $ = (id) => document.getElementById(id);

/** "YYYY-MM-DDTHH:MM" for <input type="datetime-local">, in the zone tz. */
function toLocalInput(t, tz) {
  const d = new Date(t + zoneOffsetMinutes(t, tz) * 60000);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Inverse of toLocalInput: wall-clock time in tz → UTC instant (two passes settle DST edges). */
function fromLocalInput(value, tz) {
  const [date, time] = value.split('T');
  const [Y, M, D] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const wall = Date.UTC(Y, M - 1, D, h, m);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - zoneOffsetMinutes(t, tz) * 60000;
  return t;
}

export function createTimebar(timebase, getZone, onChange) {
  const play = $('tb-play');
  const rate = $('tb-rate');
  const status = $('tb-status');
  const date = $('tb-date');
  const bar = $('timebar');

  const changed = () => {
    onChange();
    render();
  };

  $('tb-slower').addEventListener('click', () => {
    timebase.step(-1);
    changed();
  });
  $('tb-faster').addEventListener('click', () => {
    timebase.step(+1);
    changed();
  });
  play.addEventListener('click', () => {
    timebase.togglePlaying();
    changed();
  });
  $('tb-now').addEventListener('click', () => {
    timebase.goLive();
    changed();
  });
  date.addEventListener('change', () => {
    if (!date.value) return;
    timebase.setTime(fromLocalInput(date.value, getZone()));
    changed();
  });

  function render() {
    play.textContent = timebase.playing ? 'Pause' : 'Play';
    rate.textContent = timebase.rate.label;
    status.textContent = timebase.live ? 'Live' : timebase.playing ? 'Simulated' : 'Paused';
    bar.classList.toggle('simulated', !timebase.live);
  }
  render();

  return {
    update(t) {
      render();
      if (document.activeElement !== date) date.value = toLocalInput(t, getZone());
    },
  };
}
