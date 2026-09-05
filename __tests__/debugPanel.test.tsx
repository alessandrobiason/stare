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
