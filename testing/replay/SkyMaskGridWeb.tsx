import React, { useEffect, useRef } from "react";
import { theme } from "../../src/components/theme";
import { fineConfidence, fineGrid, SkyMask } from "../../src/vision/skyMask";

/**
 * `react-native-web` has no `<canvas>` primitive, so the DOM element is used
 * directly. This alias keeps the cast in one place.
 */
const HtmlCanvas = "canvas" as unknown as React.ComponentType<Record<string, unknown>>;

/** Strength of the red tint over a fully obstructed cell. */
const MAX_TINT_ALPHA = 0.48;

/**
 * Debug overlay: tints each mask cell in proportion to how obstructed the
 * segmentation believes it is. Open sky is left clear.
 *
 * The harness's half of the pair: reached through
 * `src/components/SkyMaskGrid.web.tsx` for the web build, while the phone draws
 * the same overlay as pooled views (`src/components/SkyMaskGrid.tsx`), since
 * native has no canvas.
 *
 * One canvas pixel per cell, stretched over the frame, rather than a view per
 * cell. At the old 48x32 grid a view per cell meant 1536 absolutely positioned
 * elements whose styles `react-native-web` rebuilt and re-diffed on every video
 * frame — 17% of the main thread in Chrome, holding the replay at 46 fps — for a
 * mask that changes every couple of seconds. The grid is finer than that now, so
 * the canvas matters more rather than less. `memo` is what keeps that promise,
 * since the parent re-renders constantly.
 *
 * Drawn on the mask's sub-cell grid rather than its cells, so the sharpened
 * edges (`SkyMaskDetail`) are on screen next to the tree they were computed
 * from. Away from an edge the sub-cells of a cell are its own value repeated and
 * the picture is exactly the coarse one; along a roofline or through a canopy
 * they are not, and that difference is the whole of what this feature does.
 */
export const SkyMaskGrid: React.FC<{ mask: SkyMask }> = React.memo(({ mask }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const grid = fineGrid(mask);
    canvas.width = grid.columns;
    canvas.height = grid.rows;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, grid.columns, grid.rows);
    for (let row = 0; row < grid.rows; row += 1) {
      for (let column = 0; column < grid.columns; column += 1) {
        const alpha = MAX_TINT_ALPHA * Math.max(0, 1 - fineConfidence(mask, column, row));
        if (alpha <= 0) continue;
        context.fillStyle = `rgba(${theme.color.obstruction}, ${alpha})`;
        context.fillRect(column, row, 1, 1);
      }
    }
  }, [mask]);

  return <HtmlCanvas ref={canvasRef} style={CANVAS_STYLE} />;
});

SkyMaskGrid.displayName = "SkyMaskGrid";

/**
 * Plain CSS rather than `StyleSheet.create`: this goes onto a DOM element that
 * `react-native-web` knows nothing about, and `imageRendering` is not a style
 * React Native has.
 *
 * `pixelated` is the point of it. One canvas pixel is one mask sub-cell, so
 * letting the browser interpolate would draw a soft gradient and misrepresent a
 * coarse probability field as a smooth one.
 */
const CANVAS_STYLE = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
  imageRendering: "pixelated"
} as const;
