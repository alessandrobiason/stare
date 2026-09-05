import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CategoryLegend } from "../src/components/CategoryLegend";
import { NIGHT_PALETTE } from "../src/components/palette";
import { SceneStatus } from "../src/components/SceneStatus";
import { allCategories } from "../src/satellite/categories";

/** The rendered overlay as plain text, the way someone reads it. */
function textOf(element: React.ReactElement): string {
  return renderToStaticMarkup(element)
    .replace(/<[^>]+>/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function legend(enabled = allCategories()) {
  return (
    <CategoryLegend
      enabledCategories={enabled}
      onToggleCategory={() => undefined}
      onEnableAll={() => undefined}
      palette={NIGHT_PALETTE}
    />
  );
}

describe("the category filter", () => {
  test("opens closed: its own title, and none of the list", () => {
    const text = textOf(legend());

    expect(text).toContain("FILTER");
    // The sky is what the screen is for; the list is a tap away, not in the way.
    expect(text).not.toContain("NAVIGATION");
    expect(text).not.toContain("SHOW ALL");
    expect(text).not.toContain("PARKED");
  });

  test("says so when it is hiding something, so a thin sky reads as a setting", () => {
    const some = allCategories();
    some.delete("COMMS");
    some.delete("OTHER");

    expect(textOf(legend(some))).toContain("3/5");
    // Nothing to report while everything is drawn.
    expect(textOf(legend())).not.toContain("5/5");
  });

  test("the title is the control that opens it", () => {
    const markup = renderToStaticMarkup(legend());

    expect(markup).toContain('aria-label="Category filter"');
    expect(markup).toContain('aria-expanded="false"');
  });
});

describe("the marker count", () => {
  test("is the number and nothing else", () => {
    expect(textOf(<SceneStatus markerCount={17} />)).toBe("17");
  });

  test("still says what it counts, for anyone not reading the screen", () => {
    expect(renderToStaticMarkup(<SceneStatus markerCount={17} />)).toContain(
      'aria-label="17 visible satellites"'
    );
  });

  test("a degraded boot tints the number rather than printing the warning", () => {
    const warned = renderToStaticMarkup(<SceneStatus markerCount={0} warned />);

    expect(textOf(<SceneStatus markerCount={0} warned />)).toBe("0");
    expect(warned).not.toBe(renderToStaticMarkup(<SceneStatus markerCount={0} />));
  });
});
