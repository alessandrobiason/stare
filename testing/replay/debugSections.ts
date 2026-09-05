import { clockTime, degrees, position, vector } from "../../src/debug/format";
import { DebugRow, DebugSection } from "../../src/debug/sections";
import { RecordingSnapshot } from "./recordingDataset";

export type ReplaySensorDebugInput = {
  /** The staged recording being replayed. */
  label: string;
  snapshot: RecordingSnapshot | null;
  /** The absolute date the recording's t=0 is replayed as. */
  replayStart: Date;
};

/**
 * Every recorded stream at the current video time — the harness's answer to the
 * phone's live sensors page, and what the projection is checked against.
 *
 * The app's own pages (mask, sky, view) are unchanged underneath this one: the
 * scene supplies its first page and the overlay adds the rest, so this is the
 * only place the two differ.
 */
export function replaySensorSection({
  label,
  snapshot,
  replayStart
}: ReplaySensorDebugInput): DebugSection {
  const rows: DebugRow[] = [{ label: "Recording", value: label }];

  if (!snapshot) {
    rows.push({ label: "State", value: "Waiting for the sensor timeline…" });
    return { id: "sensors", title: "SENSORS", rows };
  }

  const { observer, orientation, arkit, gyro, accelerometer, magnetometer, barometer } = snapshot;
  rows.push(
    { label: "Time", value: `${snapshot.elapsedSeconds.toFixed(3)} s` },
    { label: "Frame", value: `${snapshot.frameNumber}` },
    {
      label: "Orbit time",
      value: clockTime(new Date(replayStart.getTime() + snapshot.elapsedSeconds * 1000))
    },
    { label: "GPS", value: position(observer) },
    { label: "Height", value: `${observer.heightM.toFixed(0)} m` },
    { label: "Heading", value: degrees(orientation.heading) },
    { label: "Yaw", value: degrees(orientation.yaw) },
    { label: "Pitch", value: degrees(orientation.pitch) },
    { label: "Roll", value: degrees(orientation.roll) },
    { label: "North offset", value: degrees(orientation.northOffset) },
    { label: "ARKit p", value: vector(arkit, 2, "m") },
    { label: "Gyro", value: vector(gyro, 2, "rad/s") },
    { label: "Accel", value: vector(accelerometer, 2, "m/s²") },
    { label: "Mag", value: vector(magnetometer, 1, "raw") },
    {
      label: "Baro",
      value: `${barometer.pressureKpa.toFixed(3)} kPa · Δ${barometer.relativeAltitudeM.toFixed(2)} m`
    }
  );

  return { id: "sensors", title: "SENSORS", rows };
}
