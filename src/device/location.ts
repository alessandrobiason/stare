import * as Location from "expo-location";
import { wrapDegrees180 } from "../math/angles";
import { ObserverLocation } from "../types";

/**
 * Where the phone is, which is half of what places a satellite in the sky — the
 * replay takes it from the recording's GPS stream instead. Boot cannot carry on
 * without it: a fix a hundred kilometres out puts a low pass several degrees
 * from where it is drawn.
 *
 * The platform's compass is here too, rather than with the sensors it corrects.
 * It comes through the same module and the same foreground permission as the
 * fix, and the declination it answers for is a property of where the phone is
 * rather than of the phone.
 */

/** Thrown when the fix cannot be had, with a reason worth showing someone. */
export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationError";
  }
}

const asObserver = (position: Location.LocationObject): ObserverLocation => ({
  latitudeDeg: position.coords.latitude,
  longitudeDeg: position.coords.longitude,
  // Ellipsoidal height is what the ENU transform wants; a device without an
  // altitude reports none, and sea level is a kilometre-scale error at worst,
  // against an orbit hundreds of kilometres up.
  heightM: position.coords.altitude ?? 0
});

/**
 * Asks for permission and returns the first fix. Called during boot, so the
 * prompt lands before the sky view rather than over it.
 *
 * `Balanced` rather than `High`: the projection cannot tell a hundred metres
 * apart, and the better fix costs seconds of cold start outdoors, longer in.
 */
export async function requestObserverFix(): Promise<ObserverLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationError(
      "Location permission was refused, and satellites cannot be placed without knowing where you are."
    );
  }

  const services = await Location.hasServicesEnabledAsync();
  if (!services) {
    throw new LocationError("Location services are turned off on this device.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  });
  return asObserver(position);
}

/**
 * Local magnetic declination in degrees east, or `null` where the platform
 * cannot say.
 *
 * Differenced from the two headings the platform already reports rather than
 * taken from a field model: `trueHeading` is `magHeading` with the declination
 * applied, so subtracting leaves the declination itself, wherever the phone is.
 *
 * The replay harness can use a constant (`MAGNETIC_DECLINATION_DEG`) because a
 * staged recording never leaves the place it was made. An app that travels
 * cannot: the two norths are twenty degrees apart in places, a third of the
 * frame.
 *
 * **Call this after `requestObserverFix`, not alongside it.** The compass is
 * behind the same foreground permission as the fix, and asked before that
 * permission is granted this returns `null` every time — which on a first
 * launch is the whole of the first session aimed at magnetic north.
 */
export async function readMagneticDeclinationDeg(): Promise<number | null> {
  try {
    // Bounded, because the platform's own call is not: it resolves on the first
    // heading good enough to use and has no answer of its own for a compass
    // that never reports one. Boot waits on this, and a boot screen that never
    // finishes is a worse failure than a heading referenced to magnetic north.
    const heading = await within(Location.getHeadingAsync(), HEADING_TIMEOUT_MS);
    if (!heading) return null;
    // iOS reports a negative true heading when it has no declination to apply.
    if (heading.trueHeading < 0 || heading.magHeading < 0) return null;
    return wrapDegrees180(heading.trueHeading - heading.magHeading);
  } catch {
    return null;
  }
}

/**
 * What the platform's own compass says, beyond the bearing itself.
 *
 * Published together because they arrive together, on one heading, and because
 * neither is worth much without the other: a declination differenced out of a
 * compass the platform does not trust is a correction of a few degrees taken
 * off a reading that may be forty out.
 */
export type CompassReading = {
  /**
   * Local declination in degrees east, or `null` while the platform has no true
   * north to offer — the same figure and the same absence as
   * `readMagneticDeclinationDeg`, arriving as the compass settles rather than
   * once.
   */
  declinationDeg: number | null;
  /**
   * How well calibrated the platform reckons its compass is: 3 high, 2 medium,
   * 1 low, 0 unusable. `expo-location` reports the same four levels on both
   * platforms, mapping iOS's uncertainty in degrees onto them — 3 is better
   * than 20°, 2 better than 35°, 1 better than 50°, and 0 is worse than that.
   *
   * The reason to carry it at all: those bands are wide. A level-2 compass is
   * allowed to be 35° out, which is most of the frame, and nothing else in the
   * app can tell that reading apart from a good one. See `COMPASS_ACCURACY`.
   */
  accuracy: number;
};

/**
 * Follows the platform's compass, resolving to an unsubscribe function.
 *
 * Two things the app has no other source for. The **declination** stops being a
 * single reading taken at boot: `readMagneticDeclinationDeg` waits three
 * seconds and then goes without one, which costs the whole session the local
 * declination on the one launch where the compass was slow to settle — and
 * leaves two phones side by side disagreeing by exactly that. It is also a
 * property of where the phone is rather than of the phone, so it has to follow
 * an observer that travels. Kept open, the first heading that does settle
 * corrects it, and it goes on correcting.
 *
 * The **accuracy** is the platform's own word on whether any of that is worth
 * trusting, which is the one thing a magnetometer cannot say for itself: a
 * hard-iron bias reads exactly like a field, and 13 µT of it — a magnetic case,
 * a car door, a second phone on the table — is thirty degrees of heading at
 * these latitudes.
 *
 * Behind the same foreground permission as the fix, so call it after one has
 * been granted; without it the watch never reports and the caller keeps
 * whatever boot managed to read.
 */
export async function subscribeToCompass(
  onChange: (reading: CompassReading) => void
): Promise<() => void> {
  const subscription = await Location.watchHeadingAsync(({ trueHeading, magHeading, accuracy }) => {
    onChange({
      // iOS reports a negative true heading when it has no declination to
      // apply, exactly as in the one-shot read above.
      declinationDeg:
        trueHeading < 0 || magHeading < 0 ? null : wrapDegrees180(trueHeading - magHeading),
      accuracy
    });
  });
  return () => subscription.remove();
}

/** How long boot will wait for the compass to settle before going without it. */
const HEADING_TIMEOUT_MS = 3000;

/** What `promise` resolves to, or `null` if it has not by `ms`. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follows the observer as they move, resolving to an unsubscribe function.
 *
 * Every `distanceInterval` metres, because nothing in the view responds to
 * less: a hundred metres moves the nearest satellite by well under a pixel, and
 * a fix per second would spend battery redrawing the same frame.
 */
export async function subscribeToObserver(
  onChange: (observer: ObserverLocation) => void
): Promise<() => void> {
  const subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 100 },
    (position) => onChange(asObserver(position))
  );
  return () => subscription.remove();
}
