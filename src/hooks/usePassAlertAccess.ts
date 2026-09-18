import { useEffect, useState } from "react";
import {
  passAlertAccess,
  refreshPassAlertAccess,
  subscribePassAlertAccess
} from "../notifications/alertAccess";
import { PassAlertAccess } from "../notifications/alertTypes";
import { watchForeground } from "./watchForeground";

/**
 * Whether the phone is letting pass alerts through, kept current while the app
 * is on screen.
 *
 * The permission lives in the operating system, and the operating system is
 * where it is most likely to be changed: the settings row here can only open
 * that page, so the sequence to expect is a tap, a trip out to Settings, a
 * switch moved there, and a return. Nothing tells an app about that — the app
 * was not running — which is why coming back to the foreground is a reason to
 * ask again.
 *
 * `null` until the first answer lands. See `alertAccess`.
 */
export function usePassAlertAccess(): PassAlertAccess | null {
  const [access, setAccess] = useState(passAlertAccess);

  useEffect(() => {
    const stop = subscribePassAlertAccess(() => setAccess(passAlertAccess()));
    // On mount as well as on every return, because the row may be the first
    // thing rendered in a session that boot's own ask never reached.
    void refreshPassAlertAccess();

    const foreground = watchForeground(() => void refreshPassAlertAccess());

    return () => {
      stop();
      foreground();
    };
  }, []);

  return access;
}
