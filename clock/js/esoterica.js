/**
 * esoterica.js — Traditional notation layered on the computed sky.
 *
 * Everything here is *notation and convention*, not physics. It shows real,
 * computed quantities in the forms astronomers and astrologers used before
 * the modern era:
 *
 *  • Planetary glyphs ☉ ☽ ☿ ♀ ♂ ♃ ♄ and the lunar nodes ☊ ☋.
 *  • Zodiacal notation for ecliptic longitude: twelve 30° signs counted from
 *    the March equinox (the *tropical* zodiac). λ = 217.4° is written
 *    ♏ 7°24′. The signs are equal divisions of longitude. They are not the
 *    constellations, which precession has shifted by about 24° since the
 *    scheme was fixed. Astronomers used this notation until the 18th century.
 *  • Planetary hours (Chaldean scheme, Hellenistic and medieval): the day
 *    from sunrise to sunset and the night from sunset to sunrise are each
 *    divided into twelve *unequal* hours ("temporal hours"). The hours are
 *    assigned to the seven classical planets in Chaldean order (descending
 *    orbital period as the ancients estimated it). The first hour after sunrise is
 *    ruled by the planet of the weekday. This is the historical origin of
 *    the order of the days of the week.
 */

import { solarDay } from './solar.js';

/** Text-presentation selector: keeps ♀ ♈ etc. from rendering as emoji. */
const T = '︎';

export const GLYPH = {
  sun: `☉${T}`,
  moon: `☽${T}`,
  mercury: `☿${T}`,
  venus: `♀${T}`,
  earth: `♁${T}`,
  mars: `♂${T}`,
  jupiter: `♃${T}`,
  saturn: `♄${T}`,
  ascendingNode: `☊${T}`,
  descendingNode: `☋${T}`,
};

/** Glyph for each cycle in the registry. */
export const CYCLE_GLYPH = {
  day: GLYPH.sun,
  month: GLYPH.moon,
  draconic: GLYPH.ascendingNode,
  year: `♈${T}`,
  mercury: GLYPH.mercury,
  venus: GLYPH.venus,
  mars: GLYPH.mars,
  jupiter: GLYPH.jupiter,
  saturn: GLYPH.saturn,
};

export const SIGNS = [
  ['♈', 'Aries'], ['♉', 'Taurus'], ['♊', 'Gemini'], ['♋', 'Cancer'],
  ['♌', 'Leo'], ['♍', 'Virgo'], ['♎', 'Libra'], ['♏', 'Scorpio'],
  ['♐', 'Sagittarius'], ['♑', 'Capricorn'], ['♒', 'Aquarius'], ['♓', 'Pisces'],
].map(([g, name]) => ({ glyph: g + T, name }));

/** Ecliptic longitude in zodiacal notation: { sign, degrees, minutes, text: "♏︎ 7°24′" }. */
export function zodiacal(longitudeDeg) {
  const λ = ((longitudeDeg % 360) + 360) % 360;
  const totalMinutes = Math.floor(λ * 60 + 1e-7) % 21600; // tolerance for binary fractions like 217.4 × 60
  const sign = SIGNS[Math.floor(totalMinutes / 1800) % 12];
  const within = totalMinutes % 1800;
  const degrees = Math.floor(within / 60);
  const minutes = within % 60;
  return { sign, degrees, minutes, text: `${sign.glyph} ${degrees}°${String(minutes).padStart(2, '0')}′` };
}

// ---- planetary hours ----------------------------------------------------------

/** The Chaldean order: Saturn, Jupiter, Mars, Sun, Venus, Mercury, Moon. */
export const CHALDEAN = [
  { id: 'saturn', name: 'Saturn' },
  { id: 'jupiter', name: 'Jupiter' },
  { id: 'mars', name: 'Mars' },
  { id: 'sun', name: 'the Sun' },
  { id: 'venus', name: 'Venus' },
  { id: 'mercury', name: 'Mercury' },
  { id: 'moon', name: 'the Moon' },
].map((p) => ({ ...p, glyph: GLYPH[p.id] }));

/** Weekday ruler (Sunday = Sun, Monday = Moon, …) as an index into CHALDEAN. */
const WEEKDAY_RULER = { Sun: 3, Mon: 6, Tue: 2, Wed: 5, Thu: 1, Fri: 4, Sat: 0 };

function weekdayRuler(t, tz) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(t);
  return WEEKDAY_RULER[wd];
}

/**
 * Planetary hours covering the apparent solar day `day` (from solar.solarDay):
 * the night before (from the previous sunset), the day, and the night after (to
 * the next sunrise). Returns null where the Sun does not rise or set, since
 * the scheme is then undefined.
 *
 * @returns {null | {start:number, end:number, ruler:object, dayRuler:object, daytime:boolean}[]}
 */
export function planetaryHours(day, latDeg, lonDeg, tz) {
  if (day.condition !== 'normal') return null;
  const prev = solarDay(day.start - 3.6e6, latDeg, lonDeg);
  const next = solarDay(day.end + 3.6e6, latDeg, lonDeg);
  if (prev.condition !== 'normal' || next.condition !== 'normal') return null;

  const today = weekdayRuler(day.sunrise, tz);
  const yesterday = (today + 4) % 7; // the weekday ruler 24 hours earlier in Chaldean order (−24 ≡ +4 mod 7)
  const hours = [];
  const split = (from, to, firstIndex, dayRulerIndex, daytime) => {
    const len = (to - from) / 12;
    for (let k = 0; k < 12; k++) {
      hours.push({
        start: from + k * len,
        end: from + (k + 1) * len,
        ruler: CHALDEAN[(firstIndex + k) % 7],
        dayRuler: CHALDEAN[dayRulerIndex],
        daytime,
      });
    }
  };
  split(prev.sunset, day.sunrise, yesterday + 12, yesterday, false); // hours 13–24 of yesterday
  split(day.sunrise, day.sunset, today, today, true); // hours 1–12 of today
  split(day.sunset, next.sunrise, today + 12, today, false); // hours 13–24 of today
  return hours;
}
