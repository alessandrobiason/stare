import { useRef } from "react";

/**
 * Keeps a ref pointing at the newest value.
 *
 * Long-lived callbacks — `requestAnimationFrame` loops, interval timers,
 * subscriptions — must not be torn down and rebuilt whenever a prop changes.
 * Reading the current value through a ref lets those effects stay mounted while
 * still seeing fresh data, without the stale-closure bugs of capturing it.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
