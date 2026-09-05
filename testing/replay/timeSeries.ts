/**
 * Lookups over CSV-derived sensor streams.
 *
 * Every stream is an array of rows sorted by time, with the timestamp in
 * column 0 and the sensor channels after it. All lookups are binary searches,
 * because the streams run to tens of thousands of rows and are sampled once per
 * displayed video frame.
 */

export type Sample = number[];
export type TimeSeries = Sample[];

/** Index of the sample whose timestamp is closest to `time`. */
export function nearestIndex(series: TimeSeries, time: number): number {
  let low = 0;
  let high = series.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (series[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  if (low === 0) return low;
  return Math.abs(series[low][0] - time) < Math.abs(series[low - 1][0] - time) ? low : low - 1;
}

/** Sample nearest `time`. Use for discrete values such as a frame number. */
export function sampleNearest(series: TimeSeries, time: number): Sample {
  return series[nearestIndex(series, time)];
}

/**
 * Sample linearly interpolated at `time`, clamped to the stream's range.
 *
 * Continuous channels must be interpolated rather than snapped: nearest-sample
 * lookups make the AR projection visibly step at the sensor rate even while the
 * video itself renders smoothly.
 */
export function sampleInterpolated(series: TimeSeries, time: number): Sample {
  const first = series[0];
  const last = series[series.length - 1];
  if (time <= first[0]) return first;
  if (time >= last[0]) return last;

  let low = 0;
  let high = series.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (series[middle][0] <= time) low = middle;
    else high = middle;
  }

  const before = series[low];
  const after = series[high];
  const span = after[0] - before[0];
  // Duplicate timestamps would divide by zero; fall back to the earlier sample.
  const progress = span > 0 ? (time - before[0]) / span : 0;

  return before.map((value, index) => (index === 0 ? time : value + (after[index] - value) * progress));
}
