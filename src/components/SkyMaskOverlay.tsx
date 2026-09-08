import React, { MutableRefObject, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FrameLens } from "../camera/projection";
import { OrientationFilter } from "../fusion/orientationFilter";
import { AnchoredSkyMask, MaskAlignment, maskAlignment } from "../vision/anchoredMask";
import { FrameSize } from "./markerGeometry";
import { SkyMaskGrid } from "./SkyMaskGrid";

type Props = {
  /** The newest mask, with the attitude it was taken at. */
  mask: AnchoredSkyMask;
  /** Where the camera is aimed now, sampled on this overlay's own frames. */
  orientationFilterRef: MutableRefObject<OrientationFilter>;
  /** The frame the mask was taken on, which is the one it is drawn over. */
  lens: FrameLens;
  /** The box the picture is drawn in, in pixels — larger than the screen when
   * the picture covers it, and clipped by the view above. See `frameBoxFor`. */
  frame: FrameSize | null;
};

/**
 * Draws the debug sky mask over the picture, in the place it actually applies.
 *
 * The mask is a map of the sky rather than a decal on the screen
 * (`AnchoredSkyMask`), so as the phone turns it has to travel with the
 * buildings it was taken from — and stop covering the sky the turn revealed.
 * Drawn straight into the frame instead, it sits still while the markers move,
 * which reads as a mask lagging a second behind the phone and leaves nothing on
 * screen to say why a satellite over a roof is still being drawn.
 *
 * The grid itself is untouched and memoized, so a frame of this costs one view's
 * transform rather than a redraw of a few hundred cells. Its own animation frame
 * rather than the marker loop's, because it is mounted only with the debug
 * overlays on: with them off there is no second loop to pay for.
 */
export const SkyMaskOverlay: React.FC<Props> = ({
  mask,
  orientationFilterRef,
  lens,
  frame
}) => {
  const alignment = useMaskAlignment(mask, orientationFilterRef, lens);
  if (!frame || !alignment) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          transform: [
            { translateX: ((alignment.centre.left - 50) / 100) * frame.width },
            { translateY: ((alignment.centre.top - 50) / 100) * frame.height },
            { rotate: `${alignment.rotationDeg}deg` },
            { scale: alignment.scale }
          ]
        }
      ]}
      pointerEvents="none"
    >
      <SkyMaskGrid mask={mask.mask} />
    </View>
  );
};

/**
 * Where the mask's frame sits in the frame on screen, recomputed every animation
 * frame.
 *
 * State rather than a ref, because a transform has to go through a render to
 * reach the view — but only this component's, and only three projections behind
 * it, which is the same bargain the markers make. Published only when it has
 * moved by something that can be seen, so a phone lying still on a table costs
 * one projection a frame and no renders at all.
 */
function useMaskAlignment(
  mask: AnchoredSkyMask,
  orientationFilterRef: MutableRefObject<OrientationFilter>,
  lens: FrameLens
): MaskAlignment | null {
  const [alignment, setAlignment] = useState<MaskAlignment | null>(null);
  const publishedRef = useRef<MaskAlignment | null>(null);

  useEffect(() => {
    let handle = requestAnimationFrame(function align(now: number) {
      const next = maskAlignment(mask, orientationFilterRef.current.sample(now / 1000), lens);
      if (moved(publishedRef.current, next)) {
        publishedRef.current = next;
        setAlignment(next);
      }
      handle = requestAnimationFrame(align);
    });

    return () => cancelAnimationFrame(handle);
  }, [lens, mask, orientationFilterRef]);

  return alignment;
}

/**
 * Whether the mask has moved far enough to be worth a render: a twentieth of a
 * percent of the frame across, a twentieth of a degree around, and five parts in
 * ten thousand of its size — none of which a pixel on a phone can show.
 */
function moved(published: MaskAlignment | null, next: MaskAlignment | null): boolean {
  if (!published || !next) return published !== next;

  return (
    Math.abs(next.centre.left - published.centre.left) > 0.05 ||
    Math.abs(next.centre.top - published.centre.top) > 0.05 ||
    Math.abs(next.rotationDeg - published.rotationDeg) > 0.05 ||
    Math.abs(next.scale - published.scale) > 0.0005
  );
}
