"""Draw the Catflix app icon (a cat-eared play mark) as a 1024px PNG."""

import math
import struct
import zlib

SIZE = 1024
TOP = (210, 34, 62)
BOTTOM = (10, 11, 16)
INK = (255, 255, 255)
CAT = (255, 214, 128)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def inside(poly, px, py):
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > py) != (y2 > py):
            if x1 + (py - y1) * (x2 - x1) / (y2 - y1) > px:
                hit = not hit
    return hit


def edge_distance(poly, px, py):
    best = 1e9
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        dx, dy = x2 - x1, y2 - y1
        span = dx * dx + dy * dy
        t = 0.0 if span == 0 else max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / span))
        best = min(best, math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)))
    return best


def tile_alpha(x, y, radius=220):
    lo, hi = 2, SIZE - 2
    if not (lo - 2 <= x <= hi + 2 and lo - 2 <= y <= hi + 2):
        return 0.0
    cx = min(max(x, lo + radius), hi - radius)
    cy = min(max(y, lo + radius), hi - radius)
    return max(0.0, min(1.0, 0.5 - (math.hypot(x - cx, y - cy) - radius)))


def cat_head(cx, cy, s):
    """Skull with two upright ears."""
    top = cy - s * 0.52
    pts = [
        (cx - s * 0.86, top + s * 0.06),
        (cx - s * 0.60, top - s * 0.62),
        (cx - s * 0.26, top - s * 0.10),
    ]
    for i in range(1, 25):
        angle = math.pi + math.pi * i / 25
        pts.append((cx + s * 0.70 * math.cos(angle), top + s * 0.52 - s * 0.52 * math.sin(angle)))
    pts += [(cx + s * 0.26, top - s * 0.10), (cx + s * 0.60, top - s * 0.62), (cx + s * 0.86, top + s * 0.06)]
    return pts


def build():
    play = [(SIZE * 0.560, SIZE * 0.700), (SIZE * 0.560, SIZE * 0.860), (SIZE * 0.715, SIZE * 0.780)]
    head = cat_head(SIZE * 0.5, SIZE * 0.330, SIZE * 0.150)
    rows = []
    for y in range(SIZE):
        row = bytearray()
        base = lerp(TOP, BOTTOM, y / (SIZE - 1))
        for x in range(SIZE):
            px, py = x + 0.5, y + 0.5
            colour = base
            in_head = inside(head, px, py)
            head_edge = edge_distance(head, px, py)
            if in_head:
                colour = CAT
            elif head_edge < 3:
                colour = blend(colour, CAT, 1 - head_edge / 3)
            play_edge = edge_distance(play, px, py)
            if inside(play, px, py) and not in_head:
                colour = INK
            elif play_edge < 3 and not in_head:
                colour = blend(colour, INK, 1 - play_edge / 3)
            alpha = tile_alpha(px, py)
            row += bytes(
                (
                    round(colour[0] * alpha + 12 * (1 - alpha)),
                    round(colour[1] * alpha + 13 * (1 - alpha)),
                    round(colour[2] * alpha + 18 * (1 - alpha)),
                    round(255 * alpha),
                )
            )
        rows.append(row)
    return rows


def write(path, rows):
    raw = b"".join(b"\x00" + bytes(r) for r in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    head = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    write("app-icon.png", build())
    print("wrote app-icon.png")
