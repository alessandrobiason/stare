import React, { useEffect, useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import { clamp } from "../math/angles";
import { theme } from "./theme";

export type OrbitScrubberProps = {
  value: number;
  label: string;
  valueText: string;
  onChange: (value: number) => void;
  /** Suspend the enclosing card's scroll until release, cancellation or unmount. */
  onScrubbingChange?: (scrubbing: boolean) => void;
};

/** A thin rail with a full-height touch target, inside the card's ScrollView. */
export const OrbitScrubber: React.FC<OrbitScrubberProps> = ({ value, label, valueText, onChange, onScrubbingChange }) => {
  const width = useRef(0);
  const startX = useRef(0);
  const active = useRef(false);
  const current = useRef({ value, onChange, onScrubbingChange });
  current.current = { value, onChange, onScrubbingChange };
  const responder = useMemo(() => {
    const seekAt = (x: number) => {
      if (width.current > 0) current.current.onChange(clamp(x / width.current, 0, 1));
    };
    const finish = () => {
      if (!active.current) return;
      active.current = false;
      current.current.onScrubbingChange?.(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        active.current = true;
        current.current.onScrubbingChange?.(true);
        startX.current = event.nativeEvent.locationX;
        seekAt(startX.current);
      },
      onPanResponderMove: (_, gesture) => {
        if (active.current) seekAt(startX.current + gesture.dx);
      },
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true
    });
  }, []);
  useEffect(() => () => {
    if (active.current) current.current.onScrubbingChange?.(false);
    active.current = false;
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
