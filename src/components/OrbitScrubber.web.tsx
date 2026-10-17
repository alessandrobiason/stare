import React from "react";
import type { OrbitScrubberProps } from "./OrbitScrubber";
import { theme } from "./theme";

/** Native browser range semantics include touch, arrows, Home/End and focus. */
export const OrbitScrubber: React.FC<OrbitScrubberProps> = ({ value, label, valueText, onChange }) => (
  <>
    <style>{`
      .orbit-scrubber { appearance: none; -webkit-appearance: none; width: 100%; height: 36px;
        margin: 0; background: transparent; cursor: pointer; outline: none; touch-action: pan-y; }
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
    />
  </>
);
