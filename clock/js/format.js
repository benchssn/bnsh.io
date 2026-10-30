/**
 * format.js — Text formatting for durations, periods and dates.
 */

import { DAY_MS } from './solar.js';

export const pad = (n) => String(n).padStart(2, '0');

/** Signed duration in minutes → "+16 m 29 s" (seconds) or "−1 h 04 m". */
export function signedDuration(minutes, { seconds = false } = {}) {
  const sign = minutes < 0 ? '−' : '+';
  const total = Math.round(Math.abs(minutes) * (seconds ? 60 : 1));
  if (seconds) return `${sign}${Math.floor(total / 60)} m ${pad(total % 60)} s`;
  return `${sign}${Math.floor(total / 60)} h ${pad(total % 60)} m`;
}

/** Signed span in ms with units chosen by size: "+7 h 25 m", "−1.84 d", "+16 m 23 s". */
export function signedSpan(ms) {
  const minutes = ms / 60000;
  if (Math.abs(minutes) < 60) return signedDuration(minutes, { seconds: true });
  if (Math.abs(ms) < 2 * DAY_MS) return signedDuration(minutes);
  return `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / DAY_MS).toFixed(2)} d`;
}

/** Unsigned span in ms: "2.1 h", "0.47 d", "18.6 d", "4.3 yr". */
export function span(ms) {
  const a = Math.abs(ms);
  if (a < 60 * 60000) return `${(a / 60000).toFixed(1)} min`;
  if (a < DAY_MS) return `${(a / 3.6e6).toFixed(1)} h`;
  if (a < 2 * 365.25 * DAY_MS) return `${(a / DAY_MS).toFixed(a < 10 * DAY_MS ? 2 : 1)} d`;
  return `${(a / (365.25 * DAY_MS)).toFixed(1)} yr`;
}

/** Mean period: "24 h", "29.531 d", "365.242 d", "779.9 d". */
export function period(ms) {
  const d = ms / DAY_MS;
  if (Math.abs(d - 1) < 1e-6) return '24 h';
  return `${d.toFixed(d < 100 ? 3 : d < 500 ? 3 : 1)} d`;
}
