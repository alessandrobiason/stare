/**
 * How reflective an object is, as the magnitude it would show at a reference
 * distance — and, more to the point, which objects that is honestly known for.
 *
 * `illumination.ts` can work out whether any of the sixteen thousand objects in
 * the catalogue is in sunlight, exactly, from geometry alone. Turning that into
 * *how bright it looks* needs one thing geometry cannot supply: how much light
 * the thing throws back. That is a property of its size, its shape and what it
 * is made of, and it is measured by people watching satellites and writing down
 * what they saw. There is no such measurement in a TLE, and none for most of
 * this catalogue anywhere.
 *
 * So this table is deliberately short, and what is not in it returns `null`
 * rather than a default. A default would be a number the rest of the app cannot
 * tell apart from a measurement, and the honest thing to do with an object
 * nobody has recorded a brightness for is to say that its brightness is not
 * known — the card then talks about where it is and whether it is lit, which
 * are both facts, and says nothing about whether it can be seen.
 *
 * A **standard magnitude** is the convention the observing catalogues use: what
 * the object shows at a thousand kilometres with half its lit side turned this
 * way. `apparentMagnitude` takes it from there. Magnitudes run backwards —
 * smaller is brighter — and the naked eye reaches about 4 in a town.
 *
 * Two tiers are listed, and they are not equally solid:
 *
 * - **The landmarks**, by catalogue number, because that is the identifier that
 *   outlives a name (`categories.ts`). The station, Tiangong and Hubble are the
 *   three most-watched objects in orbit and their figures are recorded ones.
 *   The nine observatories below them are estimates from the size of the
 *   spacecraft, and they are marked as such — for those, the verdict is settled
 *   by the range term rather than by this number anyway: Chandra and XMM-Newton
 *   spend most of their long orbits more than a hundred thousand kilometres
 *   away, which is twenty-five magnitudes of inverse square and would bury an
 *   object of any plausible brightness.
 * - **The large constellations**, by name, which is what a constellation has
 *   instead of an identity: one Starlink is much like another and there are ten
 *   thousand of them. These are fleet-typical figures from published
 *   observations rather than per-object measurements, and they are on the faint
 *   side of the observed spread on purpose. The cost of guessing too bright is
 *   the app sending somebody outside to look at nothing.
 *
 * Between the two, about three quarters of the catalogue by object count has a
 * figure, and the quarter that does not is answered with `null` and treated as
 * unknown all the way to the screen.
 */

/** A brightness, and whether anybody actually measured it. */
export type StandardMagnitude = {
  /** Magnitude at 1000 km with half the lit side facing the observer. */
  magnitude: number;
  /**
   * `true` where this is a recorded observation, `false` where it is inferred
   * from the size and class of the spacecraft.
   *
   * Carried rather than dropped because the two deserve different words: the
   * app can say the station will be brighter than any star, and should only
   * say a small observatory is *around* a given magnitude.
   */
  measured: boolean;
};

/**
 * The landmarks, by catalogue number.
 *
 * The tier the whole app is pointed at, so it is the tier that has to have an
 * answer: these are the objects that carry a name, a photograph and a written
 * description, and "can I see it?" is the question all three exist to lead up
 * to. See `LANDMARK_NORAD_IDS` in `categories.ts` for the same list.
 */
const LANDMARK_MAGNITUDES: Record<number, StandardMagnitude> = {
  // The two stations and Hubble: the most-observed objects in orbit, and the
  // reason the standard-magnitude convention has figures worth quoting at all.
  25544: { magnitude: -1.8, measured: true }, // ISS — brighter than any star
  48274: { magnitude: -1.0, measured: true }, // Tiangong, at three modules
  20580: { magnitude: 2.0, measured: true }, // Hubble

  // The great observatories, estimated from the size of the spacecraft. Two of
  // them are in the long elliptical orbits their instruments need, where the
  // range term settles the question whatever this figure is.
  25867: { magnitude: 4.0, measured: false }, // Chandra — out to 134,000 km
  25989: { magnitude: 3.5, measured: false }, // XMM-Newton — out to 114,000 km
  28485: { magnitude: 5.5, measured: false }, // Swift
  38358: { magnitude: 5.5, measured: false }, // NuSTAR
  42758: { magnitude: 5.0, measured: false }, // Huiyan
  44874: { magnitude: 6.5, measured: false }, // CHEOPS — the smallest of them
  49954: { magnitude: 6.0, measured: false }, // IXPE
  58753: { magnitude: 5.5, measured: false }, // Einstein Probe
  60089: { magnitude: 5.5, measured: false } // SVOM
};

/** A naming convention, and what a satellite answering to it tends to show. */
type FleetMagnitude = {
  /** Tested against the upper-cased catalogue name. First match wins. */
  match: RegExp;
  magnitude: number;
};

/**
 * The large constellations, in the order they are tried.
 *
 * All flat-panel communications satellites in low orbit, all built in the
 * hundreds or thousands, and all faint: none of these is an object anybody
 * would go outside to look for on its own, which is exactly why the app should
 * be able to say so. Starlink alone is two thirds of the active catalogue, so
 * this one row is most of what stands between a sky full of marks and a sky
 * whose marks can be told apart by whether they are worth looking at.
 *
 * The figures are the faint end of published observations. A launch not long
 * departed is a good deal brighter than its own fleet's figure — a train of
 * them at low altitude before the panels are trimmed is a well-known sight —
 * and nothing here tries to model that: it is a few days in the life of each
 * batch, it needs the launch date rather than the elements, and being too
 * pessimistic about it costs a surprise rather than a disappointment.
 */
const FLEET_MAGNITUDES: readonly FleetMagnitude[] = [
  // Post-mitigation: visors, then the dielectric mirror film, aimed at keeping
  // them off the naked-eye ladder from their operating altitude.
  { match: /^STARLINK/, magnitude: 6.0 },
  { match: /^KUIPER/, magnitude: 6.0 },
  // Higher and smaller: twelve hundred kilometres puts another magnitude and a
  // half of inverse square between these and the ground.
  { match: /^ONEWEB/, magnitude: 6.5 },
  // Reported brighter than Starlink at a comparable altitude, with no published
  // mitigation, which is why astronomers have complained about them by name.
  { match: /^QIANFAN|^HULIANWANG DIGUI/, magnitude: 5.0 },
  // The replacements for the flare-famous originals. The flares went with the
  // polished antennas; what is left is an ordinary faint satellite.
  { match: /^IRIDIUM/, magnitude: 6.0 },
  { match: /^GLOBALSTAR/, magnitude: 6.0 }
];

/**
 * What `name` and `noradId` are known to reflect, or `null` for an object
 * nobody has written a brightness down for.
 *
 * The catalogue number is tried first and the name second, which is the same
 * order and for the same reason as everywhere else here: a landmark keeps its
 * number and loses its name, and a constellation has a name and no identity.
 */
export function standardMagnitudeFor(noradId: number, name: string): StandardMagnitude | null {
  const landmark = LANDMARK_MAGNITUDES[noradId];
  if (landmark) return landmark;

  const upper = name.toUpperCase();
  for (const fleet of FLEET_MAGNITUDES) {
    if (fleet.match.test(upper)) return { magnitude: fleet.magnitude, measured: false };
  }

  return null;
}
