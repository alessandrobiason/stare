import { passAlertText } from "../i18n/format";
import { PassAlert } from "../satellite/passAlerts";
import { alertGateway } from "./alertGateway";
import { ScheduledAlert } from "./alertTypes";

/**
 * A plan, as the phone's notification queue holds it.
 *
 * The one place the two halves of this feature meet: what to say
 * (`src/satellite/passAlerts.ts` decided which passes, `passAlertText` wrote
 * the words) and where to put it (`alertGateway`). Kept apart from both, so the
 * arithmetic never imports a native module and the native module never learns
 * what a satellite is.
 *
 * **The words are fixed when the alert is queued, not when it is delivered.**
 * There is nothing running at delivery to write them with — that is the whole
 * point of a local notification — so a language changed this evening reaches
 * the alerts on the next republish rather than the ones already standing. That
 * is a republish away, and one happens every half hour the app is open.
 */

/** The plan, as notifications: one per pass, in the language the app is in. */
export function scheduledAlertsFor(alerts: readonly PassAlert[]): ScheduledAlert[] {
  return alerts.map((alert) => {
    const { title, body } = passAlertText(alert);
    return { id: alert.id, deliverAtMs: alert.deliverAtMs, title, body };
  });
}

/**
 * Hands the whole plan to the phone, replacing whatever was queued before, and
 * says how many are now standing.
 *
 * Nothing is delivered by queueing it, so there is no cost to an alert that is
 * cancelled and queued again half an hour later with the same words on it.
 */
export function publishPassAlerts(alerts: readonly PassAlert[]): Promise<number> {
  return alertGateway.publish(scheduledAlertsFor(alerts));
}
