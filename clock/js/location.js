/**
 * location.js — Where the observer is, and how their civil clock relates to UTC.
 *
 * A location is { lat, lon, tz, source } with lat/lon in degrees (east and
 * north positive), tz an IANA time-zone name, and source 'geolocation' or
 * 'manual'. Civil time is always derived from the IANA zone through Intl,
 * so daylight-saving transitions are handled by the browser's tz database.
 */

const STORAGE_KEY = 'celestial-clock.location';

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function listTimeZones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [browserTimeZone()];
  }
}

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function loadLocation() {
  try {
    const loc = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon) && isValidTimeZone(loc.tz)) return loc;
  } catch {
    /* storage unavailable or corrupt — fall through */
  }
  return null;
}

export function saveLocation(loc) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
  } catch {
    /* not persisted; the clock still works for this visit */
  }
}

/** Ask the browser for the device position. Resolves to a location or rejects. */
export function requestGeolocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          tz: browserTimeZone(),
          source: 'geolocation',
        }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Location could not be determined.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

/**
 * Offset of the zone's civil time from UTC at instant t, in minutes
 * (e.g. −240 for EDT). Derived by formatting t in the zone and comparing.
 */
export function zoneOffsetMinutes(t, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(t)
      .map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUTC - Math.floor(t / 1000) * 1000) / 60000);
}

export function formatCoordinates({ lat, lon }) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns} · ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
