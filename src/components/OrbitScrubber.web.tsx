import React, { useCallback, useEffect, useRef } from "react";
import { clamp } from "../math/angles";
import type { OrbitScrubberProps } from "./OrbitScrubber";
import { theme } from "./theme";

/** Keep range keyboard semantics, but own pointer drags even outside the rail. */
export const OrbitScrubber: React.FC<OrbitScrubberProps> = ({ value, label, valueText, onChange, onScrubbingChange }) => {
  const pointer = useRef<number | null>(null);
  const bounds = useRef({ left: 0, width: 0 });
  const current = useRef({ onChange, onScrubbingChange });
  current.current = { onChange, onScrubbingChange };
  const finish = useCallback(() => {
    if (pointer.current === null) return;
    pointer.current = null;
    current.current.onScrubbingChange?.(false);
  }, []);
  useEffect(() => {
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("blur", finish);
      finish();
    };
  }, [finish]);
  const seekAt = (clientX: number) => {
    if (bounds.current.width > 0) current.current.onChange(clamp((clientX - bounds.current.left) / bounds.current.width, 0, 1));
  };
  return (
  <>
    <style>{`
      .orbit-scrubber { appearance: none; -webkit-appearance: none; width: 100%; height: 36px;
        margin: 0; background: transparent; cursor: pointer; outline: none; touch-action: none; user-select: none; }
      .orbit-scrubber::-webkit-slider-runnable-track { height: 2px; border-radius: 1px;
        background: linear-gradient(to right, ${theme.color.textDim} var(--orbit-progress),
          ${theme.color.dividerStrong} var(--orbit-progress)); }
      .orbit-scrubber::-webkit-slider-thumb { appearance: none; -webkit-appearance: none;
        width: 8px; height: 8px; margin-top: -3px; border-radius: 50%;
        background: ${theme.color.text}; border: 1px solid ${theme.color.textDim}; }
      .orbit-scrubber::-moz-range-track { height: 2px; background: ${theme.color.dividerStrong}; }
      .orbit-scrubber::-moz-range-progress { height: 2px; background: ${theme.color.textDim}; }
      .orbit-scrubber::-moz-range-thumb { width: 6px; height: 6px; border-radius: 50%;
        background: ${theme.color.text}; border: 1px solid ${theme.color.textDim}; }
      .orbit-scrubber:focus-visible { outline: 1px solid ${theme.color.accentBorder};
        outline-offset: 2px; border-radius: 6px; }
    `}</style>
    <input
      className="orbit-scrubber"
      type="range"
      min={0}
      max={1440}
      step={1}
      value={Math.round(value * 1440)}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ "--orbit-progress": `${value * 100}%` } as React.CSSProperties}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber / 1440)}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || pointer.current !== null) return;
        event.preventDefault();
        const input = event.currentTarget;
        bounds.current = input.getBoundingClientRect();
        input.focus({ preventScroll: true });
        input.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        current.current.onScrubbingChange?.(true);
        seekAt(event.clientX);
      }}
      onPointerMove={(event) => {
        if (pointer.current === event.pointerId) seekAt(event.clientX);
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        seekAt(event.clientX);
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => { if (pointer.current === event.pointerId) finish(); }}
      onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) finish(); }}
      onBlur={finish}
    />
  </>
  );
};
