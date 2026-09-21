import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Linking } from "react-native";
import { BootError } from "../src/boot/bootRunner";
import { BootFailure } from "../src/boot/bootFailure";
import { BootScreen } from "../src/components/BootScreen";
import { setLocaleForTesting, stringsFor } from "../src/i18n";

afterEach(() => setLocaleForTesting(undefined));

/**
 * The rendered screen as plain text, the way someone reads it.
 *
 * Entities are decoded as well as tags stripped: the renderer escapes an
 * apostrophe to `&#x27;`, and half the Italian strings on this screen have one
 * in them — `l'app`, `dell'orizzonte` — so a check against the string table
 * would otherwise fail on punctuation rather than on anything real.
 */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/ +/g, " ")
    .trim();
}

function screen(overrides: Partial<React.ComponentProps<typeof BootScreen>> = {}) {
  return <BootScreen failed={false} error={null} onRetry={() => undefined} {...overrides} />;
}

test("the loading screen says the app's name, and nothing else at all", () => {
  // One word. Every other word this screen has ever carried named a step of a
  // start-up nobody can act on, and the satellite crossing is what reports that
  // it is still going; the name is the one thing a launch is entitled to say.
  expect(textOf(screen())).toBe("STARE");
});

test("the bar under it adds no words to an ordinary launch", () => {
  // The bar is drawn on every launch, and on the overwhelming majority of them
  // that is all it is: a line filling. The sentence under it belongs to a
  // launch slow enough to have earned an explanation, and one that has only
  // just started has not. See `BootProgressBar`.
  const text = textOf(
    screen({
      progress: {
        fraction: 0.4,
        activity: { kind: "downloading", receivedBytes: 40 * 1024 * 1024, totalBytes: 99_310_780 }
      }
    })
  );

  expect(text).toBe("STARE");
});

test("a failure takes the screen from the name rather than sharing it", () => {
  const text = textOf(
    screen({ failed: true, error: new BootFailure("locationUnavailable") })
  );

  expect(text).not.toContain("STARE");
  expect(text).toContain(stringsFor("en").boot.errors.locationUnavailable);
});

test("and says it in the language the app is in, not the one it was thrown in", () => {
  // The reason is the only line on this screen worth reading, and it used to
  // be the one line still in English under an Italian title: every failure
  // travelled as an `Error.message` written where it happened. It travels as a
  // key now. See `src/boot/bootFailure.ts`.
  setLocaleForTesting("it");
  const text = textOf(screen({ failed: true, error: new BootFailure("locationRefused") }));

  expect(text).toContain(stringsFor("it").boot.failed);
  expect(text).toContain(stringsFor("it").boot.errors.locationRefused);
  expect(text).not.toContain(stringsFor("en").boot.errors.locationRefused);
});

/**
 * Gives the platform an `openSettings`, the way a phone has one.
 *
 * These tests render through `react-native-web`, whose `Linking` has no such
 * method — which is a real difference the screen is built to notice
 * (`canOpenSettings`), and which would otherwise hide the button from every
 * check below.
 */
function withSettingsSupport(body: () => void): void {
  const linking = Linking as unknown as { openSettings?: () => Promise<void> };
  const had = Object.prototype.hasOwnProperty.call(linking, "openSettings");
  linking.openSettings = () => Promise.resolve();
  try {
    body();
  } finally {
    if (!had) delete linking.openSettings;
  }
}

test("a refused permission offers the settings page, which is the only way back", () => {
  // iOS raises its prompt once per install, so after a refusal "try again" is
  // a button that fails identically. The switch is in the phone's settings,
  // and the app can land on its own page there.
  const t = stringsFor("en").boot;
  withSettingsSupport(() => {
    for (const key of ["cameraRefused", "cameraBlocked", "locationRefused", "locationOff"] as const) {
      expect(textOf(screen({ failed: true, error: new BootFailure(key) }))).toContain(
        t.openSettings
      );
    }
  });
});

test("but a failure the app could simply retry does not send anyone to Settings", () => {
  // A dropped connection has nothing to switch on, and a button that opens the
  // settings for it would be advice that does not work.
  const t = stringsFor("en").boot;
  withSettingsSupport(() => {
    const text = textOf(screen({ failed: true, error: new BootFailure("catalogOffline") }));

    expect(text).not.toContain(t.openSettings);
    expect(text).toContain(t.tryAgain);
  });
});

