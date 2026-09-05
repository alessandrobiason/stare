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

test("the loading screen says nothing at all: the sky is the whole of it", () => {
  // Not "says little" — nothing. Every word this screen used to carry named a
  // step of a start-up nobody can act on, and the satellites turning are what
  // report that it is still going.
  expect(textOf(screen())).toBe("");
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
