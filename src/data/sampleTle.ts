import { Tle } from "../types";

// Stable fixture used by propagation tests. The catalogue number is
// deliberately one no real object holds: borrowing a live number (it used to
// carry the ISS's) made the fixture classify as something its own `category`
// field denied.
export const SAMPLE_TLE: Tle = {
  name: "FAST LEO DEMO",
  line1: "1 99999U 98067A   26235.00000000  .00001264  00000-0  29621-4 0  9995",
  line2: "2 99999  51.6423  21.9893 0007418  85.1996  31.0287 16.20000000210039",
  category: "OTHER",
  parked: false
};
