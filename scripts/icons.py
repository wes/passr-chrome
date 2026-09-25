"""Render the passr key icon as PNGs (no dependencies). Run from the repo root."""
import math
import struct
import zlib

BLUE = (59, 108, 246)
SS = 4  # supersampling factor per axis


def covered(x, y, pad):
    """Shape test in a 128-unit design space. Returns 0 (none), 1 (blue tile), 2 (white key)."""
    inner = 128 - 2 * pad
    ux, uy = (x - pad) * 128 / inner, (y - pad) * 128 / inner
    if not (0 <= ux < 128 and 0 <= uy < 128):
        return 0
    r = 26
    dx = max(r - ux, 0, ux - (128 - r))
    dy = max(r - uy, 0, uy - (128 - r))
    if dx * dx + dy * dy > r * r:
        return 0
    d = math.hypot(ux - 44, uy - 64)
    key = (14 <= d <= 24 or (62 <= ux <= 104 and 58 <= uy <= 70)
           or (86 <= ux <= 94 and 70 < uy <= 84) or (98 <= ux <= 104 and 70 < uy <= 80))
    return 2 if key else 1


def render(size, pad=0):
    rows = []
    for py in range(size):
        row = bytearray(b"\x00")
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    c = covered((px + (sx + .5) / SS) * 128 / size, (py + (sy + .5) / SS) * 128 / size, pad)
                    if c:
                        rgb = (255, 255, 255) if c == 2 else BLUE
                        for i in range(3):
                            acc[i] += rgb[i]
                        acc[3] += 1
            n = acc[3]
            row += bytes([acc[0] // n, acc[1] // n, acc[2] // n, 255 * n // (SS * SS)] if n else [0, 0, 0, 0])
        rows.append(bytes(row))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    for s in (16, 32, 48, 128):
        open(f"extension/icons/icon{s}.png", "wb").write(render(s))
    # Web Store icon: 96px artwork centered in 128px with transparent padding.
    open("store/icon128.png", "wb").write(render(128, pad=16))
