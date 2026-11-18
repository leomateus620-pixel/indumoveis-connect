// node scripts/build-commercial-landscape-mask.mjs (Python with Pillow, NumPy and SciPy).
// Rasterize the exact drawing geometry used by the exterior map into the park's local XZ frame.
import { createServer } from "vite";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

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
  const { projectReferenceCoordinate, URBAN_REFERENCE } = await server.ssrLoadModule(
    map + "urbanReference.ts",
  );
  const snapshot = JSON.parse(
    await readFile(new URL("./santa-rosa/frontage-roads.geojson", import.meta.url), "utf8"),
  );
  const paintedRoads = urban.deriveUrbanRoads();
  const continuations = snapshot.features.map(({ id, geometry, properties }) => {
    const way = id.slice("way/".length);
    const model = paintedRoads.find((road) => road.sourceWayIds.includes(way));
    return [
      geometry.coordinates.map(projectReferenceCoordinate),
      model?.width ?? properties.opticalWidthM * URBAN_REFERENCE.unitsPerMetre,
    ];
  });
  const roads = [...paving.asphalt, ...paving.gravel, ...paving.sidewalks];
  const contextPolygons = [
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
park, context, roads, continuations = json.load(sys.stdin)
points = np.array([p for poly in park + context + roads for p in poly])
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
land_distance = distance_transform_edt(np.asarray(mask) == 0)
paint(roads)
distance = distance_transform_edt(np.asarray(mask) == 0)
# A single 10-unit grass feather covered the continuation of dead-ended
# pavement meshes. The last rasterized road cell keeps its substrate; the
# optical roadway takes over in two units. Vegetated edges allow four.
def feather(distance, width):
    t = np.clip((distance - .5) / width, 0., 1.)
    return 1 - t*t*(3-2*t)
weight = np.maximum(feather(land_distance, 4.), feather(distance, 2.))
# Remove model grass on an observed through-road. At the exact road end
# its corridor is as wide as the registered model asphalt. Rendering the
# road polygon still covers the image wherever the authored mesh exists.
high = 4
lanes = Image.new("L", tuple(v*high for v in size), 0)
draw = ImageDraw.Draw(lanes)
for path, width in continuations:
    draw.line([tuple(p) for p in (np.array(path) - origin) * high],
              fill=255, width=max(1,round(width*high)), joint="curve")
corridor = np.array(lanes.resize(size, Image.Resampling.LANCZOS)) / 255.
weight *= 1 - corridor * (land_distance > 1.)
mask = Image.new("L", size, 0)
paint(roads)
paved = np.asarray(mask) != 0
# Keep the relief triangle below the actual mesh, including where the DSM
# rises on the other side of a narrow road. Keep the existing settlement exclusion (>5/255)
# and contribute only ~2% grass at the rasterized edge.
weight = np.maximum(weight, paved * (6. / 255.))
beyond_road = distance_transform_edt(~paved)
t = np.clip(beyond_road / 15., 0., 1.)
contact = corridor * (1 - t*t*(3-2*t))
out = Path("src/features/commercial-map/assets")
# The green channel grades from the level authored park to the measured exterior over ~105 m.
grade = np.clip((distance - 2.) / 48., 0., 1.)
channels = np.stack([weight, grade*grade*(3-2*grade), contact], axis=-1)
Image.fromarray(np.round(channels * 255).astype("uint8")).save(out / "landscape-mask.png", optimize=True)
(out / "landscape-mask.json").write_text(json.dumps(dict(origin=origin.tolist(), extent=extent.tolist())) + "\\n")
`,
    ],
    {
      input: JSON.stringify([parkPolygons, contextPolygons, roads, continuations]),
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("landscape-mask-generation");
} finally {
  await server.close();
}
