import React from "react";
import { View } from "react-native";
import { toggleStyles } from "./theme";

/**
 * Read-only switch: a capsule with the knob at one end or the other. The
 * surrounding Pressable owns the interaction.
 *
 * No words in it. A switch says what it is by where its knob is, and this one
 * sits over a camera picture in a list of rows that are already labelled —
 * ON and OFF were a second label for the same fact, set at eight points.
 */
export const Toggle: React.FC<{ on: boolean }> = ({ on }) => (
  <View
    accessibilityRole="checkbox"
    accessibilityState={{ checked: on }}
    // And the `aria-` form beside it, which is what actually reaches the DOM
    // under react-native-web — the only place the state was ever readable
    // before was the words ON and OFF this no longer carries.
    aria-checked={on}
    style={[toggleStyles.toggle, on && toggleStyles.toggleOn]}
  >
    <View style={[toggleStyles.knob, on && toggleStyles.knobOn]} />
  </View>
);
