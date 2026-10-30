/**
 * timebase.js — The instrument's notion of "now".
 *
 * Every view asks the timebase for the current instant instead of calling
 * Date.now(). In live mode it *is* Date.now(); otherwise simulated time runs
 * linearly from an anchor:
 *
 *     t_sim = t_anchor + rate · (wall − wall_anchor)
 *
 * Because every quantity on screen is computed from t (never accumulated
 * frame by frame), any rate — including negative ones, and jumps of
 * centuries — stays exactly consistent across all cycles.
 */

const DAY_S = 86400;

/** Selectable rates, in simulated seconds per real second. */
export const RATES = [
  { rate: -365.25 * DAY_S, label: '−1 yr/s' },
  { rate: -30.4375 * DAY_S, label: '−1 mo/s' },
  { rate: -7 * DAY_S, label: '−1 wk/s' },
  { rate: -DAY_S, label: '−1 d/s' },
  { rate: -3600, label: '−1 h/s' },
  { rate: 1, label: 'Real time' },
  { rate: 60, label: '1 min/s' },
  { rate: 3600, label: '1 h/s' },
  { rate: DAY_S, label: '1 d/s' },
  { rate: 7 * DAY_S, label: '1 wk/s' },
  { rate: 30.4375 * DAY_S, label: '1 mo/s' },
  { rate: 365.25 * DAY_S, label: '1 yr/s' },
];
const REAL_TIME = RATES.findIndex((r) => r.rate === 1);

export function createTimebase() {
  let live = true;
  let playing = true;
  let rateIndex = REAL_TIME;
  let anchorSim = Date.now();
  let anchorWall = performance.now();

  const now = () => {
    if (live) return Date.now();
    if (!playing) return anchorSim;
    return anchorSim + RATES[rateIndex].rate * (performance.now() - anchorWall);
  };
  const reanchor = () => {
    anchorSim = now();
    anchorWall = performance.now();
    live = false;
  };

  return {
    now,
    get live() {
      return live;
    },
    get playing() {
      return playing;
    },
    get rate() {
      return RATES[rateIndex];
    },
    /** Step the rate up (+1) or down (−1) through RATES. */
    step(direction) {
      reanchor();
      rateIndex = Math.max(0, Math.min(RATES.length - 1, rateIndex + direction));
      playing = true;
    },
    togglePlaying() {
      reanchor();
      playing = !playing;
    },
    setTime(t) {
      reanchor();
      anchorSim = t;
    },
    goLive() {
      live = true;
      playing = true;
      rateIndex = REAL_TIME;
    },
  };
}
