import { Platform, StyleSheet, ViewStyle } from "react-native";

/**
 * Shared visual tokens for the heads-up overlays.
 *
 * The panels only. What is drawn over the sky — the marks, their outline, the
 * landmark names — is in `palette.ts` instead, because it has two sets and the
 * sun decides which; these are read against a panel of known colour and so have
 * only one.
 *
 * **The whole of this layer is glass over a camera picture.** Nothing here is a
 * screen with panels on it: it is a photograph of the sky with a few controls
 * floating over it, and every token below follows from that. The surfaces are
 * a blue-black the night sky never quite reaches, laid on at two thirds
 * opacity so the picture reads through them; the borders are a single
 * translucent hairline rather than a drawn edge; the text is off-white over a
 * muted blue-grey, which is the pair that stays legible against both a dark sky
 * and a lit horizon; and one electric blue says "this control is doing
 * something" and is spent on nothing else. A control that needs more weight
 * than that gets a fraction more opacity, not a brighter colour.
 *
 * The blur is the one part of this that the phone and the browser disagree
 * about. A browser has `backdrop-filter` and uses it (`glass`); iOS has
 * `UIVisualEffectView`, which is native code this app does not carry, so the
 * same surfaces stand on their alpha alone there. That is why the alphas are
 * as high as they are: they have to hold a caption over a bright horizon
 * without any blur underneath them.
 */
export const theme = {
  color: {
    /**
     * Behind a fitted picture, and under a sheet that covers the whole screen.
     *
     * Only ever seen in the replay harness's letterbox and behind the settings
     * and catalog sheets — on the phone the camera covers every pixel of the
     * view this sits under. See `SkyOverlay`'s `sky` style.
     */
    background: "#050b16",
    /** The glass the floating controls are cut from. */
    panel: "rgba(9, 18, 34, 0.74)",
    /** The same, thinner: for a control small enough to read through. */
    panelLight: "rgba(9, 18, 34, 0.58)",
    /** And heavier, for a sheet carrying a paragraph rather than a word. */
    panelDeep: "rgba(6, 13, 26, 0.88)",
    /** A whole screen laid over the camera: the settings list, the catalog. */
    scrim: "rgba(4, 9, 18, 0.93)",
    text: "#eef4fb",
    /** Secondary writing: a caption, a unit, a row that is not the answer. */
    textDim: "#93a7c0",
    textBright: "#ffffff",
    /** For text that is present but not yet relevant, such as a pending step. */
    textFaint: "rgba(147, 167, 192, 0.5)",
    /**
     * The one accent, and the only saturated colour the panels carry: an
     * active tab, a selected chip, a switch that is on, a figure worth acting
     * on. Electric blue because the sky behind it never is — the marks are
     * warm and pale (`palette.ts`) and the horizon at dusk is orange, so this
     * reads as the app's own rather than as something in the picture.
     */
    accent: "#4da6ff",
    /** The same, as a fill under an active control. */
    accentSoft: "rgba(77, 166, 255, 0.16)",
    accentBorder: "rgba(77, 166, 255, 0.42)",
    warning: "#f0c674",
    danger: "#ff8a94",
    dangerSurface: "rgba(218, 56, 74, 0.14)",
    dangerBorder: "rgba(218, 56, 74, 0.4)",
    /** Tint painted over cells the segmentation marks as obstructed. */
    obstruction: "218, 56, 74",
    control: "rgba(255, 255, 255, 0.08)",
    controlActive: "rgba(77, 166, 255, 0.18)",
    /** The hairline every panel is edged with, and nothing heavier. */
    divider: "rgba(255, 255, 255, 0.1)",
    /** For an edge that has to be found rather than felt — a tab bar's top. */
    dividerStrong: "rgba(255, 255, 255, 0.16)"
  },
  /**
   * The corner radii, which are the other half of how soft this layer reads.
   *
   * Three of them, and each belongs to a size of thing: a round control, a
   * panel that opens from one, and a sheet the width of the screen.
   */
  radius: {
    control: 12,
    panel: 18,
    sheet: 22,
    /** A capsule: the compass strip, a chip, a round button. */
    pill: 999
  }
} as const;

/**
 * A glass surface: the fill, the hairline around it, and a blur behind it where
 * the platform has one.
 *
 * `backdropFilter` is a browser property and is passed straight through by
 * `react-native-web`; on the phone it is not in the style at all, so the
 * surface stands on its alpha. Written as a function rather than a style so
 * the caller picks how heavy the glass is — a chip is lighter than a sheet —
 * without restating the border and the blur beside it every time.
 */
export function glass(
  fill: string = theme.color.panel,
  blurPx = 18
): ViewStyle {
  return {
    backgroundColor: fill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    ...(Platform.OS === "web"
      ? ({ backdropFilter: `blur(${blurPx}px) saturate(140%)` } as ViewStyle)
      : null)
  };
}

/**
 * The shadow under a floating control.
 *
 * Restrained on purpose: what it is for is lifting a dark panel off a dark
 * picture, which takes a wide soft shadow at low opacity rather than a drop
 * shadow anyone can point at. Elevation for Android is not set — this app is
 * an iPhone app and a browser harness.
 */
export const lift: ViewStyle = {
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 }
};

export const panelStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    padding: 10,
    borderRadius: theme.radius.panel,
    ...glass(),
    ...lift
  },
  title: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 7
  },
  readout: {
    marginTop: 4,
    maxWidth: 300,
    color: theme.color.textDim,
    fontSize: 9,
    fontVariant: ["tabular-nums"]
  }
});

/**
 * The switch every list of settings uses: a capsule with a knob in it.
 *
 * It used to read ON and OFF, which is two more words over a camera picture
 * than a switch needs — the position of the knob is the whole message, and it
 * is the one every phone already reads. The capsule is the app's accent when
 * it is on and a sheet of the panel's own glass when it is off.
 */
export const toggleStyles = StyleSheet.create({
  toggle: {
    width: 36,
    height: 21,
    borderRadius: theme.radius.pill,
    padding: 2,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  toggleOn: {
    borderColor: theme.color.accentBorder,
    backgroundColor: theme.color.accentSoft
  },
  knob: {
    width: 15,
    height: 15,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.textDim
  },
  knobOn: {
    // Pushed to the far end, and lit: the two halves of "on".
    transform: [{ translateX: 15 }],
    backgroundColor: theme.color.accent
  }
});
