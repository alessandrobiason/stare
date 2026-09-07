import React, { MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DebugSection, DebugSource, DebugSwitch } from "../debug/sections";
import { theme } from "./theme";
import { Toggle } from "./Toggle";

type Props = {
  /**
   * Read on the panel's own timer. A ref so the panel's props stay stable while
   * the scene around it re-renders every animation frame.
   */
  sourceRef: MutableRefObject<DebugSource>;
  onClose: () => void;
};

/**
 * How often the figures are re-read.
 *
 * Slow on purpose. Everything behind them changes per frame, and a screenful of
 * text re-laid-out at 60 Hz would cost more than the view it is reporting on —
 * on a phone, enough to change the numbers it is showing. Twice a second is
 * still faster than anyone reads.
 */
const SAMPLE_INTERVAL_MS = 500;

/**
 * The debug overlay: the figures behind the picture, over the picture.
 *
 * One sheet at the bottom of the screen with a tab per section, because a phone
 * has room for one page at a time and the thumb is at the bottom of it. Which
 * sections exist is up to the caller — the scenes add their own sensors page —
 * so this knows nothing about what it is showing.
 *
 * `memo` matters here: the scene re-renders on every animation frame, and
 * without it this whole panel would be reconciled that often for text that
 * changes twice a second.
 */
export const DebugPanel: React.FC<Props> = React.memo(({ sourceRef, onClose }) => {
  const [sections, setSections] = useState<DebugSection[]>(() => sourceRef.current());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const handle = setInterval(() => setSections(sourceRef.current()), SAMPLE_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [sourceRef]);

  /** A re-read owed to a switch that was just pressed; see `flip` below. */
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleRef.current !== null) clearTimeout(settleRef.current);
    },
    []
  );

  /**
   * Flips a switch, then re-reads the pages once the view around the panel has
   * caught up.
   *
   * A switch's position belongs to the scene rather than to this panel, and the
   * scene's state has not moved yet when the press handler returns — so left to
   * the sampling timer, a switch would sit in its old position for up to half a
   * second after being pressed, which reads as a control that does nothing.
   */
  const flip = useCallback(
    (control: DebugSwitch) => {
      control.onToggle();
      if (settleRef.current !== null) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(() => setSections(sourceRef.current()), 0);
    },
    [sourceRef]
  );

  // Falling back to the first section rather than remembering an index keeps a
  // scene that adds or drops a page from landing on an empty one.
  const active = sections.find((section) => section.id === selected) ?? sections[0];

  return (
    <View style={styles.sheet}>
      <View style={styles.tabs}>
        {sections.map((section) => {
          const on = section.id === active?.id;
          return (
            <Pressable
              key={section.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setSelected(section.id)}
            >
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{section.title}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave console"
          style={styles.close}
          onPress={onClose}
        >
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
        {active?.switches?.map((control) => (
          <Pressable
            key={control.label}
            accessibilityRole="switch"
            accessibilityLabel={control.label}
            accessibilityState={{ checked: control.on }}
            style={styles.row}
            onPress={() => flip(control)}
          >
            <Text style={styles.switchLabel}>{control.label}</Text>
            <Toggle on={control.on} />
          </Pressable>
        ))}

        {active?.rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue} numberOfLines={row.wrap ? undefined : 1}>
              {row.value}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

DebugPanel.displayName = "DebugPanel";

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 8,
    right: 8,
    // Clear of the toggle, which stays put so leaving is where entering was.
    bottom: 58,
    // Enough for a dozen rows, and never so much that the sky is only the sheet.
    maxHeight: "45%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.panel,
    overflow: "hidden"
  },
  tabs: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: 1,
    borderBottomColor: theme.color.divider
  },
  tab: {
    flex: 1,
    // A thumb-sized target: the whole point is that this works on a phone.
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4
  },
  tabOn: {
    backgroundColor: theme.color.controlActive
  },
  tabLabel: {
    color: theme.color.textFaint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8
  },
  tabLabelOn: {
    color: theme.color.textBright
  },
  close: {
    width: 38,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: theme.color.divider
  },
  closeLabel: {
    color: theme.color.textDim,
    fontSize: 13,
    fontWeight: "700"
  },
  rows: {
    flexGrow: 0
  },
  rowsContent: {
    paddingVertical: 4
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3,
    paddingHorizontal: 10
  },
  rowLabel: {
    color: theme.color.textFaint,
    fontSize: 10,
    letterSpacing: 0.3
  },
  // Brighter than a figure's label: this one is a control, not a caption.
  switchLabel: {
    color: theme.color.text,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3
  },
  rowValue: {
    flexShrink: 1,
    color: theme.color.text,
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"]
  }
});

export default DebugPanel;
