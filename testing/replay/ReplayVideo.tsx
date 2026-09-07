import React from "react";
import { StyleSheet } from "react-native";

/**
 * `react-native-web` has no `<video>` primitive, so the DOM element is used
 * directly. This alias keeps the cast in one place.
 */
const HtmlVideo = "video" as unknown as React.ComponentType<Record<string, unknown>>;

type VideoEvent = { currentTarget: HTMLVideoElement };

type Props = {
  /** Resolved during boot, which fails if there is nothing to play. */
  uri: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTimeChange: (seconds: number) => void;
  onSeeked: (seconds: number) => void;
};

/**
 * The recorded iPhone video, used as the AR background — and, under the replay,
 * the frame the sky mask is computed from. Boot stops when it cannot be
 * resolved, so there is no missing-video state to render here.
 *
 * No `controls`: the scene lays its marker tap target over the whole picture,
 * which is the app's own behaviour and not the harness's to switch off, so the
 * native ones can be seen and never pressed. `ReplayControls` is the transport
 * instead, rendered over that tap target rather than under it.
 */
export const ReplayVideo: React.FC<Props> = ({ uri, videoRef, onTimeChange, onSeeked }) => {
  return (
    <HtmlVideo
      ref={videoRef}
      src={uri}
      style={styles.video as unknown as Record<string, unknown>}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(event: VideoEvent) => onTimeChange(event.currentTarget.currentTime)}
      // Coarse (~4 Hz) but the only signal while paused; usePlaybackTime
      // supplies the per-frame updates during playback.
      onTimeUpdate={(event: VideoEvent) => onTimeChange(event.currentTarget.currentTime)}
      onSeeked={(event: VideoEvent) => onSeeked(event.currentTarget.currentTime)}
    />
  );
};

const styles = StyleSheet.create({
  video: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    // The frame this sits in already has the recording's shape, so there is
    // nothing to crop; `contain` shows a mismatch rather than hiding it.
    objectFit: "contain"
  }
});
