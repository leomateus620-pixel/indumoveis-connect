"""Curatorial staging. Furniture is illustrative and independent of inventory."""

for existing in list(scene.objects):
    if existing.name.startswith("Base_"):
        bpy.data.objects.remove(existing, do_unlink=True)


def samples(x, y):
    for i, s in enumerate(("marble", "walnut", "clay", "moss", "rattan", "slate")):
        block(
            x + i % 3 * 4.1,
            y + i // 3 * 4.8,
            9.2,
            3.5,
            4.0,
            0.65,
            s,
            0.2,
            -0.08 + 0.05 * i,
        )


def desk(x, y, w=30):
    table(x, y, w, 13, 9, top="maple")
    chair(x + 2, y + 10, 0, "ink")
    book(x - 8, y + 1, 9.1, 0.17, "blue")
    block(x + 6, y - 2, 9.1, 6.3, 4, 0.3, "iron", 0.28)
    block(x + 6, y - 3.5, 9.4, 6.2, 0.36, 4.0, "iron", 0.2)
    vase(x + w * 0.36, y, 9.1, 0.65, "ceramic")


def kitchen(x, y):
    cabinet(x, y, 49, 9, 12)
    block(x - 12, y, 13.4, 7, 4.8, 0.24, "iron", 1)
    block(x - 12, y, 13.66, 5.5, 3.5, 0.12, "slate", 0.8)
    rod((x - 12, y - 3, 13), (x - 12, y - 3, 15.6), 0.25, "brass")
    table(x, y + 24, 32, 13, 11, False, "marble")
    for i in (-1, 0, 1):
        circle(x + 10 * i, y + 34, 0, 1, 1, 8.2, "walnut")
        circle(x + 10 * i, y + 34, 8.1, 3.1, 3.1, 0.9, "leather")
    vase(x + 7, y + 24, 11, 0.85, "clay")


def cafe_table(x, y, n=3):
    table(x, y, 13, 13, 9.5, True, top="maple")
    for i in range(n):
        a = i * 2 * math.pi / n + 0.3
        chair(x + 10 * math.sin(a), y + 10 * math.cos(a), -a, "moss")
    vase(x + 0.4, y, 9.55, 0.45, "clay")


def wardrobe(x, y, w=34):
    block(x, y, 0, w, 7.1, 19, "walnut", 0.33)
    for i in range(10):
        block(
            x - w / 2 + (i + 0.5) * w / 10,
            y + 3.7,
            0.55,
            0.55,
            0.6,
            17.9,
            "maple",
            0.12,
        )
    block(x, y, 19, w + 1, 7.7, 0.6, "oak")


def terraces(x0, x1, y0, y1, seed):
    mid = (x0 + x1) / 2
    # Keep a continuous clear line along the southern glazing.
    for x in (x0 + 6, x1 - 6):
        block(x, y0 + 8, 0.15, 7.9, 11.8, 3.25, "clay", 1.4)
        plant(x, y0 + 8, 0.95, "clay", 0.1)
    if x1 - x0 > 100:
        dining(mid - 21, y0 + 21, 30, "moss", True)
        plant(x1 - 19, y0 + 13, 1.15)
        chair(mid + 30, y0 + 23, -0.75, "linen", True)
        chair(mid + 47, y0 + 20, 0.82, "rust", True)
    elif seed % 2:
        chair(mid - 11, y0 + 20, -0.55, "moss", True)
        chair(mid + 10, y0 + 18, 0.55, "linen", True)
        table(mid, y0 + 25, 7.5, 7.5, 3.7, True, top="clay")
    else:
        block(mid - 6, y0 + 11, 2, 32, 7.2, 2.1, "walnut", 0.68)
        for i in (-1, 0, 1):
            upholstery(mid - 6 + i * 9.6, y0 + 11, 4.2, 9.2, 6.8, 1.6, "boucle")
        chair(mid + 13, y0 + 21, 0.7, "moss", True)
        table(mid - 4, y0 + 23, 9, 7, 4, True)


