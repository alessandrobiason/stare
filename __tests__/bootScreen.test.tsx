import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BootScreen } from "../src/components/BootScreen";

/** The rendered screen as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function screen(overrides: Partial<React.ComponentProps<typeof BootScreen>> = {}) {
  return <BootScreen failed={false} error={null} onRetry={() => undefined} {...overrides} />;
}

test("the loading screen says the app's name, and nothing else at all", () => {
  // One word. Every other word this screen has ever carried named a step of a
  // start-up nobody can act on, and the satellites turning are what report that
  // it is still going; the name is the one thing a launch is entitled to say.
  expect(textOf(screen())).toBe("STARE");
});

test("the launch out of the intro leaves the name off", () => {
  // The intro has just spent a page on it. See `useIntro`: the second launch
  // onwards is the one that opens on the name.
  expect(textOf(screen({ wordmark: false }))).toBe("");
});

test("a failure takes the screen from the name rather than sharing it", () => {
  const text = textOf(screen({ failed: true, error: "Your location could not be found." }));

  expect(text).not.toContain("STARE");
  expect(text).toContain("Your location could not be found.");
});

test("a failure shows the reason and a way to try again", () => {
  const text = textOf(
    screen({
      failed: true,
      error: "No satellite catalogue could be downloaded, and none is cached on this device."
    })
  );

  expect(text).toContain("Could not start");
  expect(text).toContain("none is cached on this device");
  expect(text).toContain("TRY AGAIN");
});

test("a failure retrying cannot fix offers no retry, and does not blame the network", () => {
  const text = textOf(
    screen({
      failed: true,
      retryable: false,
      error: "This device has no magnetometer, so a heading cannot be referenced to north."
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
  const reason =
    "The sky could not be segmented, so nothing can be hidden behind terrain: " +
    "CameraImageCaptureDetailedException: Image could not be captured: " +
    "configured[AVFoundationErrorDomain -11800 The operation could not be completed, " +
    "iOS=17.5, running=1, interrupted=0, preset=AVCaptureSessionPresetPhoto, inputs=1, " +
    "outputs=1, preview=393x524, connection=on/active, device=Back Camera, " +
    "activeFormat=4032x3024, supportedMaxPhotoDimensions=[4032x3024/8064x6048], " +
    "maxPhotoDimensions=8064x6048, deferred=0, responsive=1] " +
    "plain[AVFoundationErrorDomain -11800 The operation could not be completed]";

  const text = textOf(screen({ failed: true, error: reason }));

  expect(text).toContain(reason);
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
