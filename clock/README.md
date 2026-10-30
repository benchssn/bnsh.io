# Celestial Clock

An instrument for astronomical rhythms.

- **Iteration 1, the solar clock:** a 24-hour dial of the local *apparent* solar day, with solar
  noon at the top and solar midnight at the bottom.
- **Iteration 2, the lunar phase ring:** an outer ring for the synodic month, with new moon at
  the bottom and full moon at the top.
- **Iteration 3, cycles:** nine phase dials (solar day, synodic and draconic months, tropical
  year, and the synodic cycles of Mercury through Saturn), all drawn with one model.
- **Iteration 4, alignment:** a heliocentric orrery and a geocentric ecliptic ring, with close
  pairs, eclipse seasons and the next events.
- **Iteration 5, time and recurrence:** time controls (±1 h/s to ±1 yr/s, jump to a date), a
  stroboscopic recurrence explorer with continued-fraction analysis, and a torus phase portrait.
- **Moon in the sky:** moonrise and moonset, with a silver arc on the main dial for when the Moon
  is above the horizon.
- **Esoteric layer:** classical glyphs, zodiacal notation for longitudes, planetary hours on the
  dial, a weekday heptagram, and Latin plate titles. This is traditional notation over computed
  values, never a physical claim.

No dependencies and no build step: plain HTML, CSS, ES modules and SVG.

## Run

ES modules don't load from `file://`, so serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. After updating the code, hard-reload (Cmd/Ctrl+Shift+R):
`http.server` lets the browser cache ES modules, so a normal reload can mix old and new files. Geolocation works on `localhost`. If permission is denied,
the app asks you to enter coordinates instead. The location is remembered in `localStorage`.

## Test

```bash
node tests/solar-check.mjs
node tests/lunar-check.mjs
node tests/cycles-check.mjs
```

This compares the computations against published almanac values: the equation of time, the
solstice declination, sunrise, noon and sunset for Greenwich and New York, polar night and
midnight sun at Tromsø, and internal consistency checks. The lunar checks compare principal-phase
times with five eclipse-dated new and full moons from 2024–2026, all within one minute. The cycle
checks cover:

- the 2026 equinoxes and solstices (within 10 minutes);
- oppositions and inferior conjunctions of all five planets (within 4 hours);
- a Venus greatest elongation;
- the Moon's distance from a node at four 2026 eclipses;
- the Metonic, Saros and Venus 8-year commensurabilities, which must appear among the
  continued-fraction convergents.

In the browser console, `celestialClock` exposes `state`, `cycles`, `timebase` and `recurrence`.

## Files

| File | Role |
| --- | --- |
| `js/phase.js` | Generic cycle model θ(t) = 2π·frac((t − t₀)/T + Δ(t)) and a phase-time solver |
| `js/solar.js` | Solar ephemeris, equation of time, apparent solar time, solar-day events |
| `js/lunar.js` | Lunar longitude, elongation, illumination, principal phases |
| `js/seasons.js` | Tropical year: equinoxes, solstices |
| `js/planets.js` | Keplerian planets (JPL elements), synodic cycles, geocentric positions |
| `js/cycles.js` | Registry of all cycles with their named events |
| `js/timebase.js` | Live or simulated time: one `now()` for every view |
| `js/svg.js`, `js/format.js` | Shared drawing and text helpers |
| `js/views/cycle-grid.js` | Iteration 3: phase dials |
| `js/views/alignment.js` | Iteration 4: orrery, ecliptic ring, configurations |
| `js/views/timebar.js`, `js/views/recurrence.js` | Iteration 5: time controls, recurrence explorer |
| `js/esoterica.js` | Glyphs, zodiacal notation, planetary hours |
| `js/views/torus.js` | Phase portrait on a torus (3-D and flat) |
| `js/location.js` | Geolocation, manual fallback, IANA time-zone offsets |
| `js/dial.js` | SVG dial |
| `js/main.js` | Wiring and animation loop |

## How it works

**Phase model.** A cycle has a uniform mean phase `frac((t − t₀)/T)` plus a slowly varying
correction `Δ(t)`. For the Sun, `T` is 86 400 s and `t₀ = −(λ/360)·T` (local mean midnight at
longitude λ), so the mean phase is *local mean solar time*. The correction is the
**equation of time**, `Δ = EoT/1440`. Their sum is the **local apparent solar time**, the hour
angle of the true Sun plus 12 h. The dial plots this phase: 0 is solar midnight, 0.5 is solar noon.

**Equation of time.** EoT measures how far the real Sun runs ahead of or behind a uniform mean
Sun. It has two causes: Earth's orbital eccentricity, and the tilt of the ecliptic relative to the
equator. Its value ranges from −14 to +16.5 minutes. It is computed from Meeus's low-precision
solar theory (the same one used by the NOAA Solar Calculator) as a series in mean longitude,
anomaly, eccentricity and obliquity.