def present(code):
    if code == "01":
        reception()
    elif code == "02":
        # Material library with a sample isle and worktable.
        shelf(807, 170, 60, 0, 6)
        shelf(835, 222, 43, math.pi / 2, 4)
        table(807, 202, 32, 15, 9, False, "travertine")
        samples(798, 200)
        chair(807, 214, 0, "ink")
        desk(807, 257, 34)
        plant(779, 277, 1.2)
    elif code == "03":
        # Dining studio, sideboard and informal conversation area.
        cabinet(727, 171, 54)
        dining(725, 207, 30, "rust")
        reading(721, 264, 26, "boucle", "moss", 1)
        plant(750, 177, 1.05)
    elif code == "04":
        # Contemporary kitchen and a round breakfast table.
        island_kitchen(643, 174)
        dining(644, 221, 24, "rust", True)
        cabinet(640, 287, 49, 7, 7)
        plant(671, 266, 1.1)
    elif code == "05":
        # Listening lounge, listening bench and paired armchairs.
        cabinet(559, 143, 49, 8, 8)
        reading(558, 187, 31, "leather", "rust")
        rug(561, 260, 56, 47, "pattern")
        chair(546, 258, -0.95, "linen", True)
        chair(576, 258, 0.95, "linen", True)
        table(561, 252, 12, 13, 4.5, True, top="walnut")
        plant(589, 144, 1.1)
    elif code == "06":
        # Small ceramics collection on broad plinths and a making table.
        for x, y, h in ((542, 333, 5), (570, 346, 7), (548, 359, 3.3)):
            block(x, y, 0, 14, 14, h, "travertine", 0.7)
            vase(x, y, h, 1.55, "clay" if h > 4 else "ceramic")
        desk(562, 397, 37)
        cabinet(558, 440, 43, 7, 7)
        plant(588, 325, 1.05)
    elif code == "07":
        # Suite with woven headboard and a dressing nook.
        bed(477, 349, 29)
        cabinet(478, 315, 43, 6, 7)
        cabinet(478, 430, 36)
        chair(480, 404, -0.27, "rust", True)
        table(495, 405, 9, 9, 5.3, True)
        plant(452, 417, 1.15)
    elif code == "08":
        # Living room and terrace threshold with a gallery console.
        cabinet(478, 141, 49)
        reading(476, 187, 32, "moss", "rust")
        dining(478, 257, 28, "boucle", True)
        plant(505, 150, 1.32)
    elif code == "09":
        # Library, reading seats, writing desk.
        shelf(397, 139, 59, 0, 6)
        shelf(368, 215, 49, math.pi / 2, 5)
        rug(395, 193, 59, 39, "tealrug")
        chair(378, 191, -0.7, "mustard", True)
        chair(410, 190, 0.7, "linen", True)
        table(395, 189, 13, 10, 5, True)
        book(394, 189, 5.05, 0.23)
        gallery_lamp(418, 202)
        desk(394, 251, 39)
        plant(422, 278, 1.3)
    elif code == "10":
        # Textile studio with patterned rug and fabric samples.
        cabinet(397, 321, 53)
        reading(395, 363, 29, "oxblood", "mustard")
        table(398, 414, 33, 15, 9, False, "maple")
        samples(390, 411)
        plant(421, 432, 1.0)
    elif code == "11":
        # Chef's studio and communal dining.
        kitchen(314, 295)
        dining(313, 381, 34, "boucle")
        wardrobe(315, 466, 48)
        plant(340, 423, 1.45)
    elif code == "12":
        # Apartment vignette, three connected furniture groups and a terrace.
        reading(241, 177, 44, "linen", "rust", -1)
        cabinet(240, 143, 61)
        dining(309, 185, 35, "moss")
        desk(306, 238, 39)
        chair(221, 231, -0.85, "rust", True)
        chair(244, 237, 0.77, "moss", True)
        table(233, 231, 12, 11, 5.0, True)
        plant(205, 245, 1.42)
        plant(340, 143, 1.3)
    elif code == "13":
        # Gallery of furniture with two distinct exhibition islands.
        reading(230, 319, 30, "mustard", "moss", -1)
        for x, y in ((218, 384), (247, 403)):
            circle(x, y, 0.1, 11, 11, 1.4, "travertine")
            vase(x, y, 1.5, 2.2, "clay")
        desk(232, 448, 34)
        plant(255, 471, 1.05)
    elif code == "14":
        # L-shaped cafe: espresso counter, seating along the narrow wing,
        # larger tables in the lower room, clear doors to the exit vestibule.
        coffee_counter()
        for x, y, n in (
            (67, 191, 3),
            (105, 219, 3),
            (70, 254, 3),
            (79, 310, 3),
            (127, 311, 4),
            (155, 362, 3),
            (82, 365, 4),
        ):
            cafe_table(x, y, n)
        plant(119, 137, 1.35)
        plant(53, 391, 1.35)
    elif code == "15":
        # Washroom stalls, fixtures, sink counter and clear central passage.
        for y in (148, 172, 196):
            block(153, y - 11, 0, 29, 1, 15, "plaster", 0.2)
            block(139, y, 0, 1, 21.2, 15, "plaster", 0.2)
            block(150, y, 0, 3.9, 6.5, 6.6, "ceramic", 0.8)
            circle(154, y, 2.5, 4.7, 3.45, 2.8, "ceramic")
            circle(154.4, y, 5.31, 2.8, 1.8, 0.1, "glass")
        block(174, 235, 0, 8, 33, 8.5, "stone", 0.7)
        for y in (224, 235, 246):
            circle(173.4, y, 8.5, 2.55, 3.35, 1.1, "ceramic")
            circle(173.4, y, 9.62, 1.7, 2.35, 0.05, "glass")
    elif code == "salon":
        salon()
    architecture_for(code)
    # Public zones are deliberately left open for the existing access labels.


