import { AlertGateway } from "./alertTypes";

/**
 * The browser's notification centre, which for this app is nothing at all.
 *
 * The web build is the replay harness: a recording played back through the
 * app's own code, on a machine that is not going to be carried outside at nine
 * in the evening. A pass alert there would be a notification about a sky
 * recorded weeks ago, in a place the laptop is not, scheduled against a clock
 * the harness can seek backwards through.
 *
 * So this says `"unsupported"` and means it, and the settings row that reads it
 * is not drawn at all rather than being drawn switched off (`SettingsScreen`).
 * Browsers do have a Notification API — this is a decision about what the
 * harness is for, not a gap in the platform.
 */
export const alertGateway: AlertGateway = {
  supported: false,
  read: () => Promise.resolve("unsupported"),
  request: () => Promise.resolve("unsupported"),
  openSettings: () => Promise.resolve(),
  publish: () => Promise.resolve(0)
};
