import React from "react";
import { COMPASS_ACCURACY } from "../constants";
import { strings } from "../i18n";
import { Notice, NoticeCard } from "./NoticeCard";

type Props = {
  /** The platform's grade of its own compass, or `undefined` before the first heading. */
  accuracy: number | undefined;
  /** Whether a declination has been had; without one the offsets are to magnetic north. */
  declinationKnown: boolean;
  /**
   * Whether the sun or the moon is currently aiming the view instead of the
   * compass (`useCelestialAlignment`).
   *
   * Silences both notices below, because both are about a bearing that is no
   * longer the one in use. Asking for a figure-eight while the sky is holding
   * the heading is asking for work that would change nothing on screen, and a
   * warning nobody needs to act on is how people learn to ignore the ones they
   * do.
   */
  skyFixStanding: boolean;
};

/**
 * The one sensor fault the person holding the phone can do something about.
 *
 * A compass is the only thing here that fails silently and plausibly. A dead
 * magnetometer reports zeros and a lost fix stops boot, but a magnetometer
 * captured by a magnet — a case, a car door, a second phone on the same table —
 * reports a field like any other, and the sky is simply drawn somewhere else.
 * At these latitudes the horizontal component is about half the total, so 13 µT
 * of bias is thirty degrees, which is most of the frame: the satellites on
 * screen are the wrong satellites, steadily, and nothing about the view says so.
 *
 * Which is why this is a sentence over the sky where boot's warnings are not
 * (those are a dot on the settings tab — see `TabBar`). Boot's warnings last
 * the session and would be a permanent paragraph on any phone missing a
 * sensor; this one names something the phone can fix in five seconds, and
 * takes itself away when it has been — the platform regrades its compass as
 * the figure-eight feeds its calibration.
 *
 * It stands at the top of the stack the bottom of the sky view is built from,
 * directly above the compass strip it is a warning about, and everything under
 * it moves down rather than out of the way: the card and the strip are laid
 * out in a column, so a notice appearing costs the picture its own height and
 * nothing else. See `SkyOverlay`.
 *
 * Two states, and the accuracy wins: a compass the platform will not vouch for
 * makes the declination question moot, since a few degrees of true-versus-
 * magnetic is not what is wrong with a bearing that may be forty out.
 *
 * And no states at all while the sky is aiming the view. Both notices are about
 * the magnetic bearing, and a sighting of the sun replaces it outright
 * (`useCelestialAlignment`) — including the declination, since what a sighting
 * measures is the bearing to *true* north and not the one the field points
 * along. Whichever of the two would have been shown is a question about a
 * quantity nothing on screen is currently using.
 */
export const CompassNotice: React.FC<Props> = (props) => {
  const notice = noticeFor(props);
  return notice ? <NoticeCard notice={notice} /> : null;
};

function noticeFor({ accuracy, declinationKnown, skyFixStanding }: Props): Notice | null {
  // Nothing at all while the sky is aiming the view: both notices are about the
  // magnetic bearing, and a sighting of the sun replaces it outright.
  if (skyFixStanding) return null;
  // Nothing at all until the compass has reported, either: silence here is the
  // seconds before the first heading, not a verdict.
  const notices = strings().compassNotice;
  if (accuracy !== undefined && accuracy <= COMPASS_ACCURACY.warnAtOrBelow) {
    return notices.calibrate;
  }
  if (!declinationKnown) return notices.magnetic;
  return null;
}

export default CompassNotice;
