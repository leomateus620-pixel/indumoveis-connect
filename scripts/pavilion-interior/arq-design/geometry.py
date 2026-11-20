"""Room-sized mesh batches with deterministic UVs in the material library."""

import math
import random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

rng = random.Random(81)


class Room:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []
        self.uv = []

    def face(self, points, surface, uv=None):
        if len(points) < 3:
            return
        if surface == "diffuser":
            light_batch.face(points, "paper", uv)
            return
        start = len(self.verts)
        self.verts.extend([(x, -y, z) for x, y, z in points])
        self.faces.append(tuple(reversed(range(start, start + len(points)))))
        if uv is None:
            normal = (Vector(points[1]) - Vector(points[0])).cross(
                Vector(points[2]) - Vector(points[0])
            )
            axes = sorted(range(3), key=lambda i: abs(normal[i]))[:2]
            axes.sort()
            lo = [min(p[i] for p in points) for i in axes]
            span = [max(0.001, max(p[i] for p in points) - l) for i, l in zip(axes, lo)]
            uv = [
                tuple((p[i] - l) / s for i, l, s in zip(axes, lo, span)) for p in points
            ]
        k = index[surface]
        self.uv.extend(
            [
                ((k % 8 + 0.025 + 0.95 * u) / 8, (k // 8 + 0.025 + 0.95 * v) / 4)
                for u, v in reversed(uv)
            ]
        )

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.verts, [], self.faces)
        mesh.materials.append(mat)
        layer = mesh.uv_layers.new(name="Material_Atlas")
        layer.data.foreach_set("uv", [v for pair in self.uv for v in pair])
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(obj)
        return obj


def rounded_points(x, y, w, d, r, ang=0, steps=3):
    r = min(r, w * 0.48, d * 0.48)
    outline = []
    for cx, cy, a in [
        (w * 0.5 - r, d * 0.5 - r, 0),
        (-w * 0.5 + r, d * 0.5 - r, 90),
        (-w * 0.5 + r, -d * 0.5 + r, 180),
        (w * 0.5 - r, -d * 0.5 + r, 270),
    ]:
        for i in range(steps + 1):
            t = math.radians(a + 90 * i / steps)
            outline.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    co, si = math.cos(ang), math.sin(ang)
    return [(x + u * co - v * si, y + u * si + v * co) for u, v in outline]


def loft(rings, surface, top=None):
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            room.face([a[i], a[j], b[j], b[i]], surface)
    room.face(rings[-1], top or surface)


def block(x, y, z, w, d, h, surface, r=0.4, ang=0, bevel=0):
    bevel = min(bevel, h * 0.4, min(w, d) * 0.15)
    ring = (
        [(0, z), (0, z + h)]
        if bevel < 0.05
        else [(bevel * 0.65, z), (0, z + bevel), (0, z + h - bevel), (bevel, z + h)]
    )
    loft(
        [
            [
                (a, b, zz)
                for a, b in rounded_points(
                    x,
                    y,
                    w - 2 * k,
                    d - 2 * k,
                    max(0.04, r - k),
                    ang,
                    3 if r > 0.55 else 1,
                )
            ]
            for k, zz in ring
        ],
        surface,
    )


def circle(x, y, z, rx, ry, h, surface, top_ratio=1, n=18):
    rings = []
    for ratio, zz in [(1, z), (top_ratio, z + h)]:
        rings.append(
            [
                (
                    x + ratio * rx * math.cos(i * 2 * math.pi / n),
                    y + ratio * ry * math.sin(i * 2 * math.pi / n),
                    zz,
                )
                for i in range(n)
            ]
        )
    loft(rings, surface)


def rod(a, b, r, surface, n=7):
    a, b = Vector(a), Vector(b)
    delta = b - a
    if delta.length < 0.01:
        return
    tangent = delta.normalized()
    helper = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
    right = tangent.cross(helper).normalized()
    up = tangent.cross(right).normalized()
    loft(
        [
            [
                tuple(
                    p
                    + r
                    * (
                        math.cos(i * 2 * math.pi / n) * right
                        + math.sin(i * 2 * math.pi / n) * up
                    )
                )
                for i in range(n)
            ]
            for p in (a, b)
        ],
        surface,
    )


def pylon(x, y, z, r, heights, surface):
    rings = [
        [
            (
                x + r * factor * math.cos(i * math.pi / 10),
                y + r * factor * math.sin(i * math.pi / 10),
                z + h,
            )
            for i in range(20)
        ]
        for h, factor in heights
    ]
    loft(rings, surface)


def cuts(points, axis, value, keep_lower):
    out = []
    for i, a in enumerate(points):
        b = points[(i + 1) % len(points)]
        good = (a[axis] <= value) if keep_lower else (a[axis] >= value)
        other = (b[axis] <= value) if keep_lower else (b[axis] >= value)
        if good:
            out.append(a)
        if good != other:
            t = (value - a[axis]) / (b[axis] - a[axis])
            out.append(tuple(a[j] + t * (b[j] - a[j]) for j in range(2)))
    return out


def floor(points, surface):
    # Clip the material grid against the actual, sometimes concave footprint.
    vectors = [Vector((x, y, 0)) for x, y in points]
    tri = tessellate_polygon([vectors])
    size = (27, 6.4) if surface in ("oak", "walnut", "maple") else (20, 20)
    for t in tri:
        poly = [points[i] for i in t]
        if (poly[1][0] - poly[0][0]) * (poly[2][1] - poly[0][1]) < (
            poly[1][1] - poly[0][1]
        ) * (poly[2][0] - poly[0][0]):
            poly.reverse()
        lo, hi = [min(p[1] for p in poly), max(p[1] for p in poly)]
        for row in range(math.floor(lo / size[1]), math.ceil(hi / size[1])):
            y = row * size[1]
            clipped = cuts(cuts(poly, 1, y, False), 1, y + size[1], True)
            if len(clipped) < 3:
                continue
            off = (row % 3) * size[0] * 0.28 if size[0] != size[1] else 0
            for col in range(
                math.floor((min(p[0] for p in clipped) - off) / size[0]),
                math.ceil((max(p[0] for p in clipped) - off) / size[0]),
            ):
                x = col * size[0] + off
                cell = cuts(cuts(clipped, 0, x, False), 0, x + size[0], True)
                if len(cell) >= 3:
                    room.face(
                        [(a, b, 0) for a, b in cell],
                        surface,
                        [((a - x) / size[0], (b - y) / size[1]) for a, b in cell],
                    )


def upholstery(x, y, z, w, d, h, col, ang=0):
    block(x, y, z, w, d, h, col, min(w, d) * 0.17, ang, min(h * 0.26, 1.15))


def plant(x, y, size=1, col="clay", z=0):
    s = size
    pylon(
        x,
        y,
        z,
        2.9 * s,
        [(0, 0.72), (0.4 * s, 0.77), (4.5 * s, 1), (4.9 * s, 1.02)],
        col,
    )
    circle(x, y, z + 4.9 * s, 2.65 * s, 2.65 * s, 0.06, "walnut")
    for k in range(11):
        a = k * 2.399 + rng.random() * 0.32
        reach = (3.6 + rng.random() * 2.2) * s
        level = (7.5 + rng.random() * 4) * s
        dx, dy = math.cos(a), math.sin(a)
        o = (x + 0.35 * s * dx, y + 0.35 * s * dy, z + 4.95 * s)
        mid = (x + reach * dx * 0.55, y + reach * dy * 0.55, z + level)
        tip = (x + reach * dx, y + reach * dy, z + level - s * 0.75)
        width = s * (0.65 + rng.random() * 0.6)
        l = (mid[0] + dy * width, mid[1] - dx * width, mid[2] - 0.35 * s)
        r = (mid[0] - dy * width, mid[1] + dx * width, mid[2] - 0.35 * s)
        for v in ((o, l, mid), (l, tip, mid), (tip, r, mid), (r, o, mid)):
            room.face(list(reversed(v)), "foliage" if k % 3 else "leaflight")


def chair(x, y, ang=0, col="boucle", lounge=False):
    w, d = (11.9, 12.1) if lounge else (7.3, 7.8)
    co, si = math.cos(ang), math.sin(ang)

    def P(u, v, z):
        return (x + u * co - v * si, y + u * si + v * co, z)

    for u in (-1, 1):
        for v in (-1, 1):
            rod(
                P(u * w * 0.39, v * d * 0.37, 0),
                P(u * w * 0.32, v * d * 0.31, 5),
                0.49,
                "walnut",
            )
    upholstery(x, y, 4.5, w, d, 2.3, col, ang)
    # An open back and side arms show the bentwood structure from above.
    arc = [
        P(
            w * 0.51 * math.cos(i * math.pi / 10),
            d * 0.51 * math.sin(i * math.pi / 10),
            8.4 + 1.3 * math.sin(i * math.pi / 10),
        )
        for i in range(11)
    ]
    for a, b in zip(arc, arc[1:]):
        rod(a, b, 0.69, "walnut")
    for u in (-1, 1):
        rod(
            P(u * w * 0.40, d * 0.25, 4.5),
            P(u * w * 0.40, d * 0.27, 8.7),
            0.52,
            "walnut",
        )
    px, py, _ = P(0, d * 0.38, 0)
    upholstery(px, py, 6.7, w * 0.77, 2.6, 4.0, col, ang)


def sofa(x, y, w, col="linen", ang=0):
    co, si = math.cos(ang), math.sin(ang)

    def P(u, v):
        return (x + u * co - v * si, y + u * si + v * co)

    block(x, y, 0.8, w - 2, 10.8, 3.1, "walnut", 1, ang)
    upholstery(x, y, 3.4, w, 14.1, 3.6, col, ang)
    count = max(2, round(w / 11))
    for i in range(count):
        a, b = P((i + 0.5 - count / 2) * (w - 3) / count, -0.2)
        upholstery(a, b, 6.2, (w - 3) / count - 0.38, 10.0, 2.0, col, ang)
    a, b = P(0, 5.45)
    upholstery(a, b, 5.5, w - 1, 3.1, 6.1, col, ang)
    for side in (-1, 1):
        a, b = P(side * (w * 0.5 - 1.15), -0.5)
        upholstery(a, b, 5.3, 2.6, 11.8, 4.2, col, ang)
    a, b = P(w * 0.27, 2)
    upholstery(
        a, b, 8.2, 4.9, 4.0, 1.4, "rust" if col != "rust" else "linen", ang + 0.18
    )


def book(x, y, z, ang=0, col="oxblood", s=1):
    block(x, y, z, 3.3 * s, 4.5 * s, 0.45 * s, col, 0.12, ang)
    block(x, y, z + 0.45 * s, 3.1 * s, 4.3 * s, 0.22 * s, "paper", 0.1, ang)


def table(x, y, w, d, h=8, rounded=False, top="marble", base="walnut"):
    if rounded:
        pylon(x, y, 0, min(w, d) * 0.18, [(0, 1), (0.6, 1.2), (h - 1, 0.72)], base)
        circle(x, y, h - 1, w * 0.5, d * 0.5, 1, top)
    else:
        for i in (-1, 1):
            block(x + i * w * 0.3, y, 0, 1.8, d * 0.69, h - 1, base, 0.35)
        block(x, y, h - 1, w, d, 1.15, top, 1.2)


def rug(x, y, w, d, mat="rug", ang=0):
    block(x, y, 0.07, w, d, 0.27, mat, min(w, d) * 0.09, ang)


def vase(x, y, z, s=1, col="ceramic"):
    pylon(
        x,
        y,
        z,
        s * 1.8,
        [(0, 0.65), (0.7 * s, 0.94), (2 * s, 1), (3.3 * s, 0.60), (4 * s, 0.52)],
        col,
    )
    circle(x, y, z + 4 * s, 0.71 * s, 0.71 * s, 0.05, "walnut")


def gallery_lamp(x, y):
    circle(x, y, 0, 2.6, 2.6, 0.4, "iron")
    rod((x, y, 0.3), (x, y, 16), 0.26, "brass")
    pylon(x, y, 12, 3.6, [(0, 1), (1, 0.98), (3, 0.48), (3.8, 0.10)], "mustard")


def reading(x, y, w=33, col="linen", accent="moss", side=1):
    rug(x, y, w + 16, 31, "tealrug" if accent == "rust" else "rug")
    sofa(x, y + 10, w, col)
    chair(x + side * (w * 0.45 + 4), y - 7, 2.65 * side, accent, True)
    table(x - 2, y - 4, 16, 11, 4.7, True)
    book(x - 5, y - 4, 4.8, 0.24)
    vase(x + 1, y - 4, 4.8, 0.58, "clay")
    gallery_lamp(x - side * (w * 0.5 + 4), y + 12)


def dining(x, y, w=30, col="moss", roundtop=False):
    d = 17 if not roundtop else 23
    table(x, y, w, d, 10, roundtop, "walnut" if not roundtop else "marble")
    for dx in (-w * 0.25, w * 0.25):
        chair(x + dx, y - d * 0.5 - 4, math.pi, col)
        chair(x + dx, y + d * 0.5 + 4, 0, col)
    vase(x + 2, y, 10, 0.77, "clay")


def cabinet(x, y, w, d=7, h=9, col="oak"):
    block(x, y, 0.6, w, d, h, col, 0.4)
    block(x, y, h + 0.6, w + 0.9, d + 0.9, 0.75, "travertine", 0.5)
    for i in range(1, max(2, round(w / 8))):
        xx = x - w / 2 + i * w / max(2, round(w / 8))
        block(xx, y + d / 2, h * 0.48, 0.2, 0.22, h * 0.80, "walnut", 0.05)
    vase(x - w * 0.30, y, h + 1.35, 0.83, "ceramic")
    book(x + w * 0.18, y, h + 1.35, -0.12)


def bed(x, y, w=27):
    rug(x, y + 2, w + 14, 42, "tealrug")
    block(x, y, 0.5, w + 2, 33, 4, "walnut", 1.2)
    upholstery(x, y, 4.4, w, 32, 3.7, "linen")
    block(x, y - 17, 0.5, w + 6, 2.2, 14, "rattan", 1)
    for side in (-1, 1):
        upholstery(x + side * w * 0.24, y - 10.1, 8.1, w * 0.42, 7, 1.7, "boucle")
        table(x + side * (w * 0.5 + 5), y - 12, 7, 7, 6, True, top="oak")
        vase(x + side * (w * 0.5 + 5), y - 12, 6, 0.53)
    upholstery(x, y + 6.5, 8.1, w + 0.5, 15, 1.0, "moss")
    block(x, y + 12.3, 9.12, w + 0.6, 3.2, 0.34, "pattern", 0.42)


def display(x, y):
    circle(x, y, 0, 7, 7, 3, "travertine")
    pylon(x, y, 3, 3.9, [(0, 0.62), (1, 0.95), (3, 1), (6, 0.62), (7.9, 0.43)], "rust")
    pylon(x + 0.3, y, 10.9, 2.6, [(0, 0.6), (2, 0.92), (4, 0.60), (5, 0.22)], "mustard")
