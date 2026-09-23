import React from "react";
import { StyleSheet } from "react-native";

/**
 * `react-native-web` has no `<img>` primitive that hands back the DOM element,
 * and the sky segmenter needs that element to read pixels from. This alias
 * keeps the cast in one place, as `ReplayVideo` does for `<video>`.
 */
const HtmlImage = "img" as unknown as React.ComponentType<Record<string, unknown>>;

type Props = {
  uri: string;
  imageRef: React.RefObject<HTMLImageElement | null>;
};

/**
 * The photograph behind the marks in an App Store frame.
 *
 * `cover` rather than `contain`, and it has to be: the box this fills is the
 * phone camera's 3:4 frame, which the phone fills the same way. The matching
 * crop is reproduced in `stillFrameGrabber` so the mask reads the picture that
 * is actually on screen.
 */
export const StillPicture: React.FC<Props> = ({ uri, imageRef }) => (
  <HtmlImage
    ref={imageRef}
    src={uri}
    alt=""
    // The photographs are served from the same origin as the page, but the
    // canvas the mask is read through taints on anything cross-origin, and a
    // tainted canvas throws on `getImageData` rather than degrading.
    crossOrigin="anonymous"
    style={styles.picture as unknown as Record<string, unknown>}
  />
);

const styles = StyleSheet.create({
  picture: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover"
  }
});
