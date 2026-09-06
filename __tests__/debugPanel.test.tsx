import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DebugPanel } from "../src/components/DebugPanel";
import { DebugSection } from "../src/debug/sections";

/** The rendered panel as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

const sections: DebugSection[] = [
  { id: "sensors", title: "SENSORS", rows: [{ label: "Yaw", value: "132.4°" }] },
  { id: "mask", title: "MASK", rows: [{ label: "Open sky", value: "62%" }] },
  { id: "sky", title: "SKY", rows: [{ label: "Drawn", value: "12" }] }
];

function panel(source = () => sections) {
  return <DebugPanel sourceRef={{ current: source }} onClose={() => undefined} />;
}

test("every section is offered as a tab, so a phone can reach all of them", () => {
  const text = textOf(panel());

  expect(text).toContain("SENSORS");
  expect(text).toContain("MASK");
  expect(text).toContain("SKY");
});

test("one page is shown at a time, starting with the scene's own", () => {
  const text = textOf(panel());

  expect(text).toContain("Yaw");
  expect(text).toContain("132.4°");
  // The other pages are a tap away, not stacked underneath.
  expect(text).not.toContain("62%");
  expect(text).not.toContain("Drawn");
});

test("a scene with nothing to report still renders rather than throwing", () => {
  expect(textOf(panel(() => []))).toBe("✕");
});

describe("a page's switches", () => {
  const withSwitch: DebugSection[] = [
    {
      id: "mask",
      title: "MASK",
      rows: [{ label: "Open sky", value: "62%" }],
      switches: [{ label: "Hide behind terrain", on: true, onToggle: () => undefined }]
    }
  ];

  test("are drawn above the figures they govern, showing where they stand", () => {
    const text = textOf(panel(() => withSwitch));

    expect(text.indexOf("Hide behind terrain")).toBeLessThan(text.indexOf("Open sky"));
    expect(text).toContain("ON");
  });

  test("are switches for anyone not reading the screen, not just labels", () => {
    const markup = renderToStaticMarkup(panel(() => withSwitch));

    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-label="Hide behind terrain"');
  });

  test("show where they stand rather than only that they exist", () => {
    const off = withSwitch.map((section) => ({
      ...section,
      switches: [{ label: "Hide behind terrain", on: false, onToggle: () => undefined }]
    }));

    expect(textOf(panel(() => off))).toContain("OFF");
  });

  test("a page without any is the table of figures it always was", () => {
    expect(textOf(panel())).not.toContain("ON");
  });
});