test("nor does a platform that has no settings page to open", () => {
  // The replay harness renders this screen in a browser, where `Linking` has
  // no `openSettings` at all. A button that would throw on the press is worse
  // than no button.
  const t = stringsFor("en").boot;
  const text = textOf(screen({ failed: true, error: new BootFailure("cameraRefused") }));

  expect(text).not.toContain(t.openSettings);
  expect(text).toContain(t.errors.cameraRefused);
  expect(text).toContain(t.tryAgain);
});

test("the platform's own words are kept under the sentence, untranslated", () => {
  // An AVFoundation error or an HTTP status is a thing to photograph and paste
  // into a bug report. Translating it would make it harder to search for.
  const text = textOf(
    screen({ failed: true, error: new BootFailure("catalogFailed", "TLE download failed (503)") })
  );

  expect(text).toContain(stringsFor("en").boot.errors.catalogFailed);
  expect(text).toContain("TLE download failed (503)");
});

test("something thrown with no key of its own still reaches the screen", () => {
  // A crash after boot has finished comes through `reportFatal` as whatever
  // React caught. It gets the catch-all sentence, and keeps its own words.
  const text = textOf(screen({ failed: true, error: new Error("Cannot read property of null") }));

  expect(text).toContain(stringsFor("en").boot.errors.unknown);
  expect(text).toContain("Cannot read property of null");
});

test("a failure shows the reason and a way to try again", () => {
  const text = textOf(screen({ failed: true, error: new BootFailure("catalogOffline") }));

  expect(text).toContain("Could not start");
  expect(text).toContain("none is cached on this device");
  expect(text).toContain("CelesTrak");
  expect(text).toContain("TRY AGAIN");
});

test("a failure retrying cannot fix offers no retry, and does not blame the network", () => {
  const text = textOf(
    screen({
      failed: true,
      retryable: false,
      error: new BootFailure("noMagnetometer")
    })
  );

  expect(text).toContain("no magnetometer");
  expect(text).toContain("This device cannot run the sky view.");
  expect(text).not.toContain("TRY AGAIN");
  expect(text).not.toContain("network");
});

test("a long failure reason is shown in full, not clipped or elided", () => {
  // The camera's capture failures carry the AVFoundation error and the
  // session's state with them, which is a paragraph. The card sits centred
  // inside an `overflow: "hidden"` root, so a reason that outgrows the screen
  // used to lose its tail with no way to reach it — and the tail is where the
  // second half of a two-attempt failure lives.
  const diagnostic =
    "CameraImageCaptureDetailedException: Image could not be captured: " +
    "configured[AVFoundationErrorDomain -11800 The operation could not be completed, " +
    "iOS=17.5, running=1, interrupted=0, preset=AVCaptureSessionPresetPhoto, inputs=1, " +
    "outputs=1, preview=393x524, connection=on/active, device=Back Camera, " +
    "activeFormat=4032x3024, supportedMaxPhotoDimensions=[4032x3024/8064x6048], " +
    "maxPhotoDimensions=8064x6048, deferred=0, responsive=1] " +
    "plain[AVFoundationErrorDomain -11800 The operation could not be completed]";

  // Thrown the way boot actually throws it: the step that gave way on the
  // outside, the thing the screen prints on the inside.
  const text = textOf(
    screen({
      failed: true,
      error: new BootError("skyModel", diagnostic, [], new BootFailure("skyModelFailed", diagnostic))
    })
  );

  expect(text).toContain(stringsFor("en").boot.errors.skyModelFailed);
  expect(text).toContain(diagnostic);
  // The end of the message specifically: that is the half that says whether the
  // plain retry failed too, and it is the half a clipped card would drop.
  expect(text).toContain("plain[AVFoundationErrorDomain -11800");
  expect(text).not.toContain("…");
});

test("the loading screen carries no build line, only the name", () => {
  // The build identity belongs to a failure report, not to a launch. A line
  // that leaked onto the loading screen would undo the whole point of it.
  expect(textOf(screen())).toBe("STARE");
});
