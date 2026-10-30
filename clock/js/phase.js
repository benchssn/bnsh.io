/**
 * phase.js — A common phase model for astronomical cycles.
 *
 * Every cycle is described by a uniform "mean" motion
 *
 *     θ̄(t) = 2π · frac((t − t₀) / T)
 *
 * plus an optional, slowly varying correction Δ(t) (in turns) that accounts
 * for the real, non-uniform motion:
 *
 *     θ(t) = 2π · frac((t − t₀) / T + Δ(t))
 *
 * For the solar day, T = 86 400 s, t₀ is the instant of mean local midnight,
 * and Δ(t) is the equation of time. Future cycles (lunar, seasonal,
 * planetary) can use the same interface with their own T, t₀ and Δ.
 *
 * Phases are returned as fractions of a turn in [0, 1); multiply by TAU for
 * radians. All times are milliseconds (JavaScript Date values).
 */

export const TAU = 2 * Math.PI;

/** Fractional part, always in [0, 1), also for negative x. */
export function frac(x) {
  return x - Math.floor(x);
}

/** Wrap a phase difference (in turns) into [−0.5, 0.5). */
export function wrapHalf(x) {
  return x - Math.round(x);
}

/** Uniform phase θ̄(t)/2π = frac((t − t₀) / T). */
export function uniformPhase(t, t0, T) {
  return frac((t - t0) / T);
}

/**
 * Create a cycle object.
 * @param {object} spec
 * @param {string} spec.name
 * @param {number} spec.period   T, in ms
 * @param {number} spec.epoch    t₀, in ms — an instant where the mean phase is 0
 * @param {(t:number)=>number} [spec.correction]  Δ(t), in turns
 */
export function createCycle({ name, period, epoch, correction = () => 0 }) {
  return {
    name,
    period,
    epoch,
    meanPhase: (t) => uniformPhase(t, epoch, period),
    phase: (t) => frac((t - epoch) / period + correction(t)),
  };
}

/**
 * Find the instant nearest `guess` (within about ±T/2) at which the cycle
 * reaches `target` phase. `target` may itself depend on time, e.g. the hour
 * angle of sunrise depends on the Sun's declination at that moment.
 *
 * Newton iteration with a numerically differentiated phase rate. The true
 * rate can differ from the mean 1/T by tens of percent (Mercury near
 * perihelion, the Moon near perigee), so the local rate converges much faster
 * than the mean one. All cycles here advance monotonically; if a derivative
 * ever looks implausible we fall back to the mean rate.
 */
export function timeOfPhase(cycle, target, guess, iterations = 6) {
  const targetAt = typeof target === 'function' ? target : () => target;
  const meanRate = 1 / cycle.period;
  const h = cycle.period * 1e-4;
  let t = guess;
  for (let i = 0; i < iterations; i++) {
    const err = wrapHalf(targetAt(t) - cycle.phase(t));
    if (Math.abs(err) < 1e-10) break;
    let rate = wrapHalf(cycle.phase(t + h) - cycle.phase(t - h)) / (2 * h);
    if (!(rate > 0.2 * meanRate && rate < 5 * meanRate)) rate = meanRate;
    t += err / rate;
  }
  return t;
}

/**
 * Next instant after t at which the cycle reaches each of `phases`; returns
 * the earliest as { index, time }.
 */
export function nextPhaseEvent(cycle, phases, t) {
  const p = cycle.phase(t);
  let best = null;
  phases.forEach((target, index) => {
    const ahead = frac(target - p) || 1; // turns until the target, by the mean rate
    let time = timeOfPhase(cycle, target, t + ahead * cycle.period);
    if (time <= t) time = timeOfPhase(cycle, target, time + cycle.period);
    if (!best || time < best.time) best = { index, time };
  });
  return best;
}

/**
 * Continued-fraction convergents p/q of x: the best rational approximations,
 * each better than any fraction with a smaller denominator. For a ratio of
 * periods x = T_A/T_B, a convergent means q·T_A ≈ p·T_B — a near-recurrence
 * of the two cycles together.
 */
export function convergents(x, maxDenominator = 5000, maxTerms = 14) {
  const out = [];
  let [h1, h2, k1, k2] = [1, 0, 0, 1];
  let r = x;
  for (let i = 0; i < maxTerms; i++) {
    const a = Math.floor(r);
    const [h, k] = [a * h1 + h2, a * k1 + k2];
    if (k > maxDenominator) break;
    if (h > 0) out.push({ p: h, q: k });
    [h2, h1, k2, k1] = [h1, h, k1, k];
    const f = r - a;
    if (f < 1e-12) break;
    r = 1 / f;
  }
  return out;
}
