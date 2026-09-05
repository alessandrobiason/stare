import { ObserverLocation } from "../types";

/**
 * How the debug overlay writes a figure.
 *
 * Shared with the replay harness's own page (`testing/replay/debugSections.ts`),
 * so the recorded streams read exactly like the live ones they stand in for and
 * a difference between the two pages is a difference in the numbers.
 */

/** Shown where there is no reading at all. */
export const NONE = "—";

/** Rounded for reading, and never as a negative zero, which reads as a bug. */
export const fixed = (value: number, digits: number): string =>
  (Number(value.toFixed(digits)) + 0).toFixed(digits);

export const degrees = (value: number, digits = 1): string => `${fixed(value, digits)}°`;

export const vector = (
  { x, y, z }: { x: number; y: number; z: number },
  digits: number,
  unit?: string
): string =>
  `${fixed(x, digits)}, ${fixed(y, digits)}, ${fixed(z, digits)}${unit ? ` ${unit}` : ""}`;

export const position = (observer: ObserverLocation): string =>
  `${observer.latitudeDeg.toFixed(5)}, ${observer.longitudeDeg.toFixed(5)}`;

/** Time of day, which is what a readout is compared against; the date never moves. */
export const clockTime = (when: Date): string => `${when.toISOString().slice(11, 23)}Z`;

/** A byte count as a human size, switching units so the figure stays readable. */
export const bytes = (value: number): string => {
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${fixed(kb, 1)} KB`;
  return `${fixed(kb / 1024, 2)} MB`;
};

/** A duration as its two largest units, for a figure nobody has to do math on. */
export const duration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${totalMinutes % 60}m`;
};
