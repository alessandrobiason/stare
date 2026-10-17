/** Isolated real satellite card: no camera, recording or segmentation model needed. */
import React from "react";
import { registerRootComponent } from "expo";
import { View } from "react-native";
import { SatelliteCard } from "../../src/components/SatelliteCard";
import { SAMPLE_TLE } from "../../src/data/sampleTle";
import { setLocaleForTesting } from "../../src/i18n";
import { SatelliteCatalog } from "../../src/satellite/catalog";
import { groundTrackFor } from "../../src/satellite/groundTrack";
import { SatelliteDetail } from "../../src/types";

setLocaleForTesting("en");
const detail: SatelliteDetail = {
  name: "STARLINK-1234", noradId: 44714, category: "INTERNET", subcategory: "STARLINK",
  parked: false, launchYear: 2019, rangeKm: 1240, altitudeKm: 548, speedKmPerSecond: 7.58,
  azimuthDeg: 143, elevationDeg: 27, orbitPeriodMinutes: 96, sunlit: "sunlit",
  apparentMagnitude: 4.6, magnitudeMeasured: false, nakedEye: "binoculars", sunAltitudeDeg: -20
};
const plan = {
  track: groundTrackFor(new SatelliteCatalog([SAMPLE_TLE]).entries[0], Date.UTC(2026, 7, 23, 12)),
  observer: { latitudeDeg: 45.46, longitudeDeg: 9.19, heightM: 120 }
};

function Fixture() {
  return (
    <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#07101f", padding: 12 }}>
      <SatelliteCard names={[detail.name]} selected={detail.name} onSelect={() => undefined}
        onClose={() => undefined} describeRef={{ current: () => detail }} groundTrack={plan} />
    </View>
  );
}

registerRootComponent(Fixture);
