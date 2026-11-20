"""Custom architectural joinery, landscapes and structural systems for the exhibition."""


def polar_arc(x, y, rx, ry, start, end, steps=28, rotation=0):
    co, si = math.cos(rotation), math.sin(rotation)
    line = []
    for step in range(steps + 1):
        t = math.radians(start + (end - start) * step / steps)
        u, v = rx * math.cos(t), ry * math.sin(t)
        line.append((x + u * co - v * si, y + u * si + v * co))
    return line


def ribbon(line, depth, base, height, face, cap=None):
    """Extrude a constant-thickness curved joinery section around its spine."""
    edges = []
    for i, (x, y) in enumerate(line):
        u, v = line[max(0, i - 1)]
        a, b = line[min(i + 1, len(line) - 1)]
        length = max(0.01, math.hypot(a - u, b - v))
        nx, ny = -(b - v) / length * depth / 2, (a - u) / length * depth / 2
        edges.append(((x - nx, y - ny), (x + nx, y + ny)))
    for i in range(len(edges) - 1):
        left, right = edges[i]
        next_left, next_right = edges[i + 1]
        for first, second in ((left, next_left), (next_right, right)):
            room.face(
                [
                    (*first, base),
                    (*second, base),
                    (*second, base + height),
                    (*first, base + height),
                ],
                face,
            )
        room.face(
            [
                (*left, base + height),
                (*next_left, base + height),
                (*next_right, base + height),
                (*right, base + height),
            ],
            cap or face,
        )
    for left, right in (edges[0], edges[-1]):
        room.face(
            [
                (*left, base),
                (*right, base),
                (*right, base + height),
                (*left, base + height),
            ],
            face,
        )


def slatted_screen(line, bottom, top, material="oak", spacing=3):
    for ends in (bottom + 0.39, top - 0.68):
        ribbon(line, 2.8, ends, 0.63, material)
    total = sum(math.dist(a, b) for a, b in zip(line, line[1:]))
    steps = max(3, round(total / spacing))
    positions = [0.0]
    for a, b in zip(line, line[1:]):
        positions.append(positions[-1] + math.dist(a, b))
    segment = 0
    for i in range(steps + 1):
        s = i * total / steps
        while segment < len(line) - 2 and positions[segment + 1] < s:
            segment += 1
        a, b = line[segment : segment + 2]
        f = (s - positions[segment]) / max(
            0.01, positions[segment + 1] - positions[segment]
        )
        x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        block(x, y, bottom, 0.85, 3.55, top - bottom, material, 0.12, ang - 0.22)


def structural_portal(x, y, width, height, angle=0, material="walnut"):
    """Laminated bent frame with a continuous light line below the lintel."""
    radius = width * 0.13
    profile = [(-width / 2, 0), (-width / 2, height - radius)]
    for k in range(1, 8):
        a = math.pi - k * math.pi / 14
        profile.append(
            (
                -width / 2 + radius + radius * math.cos(a),
                height - radius + radius * math.sin(a),
            )
        )
    profile.append((width / 2 - radius, height))
    for k in range(1, 8):
        a = math.pi / 2 - k * math.pi / 14
        profile.append(
            (
                width / 2 - radius + radius * math.cos(a),
                height - radius + radius * math.sin(a),
            )
        )
    profile.append((width / 2, 0))
    co, si = math.cos(angle), math.sin(angle)

    def point(u, v, z):
        return (x + u * co - v * si, y + u * si + v * co, z)

    strips = []
    for i, (u, z) in enumerate(profile):
        a, b = profile[max(0, i - 1)], profile[min(i + 1, len(profile) - 1)]
        du, dz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(du, dz)
        nu, nz = -dz / length, du / length
        strips.append(
            [
                point(u + nu * s, d, z + nz * s)
                for s, d in [(-1.15, -1.7), (-1.15, 1.7), (1.15, 1.7), (1.15, -1.7)]
            ]
        )
    loft(strips, material)
    # The diffuser has a dedicated emissive material, batched for all rooms.
    for v in (-1.76, 1.76):
        a = point(-width / 2 + radius, v, height - 0.48)
        b = point(width / 2 - radius, v, height - 0.48)
        rod(a, b, 0.30, "diffuser", 6)
    for side in (-1, 1):
        a, b, _ = point(side * width * 0.5, 0, 0)
        block(a, b, 0.01, 4.4, 4.8, 0.8, "iron", 0.45, angle)


