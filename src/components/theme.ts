import { StyleSheet } from "react-native";

/**
 * Shared visual tokens for the heads-up overlays.
 *
 * The panels only. What is drawn over the sky — the marks, their outline, the
 * landmark names — is in `palette.ts` instead, because it has two sets and the
 * sun decides which; these are read against a panel of known colour and so have
 * only one.
 */
export const theme = {
  color: {
    background: "#07162c",
    panel: "rgba(3, 12, 24, 0.82)",
    panelLight: "rgba(3, 12, 24, 0.78)",
    text: "#e5eef5",
    textDim: "#d8e4ed",
    textBright: "#ffffff",
    /** For text that is present but not yet relevant, such as a pending step. */
    textFaint: "rgba(216, 228, 237, 0.45)",
    accent: "#9be7c4",
    warning: "#f0c674",
    danger: "#ff8a94",
    dangerSurface: "rgba(218, 56, 74, 0.14)",
    dangerBorder: "rgba(218, 56, 74, 0.4)",
    /** Tint painted over cells the segmentation marks as obstructed. */
    obstruction: "218, 56, 74",
    control: "rgba(255, 255, 255, 0.12)",
    controlActive: "rgba(255, 255, 255, 0.28)",
    divider: "rgba(255, 255, 255, 0.18)"
  }
} as const;

export const panelStyles = StyleSheet.create({
  panel: {
    position: "absolute",
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.panel
  },
  title: {
    color: theme.color.textBright,
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

export const toggleStyles = StyleSheet.create({
  toggle: {
    width: 34,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.control
  },
  toggleOn: {
    backgroundColor: theme.color.controlActive
  },
  label: {
    color: theme.color.textBright,
    fontSize: 8,
    fontWeight: "700"
  }
});