**Solar position.** The same theory gives the Sun's apparent ecliptic longitude, corrected for
nutation and aberration, and from that its declination δ. The local hour angle `H` comes from
apparent solar time, so altitude and azimuth follow from the standard spherical-triangle formulas.

**Events.** Solar noon is the instant when the phase equals 0.5. Sunrise and sunset are the
instants when the Sun's centre is at −0.833°: 34′ of refraction plus 16′ of semi-diameter. Their
hour angle is `cos H₀ = (sin h₀ − sin φ sin δ)/(cos φ cos δ)`. Each event is iterated so that
δ and EoT are evaluated at the event itself. If |cos H₀| > 1, the day is polar night or midnight sun.

**Civil time.** Civil time comes from the IANA zone via `Intl`, which handles daylight saving.
The outer dial scale shows civil hours, rotated by `apparent solar − civil` time. That gap is the
sum of the longitude offset within the zone, daylight saving, and the equation of time.

**Lunar phase.** The phase is the Moon's *elongation*, its apparent ecliptic longitude minus the
Sun's, divided by 360°. The Moon's longitude uses the 59 largest periodic terms of ELP-2000/82
(Meeus ch. 47) plus the additive Venus, Jupiter and flattening terms. In the phase model:

- T is the mean synodic month (29.530589 d).
- t₀ is a reference mean new moon (2000-01-06).
- Δ(t) is the true phase minus the mean phase, shown as "True − mean".

The Moon's elliptical, Sun-perturbed orbit makes Δ swing by up to about ±20 h, so a real new
moon can come most of a day before or after the mean one. The principal phases are found by
solving phase(t) = 0, ¼, ½, ¾. The illuminated fraction comes from the Sun–Moon–Earth phase
angle (Meeus eq. 48.4). The lit part is drawn as a semicircular limb plus a half-ellipse
terminator.

**Seasons.** Phase is (λ☉ − 270°)/360: the December solstice is at 0 and the June solstice at ½.
The mean model uses the Sun's mean longitude, which gives a tropical year of 365.24219 d. The
correction Δ is the equation of the centre, about ±2 days. It is why northern summer is about
4.6 days longer than northern winter.

**Planets.** Positions come from JPL's Keplerian elements (Standish, valid 1800–2050), with
Kepler's equation solved by Newton's method. A planet's synodic phase is the *relative* phase of
two orbits seen from the Sun: ½ + (L⊕ − Lₚ)/360 for superior planets, with the sign reversed
for inferior planets. Phase ½ is therefore opposition (or inferior conjunction), and phase 0 is
conjunction (or superior conjunction). The mean model uses the mean longitudes, which are linear
in time. The correction comes from both orbits' eccentricities: Mars's oppositions wander by
weeks around the mean schedule.

**Draconic month.** Phase is (λ☾ − ☊)/360, measured from the Moon's mean ascending node. Phases
0 and ½ are the Moon crossing the ecliptic. An eclipse needs a new or full moon near one of
those crossings.

**Finding events.** `timeOfPhase` runs Newton's method on the true phase, using a numerically
differentiated rate. That matters for eccentric orbits, where the true rate differs from the
mean rate by up to about 60 %.

**Recurrence.** The stroboscope samples cycle B at every phase-0 instant of cycle A. If
q·T_A ≈ p·T_B, the samples line up in q arms. The continued-fraction convergents of T_A/T_B list
every best rational approximation, each better than any with a smaller denominator: for the
year and the month, 8 yr → 19 yr (Metonic) → 334 yr. "Mean model" shows the pure arithmetic of
the mean periods. "True" adds each cycle's Δ(t), which scatters points around the ideal arms.
The nested hierarchy of near-recurrences is a property of quasi-periodic motion with
irrational period ratios. It is not, by itself, evidence of fractality.

**Moonrise and moonset.** The Moon's latitude and distance come from the main terms of Meeus
tables 47.A–B. From those, the code computes:

- right ascension and declination, using the true obliquity;
- the hour angle, from local mean sidereal time;
- the altitude of the Moon's centre.

The Moon rises or sets when that altitude crosses h₀ = 0.7275·π − 34′ (Meeus ch. 15), where π
is the horizontal parallax, about 1°. Parallax lowers the Moon by about its own width, so it
matters here in a way it doesn't for the Sun. Crossings are bracketed in 10-minute steps and
refined by the secant method. The checks reproduce the 2025 major lunar standstill
(|δ| max 28.7°), the 2026 perigee and apogee distances, and a full moon rising at sunset.

**Esoteric layer.**

- **Notation, not physics.** Every symbol is notation laid over a computed value.
- **Zodiacal notation.** Ecliptic longitude is written in twelve equal 30° signs from the March
  equinox (the tropical zodiac): 217.0° = ♏ 7°00′. Astronomers used this notation until the
  18th century. The signs are *not* the constellations, which precession has shifted by about 24°.
