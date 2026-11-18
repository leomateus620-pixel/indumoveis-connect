// node scripts/build-commercial-landscape-mask.mjs (Python with Pillow, NumPy and SciPy).
// Rasterize the exact drawing geometry used by the exterior map into the park's local XZ frame.
import { createServer } from "vite";
import { spawnSync } from "node:child_process";

const map = "/src/features/commercial-map/";
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const [park, urban, pavement, planting, context] = await Promise.all(
    ["permanentParkLayout", "urbanLayout", "urbanPavement", "parkPlanting", "contextPlanting"].map(
      (module) => server.ssrLoadModule(map + module + ".ts"),
    ),
  );
  const paving = pavement.deriveUrbanPavement();
  const parkPolygons = [
    ...park.PARK_CORE_ENTITIES.map((entity) => entity.polygon),
    ...park.PERMANENT_PARK_EXPLORATION,
    ...planting.PARK_WOODLAND_MASSES.map((mass) => mass.polygon),
  ];
  const contextPolygons = [
    ...paving.asphalt,
    ...paving.gravel,
    ...paving.sidewalks,
    ...urban.deriveUrbanHouses().map((house) => house.parcel),
    ...urban.deriveUrbanVacantLots().map((lot) => lot.parcel),
    ...context.CONTEXT_WOODLAND.map(({ world: [x, z], scale }) =>
      Array.from({ length: 24 }, (_, i) => [
        x + scale * 3.2 * Math.cos((i * Math.PI) / 12),
        z + scale * 3.2 * Math.sin((i * Math.PI) / 12),
      ]),
    ),
  ];
  const result = spawnSync(
    process.env.PYTHON || "python3",
    [
      "-c",
      `
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt
park, context = json.load(sys.stdin)
points = np.array([p for poly in park + context for p in poly])
origin = np.floor(points.min(axis=0) - 58).astype(int)
extent = np.ceil(points.max(axis=0) + 58).astype(int) - origin
# A mask texel is about one drawing unit. Match physical aspect ratio.
size = tuple(np.ceil(extent).astype(int))
mask = Image.new("L", size, 0)
def paint(polygons):
    draw = ImageDraw.Draw(mask)
    for poly in polygons:
        draw.polygon([tuple(p) for p in (np.array(poly) - origin)], fill=255)
paint(park)
# Fill courtyards wholly surrounded by the model, then add the independent roads/plots.
mask = Image.fromarray(binary_fill_holes(np.asarray(mask) > 0).astype("uint8") * 255)
paint(context)
distance = distance_transform_edt(np.asarray(mask) == 0)
# Small registration tolerance, then a 10-unit feather outside the last modelled footprint.
t = np.clip((distance - 1.8) / 10.0, 0.0, 1.0)
weight = 1 - t*t*(3-2*t)
out = Path("src/features/commercial-map/assets")
# The green channel grades from the level authored park to the measured exterior over ~105 m.
grade = np.clip((distance - 2.) / 48., 0., 1.)
channels = np.stack([weight, grade*grade*(3-2*grade), np.zeros_like(weight)], axis=-1)
Image.fromarray(np.round(channels * 255).astype("uint8")).save(out / "landscape-mask.png", optimize=True)
(out / "landscape-mask.json").write_text(json.dumps(dict(origin=origin.tolist(), extent=extent.tolist())) + "\\n")
`,
    ],
    {
      input: JSON.stringify([parkPolygons, contextPolygons]),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("landscape-mask-generation");
} finally {
  await server.close();
}
