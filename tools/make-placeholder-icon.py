#!/usr/bin/env python3
"""
Draws assets/icon.png, the app icon, from scratch.

This exists because an App Store upload rejects a 1024x1024 icon that carries an
alpha channel (ITMS-90717), and the icon Expo falls back on when app.json names
none is RGBA. Rather than ship a blob with no provenance, the placeholder is
generated here as opaque RGB: an earth limb with its atmosphere, a few stars, and
two satellite tracks crossing above it.

It is a placeholder. Replace assets/icon.png with real artwork when there is
some -- just keep it 1024x1024 and free of alpha, which
tools/check-icon-opaque.mjs enforces on every build.

    python3 tools/make-placeholder-icon.py

No third-party imports on purpose: the devcontainer has neither Pillow nor
ImageMagick, so the PNG is assembled with zlib and struct.
"""

import math
import struct
import zlib

SIZE = 1024

# Earth sits mostly below the frame, so the limb reads as a curve rather than a
# ball. Centre is in pixel coordinates and well off the bottom edge.
EARTH_CX, EARTH_CY, EARTH_R = 512.0, 1560.0, 900.0

# Deterministic star field: a fixed seed keeps the icon byte-identical between
# runs, so regenerating it does not churn the diff.
STAR_SEED = 0x5EED


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def stars(count):
    """A small xorshift, so the field does not depend on Python's RNG version."""
    state = STAR_SEED
    out = []
    for _ in range(count):
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        x = (state % 100000) / 100000.0
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        y = (state % 100000) / 100000.0
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        mag = (state % 100000) / 100000.0
        px, py = x * SIZE, y * SIZE * 0.72
        # Nothing inside the planet, and nothing in the atmospheric haze.
        if math.hypot(px - EARTH_CX, py - EARTH_CY) < EARTH_R + 40:
            continue
        out.append((px, py, 0.9 + mag * 2.2, 0.35 + mag * 0.65))
    return out


def seg_distance(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / denom))
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t)), t


STARS = stars(220)

# Two passes crossing above the limb. Each is (x0, y0, x1, y1, half-width,
# colour, whether it carries a satellite dot at its end).
TRACKS = [
    (70.0, 470.0, 980.0, 190.0, 5.0, (150, 214, 255), True),
    (120.0, 130.0, 900.0, 560.0, 3.4, (255, 206, 138), False),
]


def render():
    rows = []
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            fx, fy = x + 0.5, y + 0.5

            # Night sky, a touch warmer toward the bottom where the limb glows.
            t = fy / SIZE
            r = lerp(6.0, 13.0, t)
            g = lerp(9.0, 20.0, t)
            b = lerp(20.0, 42.0, t)

            for sx, sy, radius, bright in STARS:
                d = math.hypot(fx - sx, fy - sy)
                if d < radius * 3.0:
                    a = math.exp(-(d / radius) ** 2) * bright
                    r += 225 * a
                    g += 232 * a
                    b += 255 * a

            for ax, ay, bx, by, width, (tr, tg, tb), dot in TRACKS:
                d, along = seg_distance(fx, fy, ax, ay, bx, by)
                if d < width * 5.0:
                    # Fade both ends so the track enters and leaves the frame.
                    taper = smoothstep(0.0, 0.18, along) * smoothstep(1.0, 0.72, along)
                    a = math.exp(-(d / width) ** 2) * taper
                    r += tr * a
                    g += tg * a
                    b += tb * a
                if dot:
                    hx, hy = lerp(ax, bx, 0.72), lerp(ay, by, 0.72)
                    dd = math.hypot(fx - hx, fy - hy)
                    if dd < 90.0:
                        a = math.exp(-(dd / 15.0) ** 2)
                        halo = math.exp(-(dd / 44.0) ** 2) * 0.32
                        r += 255 * a + 130 * halo
                        g += 255 * a + 190 * halo
                        b += 255 * a + 255 * halo

            d = math.hypot(fx - EARTH_CX, fy - EARTH_CY)

            # Atmosphere: a glow that peaks on the limb and falls off outward.
            glow = math.exp(-((d - EARTH_R) / 58.0) ** 2)
            if d < EARTH_R:
                glow = max(glow, math.exp(-((EARTH_R - d) / 26.0) ** 2))
            r += 60 * glow
            g += 150 * glow
            b += 235 * glow

            if d < EARTH_R:
                # Lit from the upper left, so the disc has some shape to it.
                inside = smoothstep(EARTH_R, EARTH_R - 3.0, d)
                nx = (fx - EARTH_CX) / EARTH_R
                ny = (fy - EARTH_CY) / EARTH_R
                lit = max(0.0, 0.62 - 0.75 * nx + 0.55 * ny)
                er = 8 + 46 * lit
                eg = 34 + 104 * lit
                eb = 66 + 150 * lit
                r = lerp(r, er, inside)
                g = lerp(g, eg, inside)
                b = lerp(b, eb, inside)

            row += bytes((
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
            ))
        rows.append(row)
    return rows


def write_png(path, rows):
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter type 0 (None) for every scanline
        raw += row

    def chunk(tag, payload):
        return (
            struct.pack(">I", len(payload))
            + tag
            + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF)
        )

    # Colour type 2 is truecolour RGB -- no alpha channel, which is the point.
    ihdr = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


if __name__ == "__main__":
    write_png("assets/icon.png", render())
    print("wrote assets/icon.png")