def shelf(x, y, length, angle=0, bays=5):
    co, si = math.cos(angle), math.sin(angle)

    def P(u, v):
        return (x + u * co - v * si, y + u * si + v * co)

    for k in range(bays + 1):
        a, b = P((k / bays - 0.5) * length, 0)
        block(a, b, 0, 0.78, 5.2, 22, "iron", 0.13, angle)
    for level in range(4):
        a, b = P(0, 0)
        block(a, b, 1 + 6.5 * level, length + 0.9, 5.7, 0.82, "maple", 0.25, angle)
        if level == 3:
            continue
        for k in range(bays):
            if (k + level) % 3 == 1:
                continue
            a, b = P(((k + 0.48) / bays - 0.5) * length, 0.25)
            if (k + level) % 2:
                vase(a, b, 1.82 + 6.5 * level, 0.57, "slate" if level % 2 else "clay")
            else:
                for j, col in enumerate(("moss", "paper", "rust", "ink")):
                    a, b = P(((k + 0.4) / bays - 0.5) * length + j * 0.77, 0.25)
                    block(
                        a,
                        b,
                        1.82 + 6.5 * level,
                        0.56,
                        2.9,
                        3.8 - 0.36 * (j % 3),
                        col,
                        0.05,
                        angle,
                    )


def framed_art(x, y, angle=0, wide=19):
    # A low freestanding display wall showing a material triptych.
    co, si = math.cos(angle), math.sin(angle)
    block(x, y, 0, wide + 3, 2.7, 20.2, "plaster", 0.42, angle)
    for k, col in enumerate(("clay", "slate", "warmstone")):
        off = (k - 1) * wide / 3
        a, b = x + co * off - si * 1.6, y + si * off + co * 1.6
        block(a, b, 6.8, wide / 3 - 0.72, 0.25, 9.2, col, 0.12, angle)
    block(x, y, 20.2, wide + 3.3, 1.15, 0.7, "oak", 0.15, angle)


def canopy_tree(x, y, z, size):
    """Branching indoor tree with individual bent leaf blades, without a pot."""
    start = (x, y, z)
    fork = (x + 0.5 * size, y - 0.4 * size, z + 8 * size)
    rod(start, fork, 0.54 * size, "walnut", 7)
    for branch in range(6):
        a = branch * 2.399 + 0.19
        dx, dy = math.cos(a), math.sin(a)
        dist = size * (3.3 + branch % 3)
        tip = (
            fork[0] + dx * dist,
            fork[1] + dy * dist,
            fork[2] + (2.5 + (branch % 2) * 2) * size,
        )
        rod(fork, tip, 0.23 * size, "walnut", 6)
        for k in range(9):
            az = a + k * 2.399
            u, v = math.cos(az), math.sin(az)
            reach = (2.3 + 0.45 * (k % 3)) * size
            root = (
                tip[0] + u * 0.35 * size,
                tip[1] + v * 0.35 * size,
                tip[2] - 0.15 * k * size,
            )
            mid = (
                root[0] + u * reach * 0.55,
                root[1] + v * reach * 0.55,
                root[2] + 0.5 * size,
            )
            end = (root[0] + u * reach, root[1] + v * reach, root[2] - 0.52 * size)
            w = 0.8 * size
            for sign, col in (
                (-1, "foliage"),
                (1, "leaflight" if k % 3 == 0 else "foliage"),
            ):
                corner = (
                    mid[0] - v * w * sign,
                    mid[1] + u * w * sign,
                    mid[2] - 0.3 * size,
                )
                room.face([root, corner, end, mid], col)


def design_garden(x, y):
    # Elliptical planted island set diagonally across the hall; the two arcs
    # leave wide entrances on the long sides to the surrounding public floor.
    angle = -0.26
    edges = polar_arc(x, y, 45, 14, 0, 360, 84, angle)
    room.face([(*pt, 3.8) for pt in edges[:-1]], "walnut")
    ribbon(edges, 1.8, 0.1, 4.3, "slate", "warmstone")
    for start, end in ((-25, 126), (149, 295)):
        bench = polar_arc(x, y, 49.4, 18.5, start, end, 40, angle)
        ribbon(bench, 7.6, 0.5, 2.35, "travertine")
        ribbon(bench, 8.6, 2.85, 0.68, "walnut", "oak")
        for k in range(8):
            a = start + k * (end - start) / 8 + 0.72
            b = start + (k + 1) * (end - start) / 8 - 0.72
            ribbon(
                polar_arc(x, y, 49.4, 18.5, a, b, 6, angle),
                7.65,
                3.53,
                1.34,
                "leather" if k in (1, 2) else "boucle",
            )
    for u, v, s in (
        (-28, 1, 1.16),
        (-18, -4, 0.76),
        (-8, 6, 0.91),
        (2, -5, 0.89),
        (13, 5, 1.12),
        (29, -1, 1.35),
    ):
        a = x + u * math.cos(angle) - v * math.sin(angle)
        b = y + u * math.sin(angle) + v * math.cos(angle)
        canopy_tree(a, b, 3.85, s)
    for i in range(11):
        a, b = edges[(i * 7 + 3) % 84]
        circle(
            x + (a - x) * 0.86, y + (b - y) * 0.78, 3.8, 1.8, 1.3, 0.55, "stone", n=9
        )


