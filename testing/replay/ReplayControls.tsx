import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { panelStyles, theme } from "../../src/components/theme";

/**
 * `react-native-web` has no range primitive, so the DOM element is used
 * directly — as `ReplayVideo` and `SkyMaskGridWeb` do for theirs. A native
 * `input` also brings drag-to-scrub, arrow keys and a focus ring, none of which
 * a `Pressable` mapping x to a time would have.
 */
const HtmlRange = "input" as unknown as React.ComponentType<Record<string, unknown>>;

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

/** `m:ss`, which is the whole of what a few minutes of recording needs. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Transport for the replayed recording: play, pause and scrub.
 *
 * The `<video>` carries no `controls` of its own, because the scene lays its
 * tap target over the whole picture — that is how a marker is selected, and it
 * is the app's own behaviour rather than something the harness may switch off.
 * Native controls under it can be seen and never pressed. So the transport is
 * rendered here instead: a sibling of `SkyOverlay` rather than a child, which
 * puts it over that tap target, and a strip along the bottom rather than a
 * sheet, which leaves the sky it is played against clickable.
 *
 * It reads the video's own events rather than the per-frame clock in
 * `usePlaybackTime`. `timeupdate` is the coarse one, about 4 Hz — far too slow
 * to aim a projection with, which is why that hook exists, and exactly right
 * for a bar and a pair of timestamps. Rendering this at display rate would cost
 * the harness a re-render per frame to move a scrubber by a pixel.
 */
export const ReplayControls: React.FC<Props> = ({ videoRef }) => {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      setPlaying(!video.paused);
      setTime(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };

    const events = ["loadedmetadata", "durationchange", "timeupdate", "seeked", "play", "pause"];
    for (const event of events) video.addEventListener(event, sync);
    // Metadata may already have arrived: this mounts with the scene, and boot
    // has had the video since before there was a scene to mount it into.
    sync();
    return () => {
      for (const event of events) video.removeEventListener(event, sync);
    };
  }, [videoRef]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <View style={[panelStyles.panel, styles.bar]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause the recording" : "Play the recording"}
        style={styles.button}
        onPress={toggle}
      >
        <Text style={styles.glyph}>{playing ? "❚❚" : "▶"}</Text>
      </Pressable>

      <HtmlRange
        type="range"
        aria-label="Recording position"
        min={0}
        // Never zero, or the browser draws a range with no length to drag along
        // while the metadata is still on its way.
        max={duration || 1}
        step={0.05}
        value={time}
        disabled={duration === 0}
        onChange={(event: { target: { value: string } }) => {
          const video = videoRef.current;
          if (!video) return;
          // Seeking is what moves the bar: the element reports the requested
          // time at once, and `onSeeked` is already wired to tell the scene the
          // frames it has been filtering are no longer contiguous.
          video.currentTime = Number(event.target.value);
        }}
        style={RANGE_STYLE}
      />

      <Text style={styles.time}>
        {clock(time)} / {clock(duration)}
      </Text>
    </View>
  );
};

/** Plain CSS: this goes onto a DOM element `react-native-web` knows nothing of. */
const RANGE_STYLE = {
  flex: 1,
  minWidth: 0,
  height: 18,
  margin: 0,
  cursor: "pointer",
  accentColor: theme.color.accent
} as const;

const styles = StyleSheet.create({
  bar: {
    left: 12,
    bottom: 12,
    // Clear of the console toggle, which owns the bottom-right corner.
    right: 116,
    // The toggle's height, so the two read as one row along the bottom edge.
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    // The shared panel's padding is for a stack of readouts; this is a single
    // row of controls that fills its height.
    paddingVertical: 0
  },
  button: {
    width: 26,
    height: 26,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.control
  },
  glyph: {
    color: theme.color.textBright,
    fontSize: 10,
    lineHeight: 12
  },
  time: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  }
});

export default ReplayControls;
