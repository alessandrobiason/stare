import { alertGateway } from "./alertGateway";
import { PassAlertAccess } from "./alertTypes";

/**
 * What the phone currently allows, held in one place and read from two.
 *
 * Two screens care about this and they are not near each other in the tree: the
 * settings row, which says what the state is and is the way to change it, and
 * the scheduler behind the sky view, which must start queueing the moment the
 * answer turns into a yes. A permission granted in settings that the scheduler
 * only noticed on the next launch would be a first evening with the switch on
 * and nothing delivered.
 *
 * So it is module state with subscribers rather than a context, exactly as the
 * locale is (`src/i18n/locale.ts`) and for the same reason: it changes a
 * handful of times in a session at most, and a provider around a tree that
 * re-renders sixty times a second is a lot of machinery for a value that does
 * not move.
 *
 * `null` until the platform has answered for the first time. Not a fourth state
 * of the permission — a state of this app's knowledge of it — and the row it is
 * read by simply is not drawn yet. Boot asks once on the way in
 * (`bootTasks.ts`), so by the time the view exists there is nearly always an
 * answer here already.
 */

let known: PassAlertAccess | null = null;
const listeners = new Set<() => void>();

/** What the phone last said, or `null` before it has been asked anything. */
export function passAlertAccess(): PassAlertAccess | null {
  return known;
}

/** Asks the platform again and publishes the answer. Prompts nobody. */
export async function refreshPassAlertAccess(): Promise<PassAlertAccess> {
  return publish(await alertGateway.read());
}

/**
 * Asks for the permission, which prompts exactly once in the life of an
 * install and afterwards is only a reading of the standing answer.
 *
 * That is why the settings row leads to the phone's own settings rather than
 * calling this a second time: after a refusal there is nothing here that can
 * put a prompt back on the screen. See `openPassAlertSettings`.
 */
export async function askForPassAlerts(): Promise<PassAlertAccess> {
  return publish(await alertGateway.request());
}

/** This app's page in the phone's settings: the only way back from a refusal. */
export function openPassAlertSettings(): Promise<void> {
  return alertGateway.openSettings();
}

/** Called whenever the answer changes. Returns the way to stop listening. */
export function subscribePassAlertAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: pretends the platform has answered. `null` to forget it again. */
export function setPassAlertAccessForTesting(next: PassAlertAccess | null): void {
  publish(next);
}

/**
 * Records an answer, and tells the screens only when it is news.
 *
 * Every foreground return asks again (`usePassAlertAccess`), and nearly every
 * one of those answers the same as the last — so the guard is what keeps a
 * settings sheet from re-rendering each time the app comes back.
 */
function publish<T extends PassAlertAccess | null>(next: T): T {
  if (next === known) return next;
  known = next;
  for (const listener of listeners) listener();
  return next;
}
