"""Compare the native PNGs from commercial-map-horizon-isolation.mjs."""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import find_objects, label


def rgb(directory, layer, height):
    return np.asarray(
        Image.open(directory / f"{layer}-{height}.png").convert("RGB"), dtype=np.int16
    )


def check(before, after, output):
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "buffer": [1294, 655],
        "stripXYWH": [100, 105, 1100, 48],
        "tower": {
            "lonLat": [-54.467276, -27.864323],
            "estimatedHeightM": 53.72,
            "footprintIndexOneBased": 8668,
        },
        "samples": [],
    }
    for height in [24, 40, 44, 48, 72]:
        row = {"heightM": height}
        for name, directory in [("before", before), ("after", after)]:
            actual = rgb(directory, "composite", height)
            assert actual.shape[:2] == (655, 1294)
            no_plane = rgb(directory, "without-underlay", height)
            strip = np.abs(actual - no_plane)[105:153, 100:1200].max(axis=2)
            row[name + "StripPixelsChangedOver8"] = int(np.count_nonzero(strip > 8))
        assert row["afterStripPixelsChangedOver8"] == 0, row
        actual = rgb(after, "composite", height)
        # Identify the tower by removing the geographic mesh. At this FOV the
        # selected building is the largest connected volume in this search area.
        mask = (
            np.abs(actual - rgb(after, "without-settlement", height)).max(axis=2) > 12
        )
        components = find_objects(label(mask[95:175, 610:705])[0])
        y, x = max(
            components, key=lambda cell: np.prod([s.stop - s.start for s in cell])
        )
        left, top = x.start + 610, y.start + 95
        right, bottom = x.stop + 610, y.stop + 95
        assert 28 <= right - left <= 45 and bottom - top > 12, (
            "Tower missing from test frame"
        )
        row["towerXYWH"] = [left, top, right - left, bottom - top]
        roi = (slice(top + 2, top + 11), slice(left + 3, right - 3))
        modes = ["low", "high", "without-panorama", "without-depth"]
        row["maxTowerChannelDifference"] = {
            mode: int(np.abs(actual[roi] - rgb(after, mode, height)[roi]).max())
            for mode in modes
        }
        assert max(row["maxTowerChannelDifference"].values()) == 0, row
        report["samples"].append(row)
    (output / "isolamento-horizonte.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    shots = [
        (before, "composite", 24, "Antes · 24 m"),
        (before, "without-underlay", 24, "Antes · 24 m · plano local oculto"),
        (after, "composite", 24, "Depois · 24 m"),
        (after, "composite", 44, "Depois · 44 m · transição entre panoramas"),
        (after, "composite", 72, "Depois · 72 m"),
    ]
    sheet = Image.new("RGB", (1100, len(shots) * 100), "#faf9f5")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)
    for i, (directory, mode, height, caption) in enumerate(shots):
        y = i * 100
        draw.text((8, y + 5), caption, font=font, fill="#332e32")
        im = Image.open(directory / f"{mode}-{height}.png")
        sheet.paste(im.crop((100, 96, 1200, 164)), (0, y + 28))
    sheet.save(output / "isolamento-horizonte.webp", lossless=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("before", type=Path)
    p.add_argument("after", type=Path)
    p.add_argument("output", type=Path)
    check(**vars(p.parse_args()))
