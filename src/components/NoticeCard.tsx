import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { glass, theme } from "./theme";

export type Notice = { title: string; detail: string };

/**
 * A warning over the sky: a title in the warning colour and a sentence under
 * it. The shape every notice in the sky view wears — the compass's
 * (`CompassNotice`) and the catalogue's (`CatalogNotice`) — so two of them
 * stacked read as one kind of thing.
 */
export const NoticeCard: React.FC<{ notice: Notice }> = ({ notice }) => (
  <View style={styles.notice} accessibilityRole="alert">
    <View style={styles.mark} />
    <View style={styles.words}>
      <Text style={styles.title}>{notice.title}</Text>
      <Text style={styles.detail}>{notice.detail}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  notice: {
    // Nothing here is touchable, and it sits over the picture.
    pointerEvents: "none",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: theme.radius.panel,
    ...glass(theme.color.panelDeep, 20),
    borderColor: "rgba(240, 198, 116, 0.35)"
  },
  /**
   * The warning colour, as a bar down the side rather than as an outline.
   *
   * An amber border around a panel over a camera picture is a rectangle of
   * colour on the sky; a bar is the same claim in a tenth of the ink, and it
   * is the shape every notice on this platform wears.
   */
  mark: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: theme.color.warning
  },
  words: {
    flex: 1
  },
  title: {
    color: theme.color.warning,
    fontSize: 12,
    fontWeight: "700"
  },
  detail: {
    marginTop: 3,
    color: theme.color.textDim,
    fontSize: 11,
    lineHeight: 15
  }
});