def reception():
    screen = polar_arc(936, 179, 56, 37, 183, 353, 51)
    slatted_screen(screen, 0.2, 22, "oak", 2.8)
    desk = polar_arc(936, 169, 37, 17, 14, 168, 40)
    ribbon(desk, 8.6, 0.2, 8.7, "warmstone")
    ribbon(desk, 10.6, 8.85, 1.8, "travertine", "marble")
    ribbon(desk, 8.8, 1.15, 0.45, "brass")
    chair(926, 167, math.pi, "boucle")
    chair(944, 167, math.pi, "boucle")
    # Stone waiting bench built into a timber back rail at the western side.
    bench = polar_arc(891, 212, 24, 11, 47, 221, 32, 0.2)
    ribbon(bench, 7.3, 0.1, 4.8, "travertine", "oak")
    for i in range(4):
        ribbon(
            polar_arc(891, 212, 24, 11, 49 + i * 42, 87 + i * 42, 9, 0.2),
            6.5,
            4.9,
            1.1,
            "moss",
        )
    table(893, 210, 12, 8, 4.4, True)
    canopy_tree(866, 188, 0, 1.15)
    display(980, 210)
    canopy_tree(988, 152, 0, 1.32)


def island_kitchen(x, y):
    cabinet(x, y - 25, 54, 8, 12)
    block(x, y, 0.3, 38, 15, 1.6, "walnut", 3)
    block(x, y, 1.9, 42, 17.7, 9.2, "travertine", 3.6, bevel=0.45)
    block(x, y, 11.1, 44, 19.1, 1.65, "marble", 3.7, bevel=0.29)
    block(x - 10, y, 12.78, 7.2, 5, 0.23, "slate", 1)
    rod((x - 10, y - 3, 12.7), (x - 10, y - 3, 15.5), 0.27, "brass")
    rod((x - 10, y - 3, 15.5), (x - 10, y - 0.6, 15.5), 0.27, "brass")
    for i in (0, 1, 2, 3):
        circle(
            x + 7 + i % 2 * 3.6, y - 1.5 + i // 2 * 3.2, 12.8, 1.25, 1.25, 0.12, "iron"
        )
    for i in (-1, 0, 1):
        a = x + 11 * i
        circle(a, y + 14, 0, 1.45, 1.45, 7.7, "walnut")
        circle(a, y + 14, 7.7, 3.5, 3.5, 0.85, "leather")
    # Suspended linear task light on cantilevered uprights.
    for side in (-1, 1):
        a = x + side * 19
        rod((a, y - 13, 0), (a, y - 13, 22), 0.42, "brass")
        rod((a, y - 13, 22), (a, y, 22), 0.42, "brass")
    block(x, y, 20.5, 40, 1.1, 1.42, "iron", 0.39)
    block(x, y, 20.48, 39, 0.85, 0.32, "diffuser", 0.2)


def coffee_counter():
    path = polar_arc(83, 171, 32, 18, 178, 357, 44)
    ribbon(path, 10.4, 0.14, 9.7, "clay", "walnut")
    ribbon(path, 11.6, 9.77, 1.6, "travertine", "marble")
    ribbon(path, 10.6, 2.2, 0.55, "brass")
    for i in range(22):
        a, b = polar_arc(83, 171, 37.2, 23.3, 182 + i * 7.9, 182 + i * 7.9 + 0.1, 1)[0]
        block(a, b, 1, 0.56, 0.6, 8, "maple", 0.14)
    block(82, 154, 11.5, 10, 5.5, 3.8, "iron", 0.85)
    for a in (79, 82, 85):
        circle(a, 155.7, 15.3, 0.66, 0.66, 0.83, "ceramic")
    shelf(85, 133, 57, 0, 5)
    # A long built-in banquette defines the cafe separately from the aisles.
    ribbon(
        [(49, 186), (49, 254), (53, 262), (65, 266)], 6.4, 0.1, 4.3, "walnut", "leather"
    )


