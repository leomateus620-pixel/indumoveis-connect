"""Pack a meshopt-compressed 3D Jutsu export with native WebP PBR textures.

Input geometry is produced with gltfpack 1.3, flags as recorded in manifest.json.
The application supplies its own lighting. Space codes and names stay intact.
"""

import argparse
import io
import json
import struct
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
data = args.source.read_bytes()
js_size = struct.unpack_from("<I", data, 12)[0]
doc = json.loads(data[20 : 20 + js_size])
payload = data[28 + js_size :]
active = doc["scenes"][doc["scene"]]
nodes = doc["nodes"]
keep = [
    i
    for i, n in enumerate(nodes)
    if "camera" not in n and "KHR_lights_punctual" not in n.get("extensions", {})
]
new_index = {old: i for i, old in enumerate(keep)}
active["nodes"] = [new_index[i] for i in active["nodes"] if i in new_index]
doc["nodes"] = [nodes[i] for i in keep]
for n in doc["nodes"]:
    if "children" in n:
        n["children"] = [new_index[i] for i in n["children"] if i in new_index]
    if "extras" in n:
        n["extras"].pop("hf_id", None)
        if not n["extras"]:
            n.pop("extras")
doc.pop("cameras", None)
doc.get("extensions", {}).pop("KHR_lights_punctual", None)
if not doc.get("extensions"):
    doc.pop("extensions", None)
for key in ("extensionsUsed", "extensionsRequired"):
    if "KHR_lights_punctual" in doc[key]:
        doc[key].remove("KHR_lights_punctual")
    doc[key].append("EXT_texture_webp")
views = doc["bufferViews"]
source_images = {image["bufferView"]: image for image in doc["images"]}
blocks = []
for idx, view in enumerate(views):
    if view.get("buffer") == 0:
        blocks.append((view.get("byteOffset", 0), view, source_images.get(idx)))
    comp = view.get("extensions", {}).get("EXT_meshopt_compression", {})
    if comp.get("buffer") == 0:
        blocks.append((comp.get("byteOffset", 0), comp, None))
output = bytearray()
for offset, view, image in sorted(blocks, key=lambda b: b[0]):
    content = payload[offset : offset + view["byteLength"]]
    if image:
        pixels = Image.open(io.BytesIO(content)).convert("RGB")
        encoded = io.BytesIO()
        if image["name"].endswith("_OMR"):
            # Roughness fluctuates slightly within each swatch. Preserve the
            # metal-channel values exactly and quantize roughness to 64 levels.
            r, g, b = pixels.split()
            pixels = Image.merge(
                "RGB", (r, g.point(lambda v: min(255, round(v / 4) * 4)), b)
            )
            pixels.save(encoded, "WEBP", lossless=True, method=6)
        else:
            pixels.save(encoded, "WEBP", quality=88, method=6)
        content = encoded.getvalue()
        image["mimeType"] = "image/webp"
    output.extend(bytes((-len(output)) % 4))
    view["byteOffset"] = len(output)
    view["byteLength"] = len(content)
    output.extend(content)
for texture in doc["textures"]:
    texture.setdefault("extensions", {})["EXT_texture_webp"] = {
        "source": texture.pop("source")
    }
doc["buffers"][0]["byteLength"] = len(output)
output.extend(bytes((-len(output)) % 4))
js = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
size = 28 + len(js) + len(output)
args.output.write_bytes(
    struct.pack("<4sIIII", b"glTF", 2, size, len(js), 0x4E4F534A)
    + js
    + struct.pack("<II", len(output), 0x004E4942)
    + output
)
