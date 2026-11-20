"""Prepare the runtime atlas and sample the same registered material library offline."""

import argparse
import json
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

MASTER = Path(__file__).with_name("materiais-higgsfield.webp")


def tile(sheet, index):
    size = sheet.width // 4
    x, y = index % 4 * size, index // 4 * size
    return sheet.crop((x, y, x + size, y + size))


def export_master(photo_path, render_path):
    """Combine the generated photographic surfaces with the editable Jutsu bake."""
    size = 256
    with Image.open(photo_path) as photo, Image.open(render_path) as render:
        sheet = Image.new("RGBA", (4 * size, 4 * size))
        for i in range(16):
            finish = tile(photo, i).convert("RGB")
            model = (
                tile(render, i)
                .convert("RGBA")
                .resize((size, size), Image.Resampling.LANCZOS)
            )
            # Crop any photographed eave above the wall plane. Actual roof
            # pitch and the number of floors come from the world-space mesh.
            upper = (
                [0.15, 0.16, 0.13, 0.22, 0.008, 0.008, 0.19, 0.14][i]
                if i < 8
                else 0.008
            )
            side = round(finish.width * 0.008)
            finish = finish.crop(
                (
                    side,
                    round(finish.height * upper),
                    finish.width - side,
                    finish.height - side,
                )
            )
            finish = finish.resize((size, size), Image.Resampling.LANCZOS)
            if 8 <= i < 12:
                relief = model.convert("L")
                detail = np.asarray(relief, dtype=float) - np.asarray(
                    relief.filter(ImageFilter.GaussianBlur(2.8)), dtype=float
                )
                finish = Image.fromarray(
                    np.clip(
                        np.asarray(finish) + 0.34 * detail[:, :, None], 0, 255
                    ).astype("uint8")
                )
            finish = finish.convert("RGBA")
            if i >= 12:
                # Coverage was rendered from separate leaf blades. Give all
                # texels an optical colour before filtering antialiased alpha.
                finish.putalpha(model.getchannel("A"))
            sheet.paste(finish, (i % 4 * size, i // 4 * size))
        sheet.save(MASTER, lossless=True, method=6, exact=True)


TOWERS = Path(__file__).with_name("torres-higgsfield.webp")


def pack_tower_exports(directory):
    """Pair the front and return rendered in Jutsu with their actual geometry."""
    specifications = (directory / "torres-higgsfield.json").read_bytes()
    families = json.loads(specifications)
    sheet = Image.new("RGB", (4 * 192, 2 * 192))
    for index, family in enumerate(families):
        palette = np.array(
            [[int(c[k : k + 2], 16) for k in (0, 2, 4)] for c in family["palette"]]
        )
        combined = Image.new("RGB", (192, 192))
        for view, dx, width in (("swatch", 0, 128), ("return", 128, 64)):
            with Image.open(directory / f"{view}-{index}.png") as rendered:
                rgb = np.asarray(
                    rendered.convert("RGB").resize(
                        (width, 192), Image.Resampling.LANCZOS
                    ),
                    dtype=float,
                )
            # Restore daylight exposure on the physical pieces. Correct only
            # luminance so the smoked glazing and occasional narrow coloured
            # strip keep their original hue without tinting the entire wall.
            target = 0.60 * palette[0] + 0.20 * palette[1] + 0.20 * palette[3]
            if view == "return":
                target = 0.54 * palette[0] + 0.31 * palette[1] + 0.15 * palette[3]
            luma = np.array([0.2126, 0.7152, 0.0722])
            light = rgb @ luma
            daylight = (target @ luma) + 0.88 * (light - light.mean())
            colour = np.clip(rgb + (daylight - light)[:, :, None], 0, 255)
            combined.paste(Image.fromarray(colour.astype("uint8")), (dx, 0))
        sheet.paste(combined, (index % 4 * 192, index // 4 * 192))
    sheet.save(TOWERS, lossless=True, method=6)
    TOWERS.with_suffix(".json").write_bytes(specifications)


def tower_swatches():
    with Image.open(TOWERS) as source:
        width = source.width // 4
        return [
            source.crop(
                (
                    i % 4 * width,
                    i // 4 * width,
                    (i % 4 + 1) * width,
                    (i // 4 + 1) * width,
                )
            ).convert("RGB")
            for i in range(8)
        ]


def tower_quadrants(swatches):
    # The two former apartment cells hold all eight tower elevations. Inner
    # gutters stop a dark glass tower bleeding into an adjacent warm façade.
    result = Image.new("RGBA", (256, 256))
    for i, swatch in enumerate(swatches):
        rgb = np.asarray(swatch.resize((112, 112), Image.Resampling.LANCZOS))
        block = np.pad(rgb, ((8, 8), (8, 8), (0, 0)), mode="reflect")
        result.paste(Image.fromarray(block), ((i % 2) * 128, (i // 2) * 128))
    return result


def write_atlases(directory):
    # Both levels share the same normalized UVs. Reflecting the edge into a
    # four-texel gutter at compact resolution keeps adjacent swatches separate.
    facades = tower_swatches()
    towers = [tower_quadrants(facades[:4]), tower_quadrants(facades[4:])]
    with Image.open(MASTER) as source:
        for name, width in (("compact", 256), ("detail", 768)):
            cell = width // 4
            gutter = cell // 16
            result = Image.new("RGBA", (width, width))
            for index in range(16):
                patch = towers[index - 4] if index in (4, 5) else tile(source, index)
                patch = patch.resize((cell - 2 * gutter,) * 2, Image.Resampling.LANCZOS)
                rgba = np.asarray(patch.convert("RGBA"))
                padded = np.pad(
                    rgba, ((gutter, gutter), (gutter, gutter), (0, 0)), mode="reflect"
                )
                result.paste(
                    Image.fromarray(padded), (index % 4 * cell, index // 4 * cell)
                )
            result.save(
                directory / f"settlement-{name}.webp",
                quality=90,
                method=6,
                alpha_quality=95,
            )


@lru_cache(maxsize=1)
def horizon_tiles():
    # Long sightlines only resolve a few metres per pixel. The low-pass
    # material makes doors, bays and crown masses visible without leaf noise.
    with Image.open(MASTER) as sheet:
        swatches = []
        for i in range(16):
            patch = tile(sheet, i).convert("RGBA")
            if i >= 12:
                # Darker leaves under the crown continue across its alpha edge.
                ground = Image.new("RGBA", patch.size, (74, 94, 65, 255))
                patch = Image.alpha_composite(ground, patch)
            swatches.append(
                np.asarray(
                    patch.convert("RGB").resize((16, 16), Image.Resampling.LANCZOS)
                )
            )
    swatches.extend(
        np.asarray(patch.resize((16, 16), Image.Resampling.LANCZOS))
        for patch in tower_swatches()
    )
    return np.stack(swatches).astype(np.float32)


def sample_horizon_material(index, u, v):
    tiles = horizon_tiles()
    # The library runs north-up/upper-storey-first in both Blender and Pillow.
    x = np.floor((u % 1) * 16).astype(int)
    y = 15 - np.floor((v % 1) * 16).astype(int)
    return tiles[index, y, x]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photo", type=Path)
    parser.add_argument("--render", type=Path)
    parser.add_argument("--towers", type=Path, help="Directory from export_towers.py")
    args = parser.parse_args()
    if args.towers:
        pack_tower_exports(args.towers)
    elif args.photo and args.render:
        export_master(args.photo, args.render)
    else:
        parser.error("Supply --towers, or both --photo and --render")
    write_atlases(Path(__file__).resolve().parents[2] / "public/landscape/santa-rosa")