def breeze_blocks(x, y, length, height, angle):
    """A perforated ceramic wall, built from repeated open masonry cells."""
    co, si = math.cos(angle), math.sin(angle)
    bays = max(3, round(length / 5.5))
    storeys = 3
    size = length / bays
    for k in range(bays + 1):
        off = k * size - length / 2
        a, b = x + co * off, y + si * off
        block(a, b, 0.1, 0.78, 2.6, height, "clay", 0.15, angle)
    for k in range(storeys + 1):
        block(
            x,
            y,
            0.1 + k * height / storeys,
            length + 0.8,
            2.6,
            0.65,
            "clay",
            0.14,
            angle,
        )
    for k in range(bays):
        for layer in range(storeys):
            off = (k + 0.5) * size - length / 2
            a, b = x + co * off, y + si * off
            z = 0.6 + layer * height / storeys
            d = (1 if (k + layer) % 2 else -1) * size * 0.30
            rod(
                (a - co * d, b - si * d, z),
                (a + co * d, b + si * d, z + height / storeys - 0.8),
                0.40,
                "clay",
                6,
            )


def salon():
    # Three timber frames form a roofless gallery around the natural route
    # from the east entrance, leaving both ends and the long sides open.
    design_garden(779, 397)
    for x in (882, 911, 940):
        structural_portal(x, 381, 61, 29, math.pi / 2, "oak")
    for y in (352, 410):
        block(911, y, 27.45, 60, 1.1, 1.05, "walnut", 0.23)
    for x, y in ((882, 379), (913, 380), (945, 378)):
        display(x, y)
    reading(673, 352, 38, "linen", "rust", -1)
    slatted_screen(polar_arc(676, 358, 37, 21, 192, 301, 24), 0.1, 15.4, "maple", 3.35)
    # Large natural-stone samples form a continuous stepped gallery at the back.
    block(858, 458, 0.18, 112, 12, 1.6, "travertine", 2.3)
    for i, surface in enumerate(("warmstone", "marble", "slate", "clay", "walnut")):
        x = 822 + i * 18
        block(x, 457.7, 1.78, 11.6, 2.45, 12 + i % 2 * 2.4, surface, 0.48, -0.15)
    bench = polar_arc(692, 445, 25, 8, 0, 182, 30)
    ribbon(bench, 6.5, 0.1, 4.4, "oak", "boucle")
    for x, y in ((657, 436), (687, 458), (971, 323)):
        canopy_tree(x, y, 0, 1.4)


def architecture_for(code):
    if code == "03":
        breeze_blocks(694, 226, 40, 18, math.pi / 2)
    elif code == "05":
        slatted_screen(
            polar_arc(559, 164, 28, 24, 188, 303, 25), 0.1, 20, "walnut", 2.6
        )
    elif code == "06":
        framed_art(581, 339, math.pi / 2, 39)
    elif code == "07":
        slatted_screen(polar_arc(477, 347, 22, 24, 197, 340, 27), 0.1, 19, "oak", 2.3)
    elif code == "08":
        framed_art(452, 216, math.pi / 2, 31)
        structural_portal(478, 143, 54, 22, 0, "maple")
    elif code == "10":
        for i, surface in enumerate(("rust", "moss", "boucle")):
            # Folded fabric samples on a modular wall-mounted rail.
            line = [(365 + i * 7, 385), (367 + i * 7, 388), (368 + i * 7, 390)]
            ribbon(line, 1, 4, 13 - i, surface)
        block(373, 386, 18, 21, 1.1, 0.9, "brass", 0.15)
    elif code == "11":
        breeze_blocks(286, 369, 52, 19, math.pi / 2)
    elif code == "12":
        for x in (285, 330):
            structural_portal(x, 183, 41, 23, math.pi / 2, "maple")
        for y in (165, 173, 193, 201):
            block(307.5, y, 23, 46.5, 1.15, 0.95, "oak", 0.22)
        framed_art(197, 193, math.pi / 2, 43)
    elif code == "13":
        slatted_screen(polar_arc(229, 390, 28, 35, 75, 202, 30), 0.1, 20, "maple", 3.7)
    elif code == "15":
        # Washable mineral wall backing with inset mirror and lit jambs.
        block(183.5, 235, 0, 1.25, 37, 18, "stone", 0.22)
        block(182.7, 235, 9, 0.50, 30, 7.4, "glass", 0.18)
        for yy in (219.5, 250.5):
            block(182.45, yy, 9, 0.48, 0.63, 7.55, "diffuser", 0.14)