- **Planetary hours.** This is the Hellenistic and medieval Chaldean scheme. The day (sunrise to
  sunset) and the night (sunset to sunrise) are each divided into twelve *unequal* hours,
  computed from the real sunrise and sunset. The hours are assigned in the Chaldean order
  ♄ ♃ ♂ ☉ ♀ ☿ ☽, starting from the weekday's planet at sunrise.
- **The heptagram.** It is drawn behind the readout. Its seven points, in Chaldean order and
  joined every third point, spell out the weekday order. That works because 24 hours ≡ 3 (mod 7),
  which is the historical origin of the week's sequence.

**Phase portrait.** Two phases (φ_A, φ_B) are a point on a torus: A around the ring, B around
the tube, with phase ½ on top. The path winds with slope T_A/T_B. It would close if the ratio
were rational; it never is, so the path slowly covers the surface. The amber circle φ_A = 0 is a
Poincaré section, and its crossings are exactly the stroboscope samples. Up to 12,000 points
are drawn (24 per period of the faster cycle). Line opacity falls as windings accumulate, so
near-overlapping strands, the near-recurrences, stay visible. Try the Venus preset: five strand
bundles cross the section, forming the 8-year pentagram.

**Time.** All views read one instant from `timebase.now()`. In simulated time,
t = t_anchor + rate·(wall − wall_anchor). Nothing accumulates frame to frame, so any rate,
including negative rates and jumps, stays consistent. In simulated time every readout is
refreshed every frame, so text and geometry always show the same instant.

## Assumptions and limitations

- Accuracy: about 0.01° in declination, a few seconds in EoT, and about 1 minute for sunrise and
  sunset over 1800–2200. Real sunrise and sunset can differ by minutes because refraction near
  the horizon varies with the weather.
- UTC is treated as UT1 (error < 0.9 s), and ΔT is ignored (< 3″ in solar position).
- Observer elevation, local horizon and diurnal parallax (≤ 9″) are not modelled.
- Displayed altitude is geometric (no refraction), so it reads −0.83° at sunrise.
- The polar condition is judged from the declination at solar noon. On the boundary day the
  classification can be off by one day.
- Latitude is clamped to ±89.99°. At the poles, local solar time has no physical meaning.
- The time zone for a manually entered location is whatever you select. It is not looked up
  from the coordinates.

### Lunar

- ΔT (TT − UT) is fixed at 69 s, which is correct for the 2020s. Over centuries, phase times
  would drift by minutes.
- The longitude series is truncated, which gives about 0.003° in elongation and about 1 minute
  in phase times.
- The Moon glyph's bright limb is drawn on the right while waxing (northern hemisphere) and
  mirrored south of the equator. The true tilt of the bright limb in your sky also depends on
  time of day and the Moon's altitude (the parallactic angle). That is not modelled.
- Phase and illumination are geocentric. Topocentric parallax (up to about 1°) shifts what an
  observer actually sees by up to about 2 hours of phase timing. Phase *names* allow a ±12 h
  window around each principal instant.
- The ring shows phase only, not where the Moon is in your sky. Moonrise, moonset and the Moon's
  position on the solar dial are not shown yet.

### Cycles, alignment, recurrence

- **Valid range.** Planet positions are valid 1800–2050, and ΔT is fixed at 69 s, so the date
  picker is limited to 1800–2100. Beyond about 2050, planetary events drift by up to a day.
- **Accuracy.** Planet longitudes are good to a few arcminutes. Planet–planet perturbations
  beyond the linear element rates are not modelled; Saturn is the worst, with oppositions off by
  a few hours.
- **Coordinate frames.** Geocentric planet longitudes are precessed from J2000 to the equinox
  of date with the general precession only, which is good to about 0.01° within the valid range.
  Close-pair separations are in ecliptic longitude only; latitudes are ignored.
- **Eclipse seasons** use a fixed ±18.5° Sun–node limit and the *mean* node. Being inside the
  window means an eclipse is possible, not certain. This instrument does not predict eclipses.
- **Season naming.** The seasonal phase is astronomical, with the northern summer solstice at
  the top. It is not flipped for southern observers.
- **Recurrence explorer.** Mean-model convergents are limited to 500 periods of cycle A. Over
  centuries, the periods themselves change (tidal braking, secular terms), so very long
  near-recurrences are arithmetic of today's mean periods, not predictions.
- **Hidden tabs.** Browsers pause animation when the tab is hidden. Time is recomputed from the
  clock on return, so nothing drifts, but simulated time keeps advancing while hidden.

### Moon in the sky and esoteric layer

- **Moon times.** Moonrise and moonset use the geocentric altitude with the standard
  parallax-corrected h₀. Expect them to be good to about a minute. Observer elevation and the
  local horizon are ignored. Outside the polar regions the 10-minute scan cannot miss a crossing;
  at very high latitudes the Moon can graze the horizon and a brief rise and set may be missed.
- **Planetary hours** are undefined, and hidden, where the Sun does not rise or set. The day
  ruler is the weekday at sunrise in the selected time zone.
- **Zodiac signs** are tropical and equal-width. They describe where the Sun, Moon and planets
  are, not what they mean.