light_batch = Room("ARQ_Luminarias")
for env in PLAN["environments"]:
    for part in env["parts"]:
        code, kind = env["code"], part["kind"]
        points = [
            tuple(map(float, pair))
            for pair in re.findall(r"[ML]([\d.\-]+)\s+([\d.\-]+)", part["path"])
        ]
        bounds = (
            min(p[0] for p in points),
            max(p[0] for p in points),
            min(p[1] for p in points),
            max(p[1] for p in points),
        )
        room = Room("ARQ_" + code + "_" + kind)
        cover = "maple" if kind == "external" else floor_surfaces.get(code, "stone")
        floor(points, cover)
        if kind == "external":
            terraces(*bounds, int(code))
            x0, x1, y0, y1 = bounds
            if code in ("08", "09", "12"):
                line = polar_arc(
                    (x0 + x1) / 2, y0 + 11, (x1 - x0) * 0.42, 6, 181, 355, 27
                )
                ribbon(line, 3.3, 0.1, 3.0, "walnut", "foliage")
            if code == "12":
                for xx in (x1 - 51, x1 - 9):
                    structural_portal(xx, y0 + 21, 29, 18, math.pi / 2, "oak")
        else:
            present(code)
        obj = room.finish()
        obj["environmentCode"] = code
        obj["part"] = kind
# Source wall strokes already include the doorway gaps. Avoid extruding the
# swing arcs, service labels and reception's curved circulation boundary.
room = Room("ARQ_Arquitetura")
for line in PLAN["architecture"]:
    if line["kind"] != "wall":
        continue
    for raw in re.finditer(
        r"M([\d.\-]+) ([\d.\-]+) L([\d.\-]+) ([\d.\-]+)", line["path"]
    ):
        x, y, u, v = map(float, raw.groups())
        length = math.hypot(u - x, v - y)
        if length < 2:
            continue
        wall = line["id"] == "source-walls"
        block(
            (u + x) / 2,
            (v + y) / 2,
            0.1,
            length,
            0.92 if wall else 0.55,
            10.8 if wall else 4.8,
            "plaster" if wall else "walnut",
            0.12,
            math.atan2(v - y, u - x),
        )
room.finish()
result = {
    "parts": len([o for o in scene.objects if o.type == "MESH"]),
    "atlas": [width, height],
    "drawingRevision": PLAN["revision"],
}

if light_batch.faces:
    lights = light_batch.finish()
    diffuser = bpy.data.materials.new("ARQ_Luz_linear")
    diffuser.use_nodes = True
    shader = diffuser.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (1.0, 0.9, 0.68, 1.0)
    shader.inputs["Emission Color"].default_value = (1.0, 0.81, 0.56, 1.0)
    shader.inputs["Emission Strength"].default_value = 0.8
    lights.data.materials[0] = diffuser
    result["parts"] += 1
