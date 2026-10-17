import React, { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { clamp } from "../math/angles";
import { theme } from "./theme";

export type OrbitScrubberProps = {
  value: number;
  label: string;
  valueText: string;
  onChange: (value: number) => void;
};

/** A thin rail with a full-height touch target, inside the card's ScrollView. */
export const OrbitScrubber: React.FC<OrbitScrubberProps> = ({ value, label, valueText, onChange }) => {
  const width = useRef(0);
  const startX = useRef(0);
  const current = useRef({ value, onChange });
  current.current = { value, onChange };
  const responder = useMemo(() => {
    const seekAt = (x: number) => {
      if (width.current > 0) current.current.onChange(clamp(x / width.current, 0, 1));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: (event) => {
        startX.current = event.nativeEvent.locationX;
        seekAt(startX.current);
      },
      onPanResponderMove: (_, gesture) => seekAt(startX.current + gesture.dx),
      onPanResponderTerminationRequest: () => true
    });
  }, []);

  return (
    <View
      {...responder.panHandlers}
      style={styles.touch}
      onLayout={({ nativeEvent }) => { width.current = nativeEvent.layout.width; }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 1440, now: Math.round(value * 1440), text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={({ nativeEvent }) => {
        const direction = nativeEvent.actionName === "increment" ? 1
          : nativeEvent.actionName === "decrement" ? -1 : 0;
        if (direction) current.current.onChange(clamp(current.current.value + direction / 96, 0, 1));
      }}
    >
      <View pointerEvents="none" style={styles.rail}>
        <View style={[styles.fill, { width: `${value * 100}%` }]} />
        <View style={[styles.thumb, { left: `${value * 100}%` }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  touch: { height: 36, justifyContent: "center" },
  rail: { height: 2, borderRadius: 1, backgroundColor: theme.color.dividerStrong },
  fill: { height: 2, borderRadius: 1, backgroundColor: theme.color.textDim },
  thumb: {
    position: "absolute", top: -3, width: 8, height: 8, marginLeft: -4,
    borderRadius: 4, backgroundColor: theme.color.text, borderWidth: 1,
    borderColor: theme.color.textDim
  }
});
