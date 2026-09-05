import React from "react";
import { Text, View } from "react-native";
import { toggleStyles } from "./theme";

/** Read-only ON/OFF pill. The surrounding Pressable owns the interaction. */
export const Toggle: React.FC<{ on: boolean }> = ({ on }) => (
  <View
    accessibilityRole="checkbox"
    accessibilityState={{ checked: on }}
    style={[toggleStyles.toggle, on && toggleStyles.toggleOn]}
  >
    <Text style={toggleStyles.label}>{on ? "ON" : "OFF"}</Text>
  </View>
);
