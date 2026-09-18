/**
 * What the two sides of the notification gateway agree on.
 *
 * Its own module because there are two implementations of that gateway — the
 * phone's (`alertGateway.ts`) and the browser's (`alertGateway.web.ts`, which
 * is the replay harness, where there is nothing of the sort) — and a type
 * declared in one of them is a type the other cannot import: the bundler picks
 * a platform file and only one of the pair is ever in the build. The same split
 * the sky model makes, for the same reason (`skyModelTypes.ts`).
 */

/**
 * Whether this phone will let a notification through, as far as the app can be
 * told.
 *
 * Four states rather than a boolean, because the app says something different
 * in each of them and only one of the three negatives can be fixed by asking.
 * There is no "on" that this app owns separately from the operating system's:
 * the permission is the setting, so there is nothing to keep in sync and no way
 * for a switch in here to disagree with the one in Settings.
 */
export type PassAlertAccess =
  /** Alerts will be delivered. Provisional counts: a quiet delivery is delivery. */
  | "granted"
  /** Refused, or turned off for this app later. Only Settings can undo it. */
  | "denied"
  /** Nobody has been asked yet, so asking is the thing to offer. */
  | "undetermined"
  /** No notifications on this platform at all — the browser harness. */
  | "unsupported";

/** One notification, as the operating system needs it: when, and what it says. */
export type ScheduledAlert = {
  /** Stable per pass, so the same pass cannot be queued twice. `PassAlert.id`. */
  id: string;
  /** When it should be delivered, in epoch milliseconds. */
  deliverAtMs: number;
  title: string;
  body: string;
};

/**
 * Everything the app asks of the operating system's notification centre.
 *
 * Deliberately small, and deliberately incapable of failing loudly: every one
 * of these is a call into a native module that may be missing, refused or
 * simply asleep, and none of it is worth a screen of its own. A gateway that
 * cannot answer says so in its return value — `"unsupported"`, or nothing
 * queued — and the app goes on drawing the sky.
 */
export type AlertGateway = {
  /** Whether there is a notification centre here at all. */
  readonly supported: boolean;
  /** What the phone currently allows, without prompting anybody. */
  read(): Promise<PassAlertAccess>;
  /** Asks, which prompts only the once: after that this is `read` by another name. */
  request(): Promise<PassAlertAccess>;
  /** Opens this app's own page in the phone's settings, where it can be undone. */
  openSettings(): Promise<void>;
  /**
   * Replaces everything this app has queued with `alerts`, and says how many
   * are now standing.
   *
   * Replace rather than add: the plan is made again every half hour and the
   * same passes come out of it, so anything else would queue each of them
   * twice an hour. Queueing is silent — nothing is delivered by scheduling it
   * — so a pass that survives the replan is cancelled and re-queued with no
   * one the wiser.
   */
  publish(alerts: readonly ScheduledAlert[]): Promise<number>;
};
