import { AppState } from "react-native";

/**
 * Calls back whenever the app comes back to the front, and hands back the way
 * to stop.
 *
 * Two things want this and both of them are about the pass alerts. The
 * permission can only be changed out in the phone's own settings, which is a
 * trip out of the app and back (`usePassAlertAccess`); and the day's
 * notifications have to be queued from a running app, so a return is the one
 * moment the app is allowed to think about a sky it has been away from
 * (`usePassAlerts`).
 *
 * Its own file for the awkward part. `AppState.addEventListener` is typed as
 * always handing back a subscription, and under `react-native-web` it returns
 * nothing at all where there is no document to watch — a server render, the
 * test runner — so a caller that trusts the type throws on the way out. Written
 * once, here, rather than guarded at each of the two call sites.
 */
export function watchForeground(onForeground: () => void): () => void {
  const subscription: { remove(): void } | undefined = AppState.addEventListener(
    "change",
    (state) => {
      if (state === "active") onForeground();
    }
  );

  return () => subscription?.remove();
}
