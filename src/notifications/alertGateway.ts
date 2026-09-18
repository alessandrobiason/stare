import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { AlertGateway, PassAlertAccess, ScheduledAlert } from "./alertTypes";

/**
 * The phone's notification centre, as the two things this app does with it:
 * ask, and queue.
 *
 * **Everything here is local.** There is no server, no push token and no
 * account — a pass alert is a `UNNotificationRequest` with a date on it,
 * worked out on the device from the same catalogue the sky is drawn from and
 * handed to iOS to deliver. That is what makes it work with the app closed,
 * and it is also the whole of its limit: iOS runs nothing of ours in the
 * meantime, so what is delivered while the app is shut is exactly what was
 * queued the last time it was open. See `PASS_ALERTS.windowHours`.
 *
 * **Nothing here throws.** Every call is into a native module that may be
 * missing (a dev client without it built in), refused, or in a state nobody
 * anticipated, and none of that is worth losing the sky view over — a phone
 * that will not take notifications is a phone that draws satellites without
 * them. A failure is `"denied"`, or nothing queued, and the app carries on.
 *
 * **No foreground handler is set,** which means iOS shows nothing while the app
 * is the thing on screen. That is the behaviour wanted rather than a gap: the
 * pass this would be announcing is already drawn on the sky behind the banner,
 * with its arc, its countdown and its card.
 */

/**
 * What every queued notification's identifier starts with.
 *
 * Only ours are cancelled on a republish, and this is what says which those
 * are. Nothing else in this app queues a notification today, and the prefix
 * costs nothing against the day something does.
 */
const IDENTIFIER_PREFIX = "stare.pass.";

/** How one of the phone's answers reads as one of ours. */
function accessFrom(status: Notifications.NotificationPermissionsStatus): PassAlertAccess {
  // `granted` is already true for a provisional authorisation, which is a real
  // delivery — quietly, into the notification centre — and so a real yes.
  if (status.granted) return "granted";
  return status.status === "undetermined" ? "undetermined" : "denied";
}

async function read(): Promise<PassAlertAccess> {
  try {
    return accessFrom(await Notifications.getPermissionsAsync());
  } catch {
    // A notification centre that cannot be asked is one that will not deliver.
    return "denied";
  }
}

async function request(): Promise<PassAlertAccess> {
  try {
    // Alerts and a sound, and no badge: a number on the app icon is a count of
    // things waiting to be dealt with, and a pass that has been and gone is not
    // one of them.
    return accessFrom(
      await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: false }
      })
    );
  } catch {
    return "denied";
  }
}

/**
 * This app's page in the phone's settings, which is the only way back from a
 * refusal.
 *
 * iOS asks once and never again: after that `request` returns the standing
 * answer without showing anything, so the app's own row cannot be the switch —
 * it can only be the door to the switch.
 */
async function openSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing to do about it, and nothing worth saying on screen: the row the
    // tap came from is still there, still saying what the state is.
  }
}

/** Everything of ours already standing in the queue. */
async function queuedIdentifiers(): Promise<string[]> {
  try {
    const queued = await Notifications.getAllScheduledNotificationsAsync();
    return queued
      .map((standing) => standing.identifier)
      .filter((identifier) => identifier.startsWith(IDENTIFIER_PREFIX));
  } catch {
    return [];
  }
}

async function publish(alerts: readonly ScheduledAlert[]): Promise<number> {
  for (const identifier of await queuedIdentifiers()) {
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      // One that will not cancel is one iOS has already delivered or dropped.
    }
  }

  let queued = 0;
  for (const alert of alerts) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${IDENTIFIER_PREFIX}${alert.id}`,
        content: { title: alert.title, body: alert.body, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(alert.deliverAtMs)
        }
      });
      queued += 1;
    } catch {
      // A date already past, or a queue iOS has stopped taking from. The rest
      // of the plan is still worth queueing.
    }
  }
  return queued;
}

export const alertGateway: AlertGateway = {
  supported: true,
  read,
  request,
  openSettings,
  publish
};
