import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useLocale } from "../hooks/useLocale";
import { strings } from "../i18n";
import { GUIDE_LABEL } from "./guideLabel";
import { theme } from "./theme";

type Props = {
  /** Opens the guide over the view. The guide has its own ways out. */
  onOpen: () => void;
};

/**
 * The way back to the intro's pages about the screen, once the intro is behind
 * the phone.
 *
 * The first launch explains every mark, line and corner of this view beside a
 * drawing of each, and then never shows it again. That is right for the pages
 * about starting the app and wrong for the ones about reading it, which are
 * wanted most on the evening somebody has forgotten what a ring means. This
 * opens those pages over the running view (`IntroScreen`'s `guide` mode).
 *
 * Bottom right, above the console toggle. That corner is where the control
 * about the app rather than about the sky already is, and above the toggle is
 * the one place the panels leave alone: the count and the filter open downwards
 * from the top corners, the passes panel and the compass notice keep to the left
 * of the bottom row, and the replay's transport to the middle of it. The only
 * things that ever open over this spot are the satellite card and the console's
 * own panel, both from just above the bottom row — and both are something being
 * read already, so the overlay takes this away while either is up
 * (`SkyOverlay`).
 *
 * A glyph rather than a word, as wide as the toggle is tall, so the corner is a
 * column of two pills rather than a second line of writing over the picture.
 * That it is there at all is said once, on the intro's page about the corners,
 * beside a copy of it.
 *
 * `memo` for the reason `DebugToggle` is: the view around it renders far more
 * often than anything here changes.
 */
export const GuideToggle: React.FC<Props> = React.memo(({ onOpen }) => {
  // The one thing that gets through the memo: the glyph is the same in every
  // language, and the name a screen reader hears for it is not.
  useLocale();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={strings().guide.open}
      style={styles.pill}
      onPress={onOpen}
    >
      <Text style={styles.label}>{GUIDE_LABEL}</Text>
    </Pressable>
  );
});

GuideToggle.displayName = "GuideToggle";

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: 12,
    // On top of the console toggle: its 12 from the edge, its 38 of height and
    // 8 between them, so the two line up as one column in the corner. The
    // satellite card and the console panel both open from this same line.
    bottom: 58,
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.color.divider,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.color.panel
  },
  // The console toggle's own label, larger: one glyph fills the pill a whole
  // word fills beside it.
  label: {
    color: theme.color.textDim,
    fontSize: 16,
    fontWeight: "700"
  }
});

export default GuideToggle;
