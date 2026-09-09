import { safeAreaBox } from "../src/components/SafeAreaLayer";

/**
 * Where the panels' corners are.
 *
 * The app is edge to edge — the camera reaches the notch, because a camera with
 * the notch's height of black over it is a smaller camera and not a safer one —
 * and every panel written over it places itself absolutely in a corner of
 * `SafeAreaLayer`. Which corner that turns out to be is the whole of this.
 *
 * It cannot be read off the screen in a test, and it went wrong once in exactly
 * that way: the layer held the insets as padding, which is what CSS would want,
 * and React Native's layout engine adds a parent's padding to none of an
 * absolutely positioned child's own offsets. Every panel sat at the *screen's*
 * corners instead, with the clock and the battery drawn through the top two. So
 * what is checked here is the shape of the style, since the shape is the bug.
 */
describe("the safe area the panels are laid out in", () => {
  const insets = { top: 59, right: 0, bottom: 34, left: 0 };

  test("becomes the layer's own offsets, one per edge", () => {
    expect(safeAreaBox(insets)).toEqual({ top: 59, right: 0, bottom: 34, left: 0 });
  });

  test("is not padding, which an absolute child would never see", () => {
    const box = safeAreaBox(insets) as Record<string, unknown>;

    for (const key of Object.keys(box)) {
      expect(key).not.toMatch(/^padding/);
    }
  });

  test("insets nothing where there is nothing to inset, as in a browser", () => {
    expect(safeAreaBox({ top: 0, right: 0, bottom: 0, left: 0 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    });
  });
});
