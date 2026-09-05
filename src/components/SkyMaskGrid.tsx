import React from "react";
import { StyleSheet, View } from "react-native";
import { SkyMask, cellIndex } from "../vision/skyMask";
import { theme } from "./theme";

/** Strength of the red tint over a fully obstructed cell. */
const MAX_TINT_ALPHA = 0.48;

/**
 * Widest the drawn grid gets on a phone.
 *
 * The mask itself is thousands of cells, and this draws it as views: one per
 * cell would be thousands of them laid out over the camera, so pooling first
 * keeps the overlay to a few hundred that still show where the roofline is,
 * which is what it is for. It could be a Skia picture now that the markers are
 * one (`SatelliteMarkers`), but it is not under the same pressure — this is a
 * debug overlay, memoized on the mask, and so is redrawn about once a second
 * rather than sixty times.
 */
const MAX_COLUMNS = 14;

/** Cells this clear are not worth a view: nothing would be drawn in them. */
const MINIMUM_ALPHA = 0.03;

type PooledCell = { key: string; left: number; top: number; alpha: number };

/**
 * Debug overlay: tints each mask cell in proportion to how obstructed the
 * segmentation believes it is. Open sky is left clear.
 *
 * What ships. The replay harness resolves `SkyMaskGrid.web.tsx` instead — the same
 * overlay painted into one canvas — for the web build and this file everywhere
 * else. Both draw the same mask; only what there is to draw into differs.
 *
 * `memo` is what makes this affordable — the scene re-renders every animation
 * frame, and the mask changes about once a second.
 */
export const SkyMaskGrid: React.FC<{ mask: SkyMask }> = React.memo(({ mask }) => {
  const grid = React.useMemo(() => poolForDisplay(mask), [mask]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {grid.cells.map((cell) => (
        <View
          key={cell.key}
          style={{
            position: "absolute",
            left: `${cell.left * 100}%`,
            top: `${cell.top * 100}%`,
            // A hair of overlap: exact percentages leave seams once they are
            // rounded to device pixels, and a grid of hairlines reads as a
            // pattern in the picture rather than as a mask.
            width: `${(1 / grid.columns) * 100 + 0.2}%`,
            height: `${(1 / grid.rows) * 100 + 0.2}%`,
            backgroundColor: `rgba(${theme.color.obstruction}, ${cell.alpha})`
          }}
        />
      ))}
    </View>
  );
});

SkyMaskGrid.displayName = "SkyMaskGrid";

/**
 * Averages the mask down to a grid coarse enough to draw, keeping its shape:
 * cells stay square in angle, as they are in the mask itself.
 */
function poolForDisplay(mask: SkyMask): { columns: number; rows: number; cells: PooledCell[] } {
  const columns = Math.max(1, Math.min(mask.columns, MAX_COLUMNS));
  const rows = Math.max(1, Math.round((columns * mask.rows) / mask.columns));
  const cells: PooledCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    const startY = Math.floor((row * mask.rows) / rows);
    const endY = Math.max(startY + 1, Math.floor(((row + 1) * mask.rows) / rows));

    for (let column = 0; column < columns; column += 1) {
      const startX = Math.floor((column * mask.columns) / columns);
      const endX = Math.max(startX + 1, Math.floor(((column + 1) * mask.columns) / columns));

      let sum = 0;
      let counted = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          sum += mask.confidence[cellIndex(mask, x, y)];
          counted += 1;
        }
      }

      const alpha = MAX_TINT_ALPHA * Math.max(0, 1 - (counted ? sum / counted : 0));
      if (alpha < MINIMUM_ALPHA) continue;
      cells.push({ key: `${column}:${row}`, left: column / columns, top: row / rows, alpha });
    }
  }

  return { columns, rows, cells };
}
