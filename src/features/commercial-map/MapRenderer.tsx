import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ENTITIES, MAP_BOUNDS, TREES, type MapEntity, type Point } from "./data/territory";
import {
  framingDistance,
  framingBoxDistance,
  initialQuality,
  isClick,
  MOVEMENT,
  nextAdaptiveQuality,
  QUALITY,
  resolvePixelRatio,
  readableLabelSize,
  shouldUseLightFallback,
  smoothStep,
  viewDirection,
  type QualityTier,
} from "./navigation";
import type { MapHandle, MapRendererProps, MapView } from "./types";

type Pose = { position: THREE.Vector3; target: THREE.Vector3 };
type Runtime = MapHandle & { update(): void; dispose(): void };
function rebasePoseTarget(pose: Pose, target: Point) {
  pose.position.x += target[0] - pose.target.x;
  pose.position.z += target[1] - pose.target.z;
  pose.target.x = target[0];
  pose.target.z = target[1];
}
type Diagnostic = {
  enabled: boolean;
  instance: string;
  active: boolean;
  contextCount: number;
  frames: number;
  createdContexts: number;
  activeContexts: number;
  activeLoops: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  textureBytes: number;
  dpr: number;
  buffer: [number, number];
  tier: QualityTier;
  cameraState: "idle" | "manual" | "transition";
  target: Point;
  readyAt?: number;
  frameIntervals: number[];
  renderDurations: number[];
  contextLosses: number;
  failureReason?: string;
  slowFrameWindows: number;
  sampledFrameWindows: number;
  selectionDrawAt?: number;
  lastSelectedId?: string | null;
  project(id: string): { x: number; y: number } | null;
  resetSamples(): void;
  loseContext(): void;
};

declare global {
  interface Window {
    __indumoveisMap?: Diagnostic;
  }
}

const PALETTE = {
  background: "#f3f0eb",
  ground: "#e4dfd3",
  road: "#c7c3be",
  walk: "#ddd6cb",
  landscape: "#b8c5a3",
  lot: "#e5ddcf",
  lotEdge: "#766354",
  plum: "#623d54",
  wall: "#f7f1e8",
  roof: "#e7dfd2",
  support: "#c2b3a2",
  text: "#352831",
};
const ENTITY_BY_ID = new Map(ENTITIES.map((entity) => [entity.id, entity]));
const PAVILION_LABELS: Record<string, string> = {
  "indumoveis:pavilion:1": "P1 · Mostra",
  "indumoveis:pavilion:3": "P3",
  "indumoveis:pavilion:8": "P8",
  "indumoveis:pavilion:12": "P12",
  "indumoveis:pavilion:13": "P13",
  "indumoveis:pavilion:14": "P14",
};
const WIDTH = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
const DEPTH = MAP_BOUNDS.maxY - MAP_BOUNDS.minY;
const DIAGONAL = Math.hypot(WIDTH, DEPTH);
const CENTER: Point = [
  (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) / 2,
  (MAP_BOUNDS.minY + MAP_BOUNDS.maxY) / 2,
];

function polygonGeometry(polygon: Point[], height: number) {
  const triangles = THREE.ShapeUtils.triangulateShape(
    polygon.map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  const vertices: number[] = [];
  for (const [a, b, c] of triangles) {
    const pa = polygon[a],
      pb = polygon[b],
      pc = polygon[c];
    // Sheet y points down. Keep the ground-facing conversion explicit so no
    // accidental mirror or blanket DoubleSide material can hide wrong normals.
    const crossY = (pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]);
    const ordered = crossY >= 0 ? [pa, pb, pc] : [pa, pc, pb];
    for (const p of ordered) vertices.push(p[0], height, p[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function wallGeometry(polygon: Point[], bottom: number, top: number) {
  const positions: number[] = [];
  const signed = polygon.reduce((sum, p, i) => {
    const n = polygon[(i + 1) % polygon.length];
    return sum + p[0] * n[1] - n[0] * p[1];
  }, 0);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const corners =
      signed > 0
        ? [
            [a[0], bottom, a[1]],
            [b[0], top, b[1]],
            [b[0], bottom, b[1]],
            [a[0], bottom, a[1]],
            [a[0], top, a[1]],
            [b[0], top, b[1]],
          ]
        : [
            [a[0], bottom, a[1]],
            [b[0], bottom, b[1]],
            [b[0], top, b[1]],
            [a[0], bottom, a[1]],
            [b[0], top, b[1]],
            [a[0], top, a[1]],
          ];
    for (const p of corners) positions.push(...p);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function edges(polygon: Point[], height: number) {
  return polygon.flatMap((p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return [p[0], height, p[1], next[0], height, next[1]];
  });
}

function boundsOf(entity?: MapEntity) {
  const points = entity?.polygon ?? [
    [MAP_BOUNDS.minX, MAP_BOUNDS.minY],
    [MAP_BOUNDS.maxX, MAP_BOUNDS.maxY],
  ];
  const minX = Math.min(...points.map((p) => p[0])),
    maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1])),
    maxY = Math.max(...points.map((p) => p[1]));
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2] as Point,
    radius: Math.hypot(maxX - minX, maxY - minY, entity?.height ?? 0) / 2,
    box: { width: maxX - minX, depth: maxY - minY, height: entity?.height ?? 0 },
  };
}

function statusColor(status?: string) {
  return (
    (
      {
        disponivel: "#b8d6c5",
        em_negociacao: "#b9ccdf",
        reservado: "#e2c69e",
        vendido: "#9b7c91",
        bloqueado: "#b6b2b5",
      } as Record<string, string>
    )[status?.toLowerCase() ?? ""] ?? PALETTE.lot
  );
}

/** A single browser-only WebGL context. Its lifetime is independent of selection,
 * API refetch, panel state and size. This module is imported only by React.lazy. */
const MapRenderer = forwardRef<MapHandle, MapRendererProps>(function MapRenderer(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const runtimeRef = useRef<Runtime | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: (id) => runtimeRef.current?.focus(id),
      zoom: (factor) => runtimeRef.current?.zoom(factor),
      pan: (dx, dy) => runtimeRef.current?.pan(dx, dy),
      rotate: (direction) => runtimeRef.current?.rotate(direction),
      getTarget: () => runtimeRef.current?.getTarget() ?? CENTER,
      restoreOverview: () => runtimeRef.current?.restoreOverview(),
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let runtime: Runtime | null = null;
    try {
      runtime = createMapRuntime(host, () => latest.current);
      runtimeRef.current = runtime;
    } catch (error) {
      latest.current.onFailure(error instanceof Error ? error.message : "renderer-initialization");
    }
    return () => {
      runtime?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.update();
  }, [
    props.selectedId,
    props.inspectedId,
    props.view,
    props.quality,
    props.gesture,
    props.insets.right,
    props.insets.bottom,
    props.statuses,
    props.highlightedIds,
  ]);

  return (
    <div
      ref={hostRef}
      className="ind-map-renderer"
      data-map-renderer="3d"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    />
  );
});

export default MapRenderer;

function createMapRuntime(host: HTMLDivElement, props: () => MapRendererProps): Runtime {
  const rollback: (() => void)[] = [];
  try {
    return initializeMapRuntime(host, props, rollback);
  } catch (error) {
    for (const release of rollback.reverse()) {
      try {
        release();
      } catch {
        /* Keep the original initialization failure. */
      }
    }
    throw error;
  }
}

function initializeMapRuntime(
  host: HTMLDivElement,
  props: () => MapRendererProps,
  rollback: (() => void)[],
): Runtime {
  performance.mark("indumoveis-map:renderer-start");
  const canvas = document.createElement("canvas");
  canvas.setAttribute(
    "aria-label",
    "Mapa tridimensional do parque. Use a busca e os controles para consulta por teclado.",
  );
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  canvas.dataset.mapCanvas = "indumoveis";
  // Request the actual scene context, never a spare capability-probe context.
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    powerPreference: "low-power",
  });
  if (!context) throw new Error("webgl2-unavailable");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
  } catch (error) {
    context.getExtension("WEBGL_lose_context")?.loseContext();
    throw error;
  }
  rollback.push(() => {
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  });
  host.appendChild(canvas);
  renderer.setClearColor(PALETTE.background);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, DIAGONAL * 15);
  const controls = new OrbitControls(camera, canvas);
  rollback.push(() => controls.dispose());
  controls.enableDamping = false; // direct gesture mapping, independent of RAF cadence
  controls.screenSpacePanning = false;
  controls.enableRotate = true;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.85;
  controls.zoomSpeed = 0.8;
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI * 0.4;
  controls.minDistance = 5;
  controls.maxDistance = DIAGONAL * 6;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  let tier =
    props().quality === "auto"
      ? initialQuality(memory, navigator.hardwareConcurrency)
      : (props().quality as QualityTier);
  let pendingTier: QualityTier | null = null;
  let width = Math.max(1, host.clientWidth),
    height = Math.max(1, host.clientHeight);
  let disposed = false,
    failed = false,
    ready = false,
    frame = 0,
    scheduled = 0,
    optionalTask = 0;
  let transition: { from: Pose; to: Pose; start: number; duration: number } | null = null;
  let exteriorPose: Pose | null = null;
  let previousInspected = props().inspectedId;
  let previousView = props().view;
  let previousQuality = props().quality;
  let previousSelection = props().selectedId;
  let previousInsetRight = props().insets.right,
    previousInsetBottom = props().insets.bottom;
  let pendingVisibilityCheck = false;
  let lastActivity = 0,
    lastFrame = 0,
    lastQualityChange = 0;
  let slowWindows = 0,
    fastWindows = 0;
  const adaptiveSamples: number[] = [];
  const activePointers = new Map<
    number,
    { x: number; y: number; touch: boolean; candidate: string | null }
  >();
  let clickCancelled = false;
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  rollback.push(() => {
    for (const resource of resources) resource.dispose();
    scene.clear();
  });
  const pickables: THREE.Mesh[] = [];
  const shells = new Map<string, THREE.Group>();
  const labels: {
    entity: MapEntity;
    text: string;
    size: number;
    width: number;
    height: number;
    vertex: number;
    priority: number;
    vertical: boolean;
    textWidth: number;
    rect: { x: number; y: number; w: number; h: number };
  }[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const wheelAnchor = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const projection = new THREE.Vector3();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const diag: Diagnostic = {
    enabled: new URLSearchParams(window.location.search).get("mapDiagnostics") === "1",
    instance: crypto.randomUUID(),
    active: true,
    contextCount: 1,
    frames: 0,
    createdContexts: 1,
    activeContexts: 1,
    activeLoops: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    textureBytes: 4 * 1024 * 1024,
    dpr: 1,
    buffer: [0, 0],
    tier,
    cameraState: "idle",
    target: [...CENTER],
    frameIntervals: [],
    renderDurations: [],
    contextLosses: 0,
    slowFrameWindows: 0,
    sampledFrameWindows: 0,
    project(id) {
      const entity = ENTITY_BY_ID.get(id);
      if (!entity) return null;
      projection.set(entity.anchor[0], 0.2, entity.anchor[1]).project(camera);
      return { x: ((projection.x + 1) * width) / 2, y: ((1 - projection.y) * height) / 2 };
    },
    resetSamples() {
      diag.frameIntervals.length = 0;
      diag.renderDurations.length = 0;
      lastFrame = 0;
    },
    loseContext() {
      context.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
  window.__indumoveisMap = diag;
  rollback.push(() => {
    diag.active = false;
    diag.activeContexts = diag.contextCount = diag.activeLoops = 0;
    diag.project = () => null;
    diag.loseContext = () => {};
  });

  function track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(value: T): T {
    resources.add(value);
    return value;
  }
  function basic(color: string) {
    return track(new THREE.MeshBasicMaterial({ color }));
  }
  function matte(color: string) {
    return track(new THREE.MeshLambertMaterial({ color }));
  }
  const wallMaterial = matte(PALETTE.wall),
    roofMaterial = matte(PALETTE.roof),
    trimMaterial = matte(PALETTE.plum),
    floorMaterial = matte("#f3eade");
  const groundMaterial = matte(PALETTE.ground);
  scene.add(new THREE.HemisphereLight("#fffaf2", "#b3aaa1", 0.95));
  const sunlight = new THREE.DirectionalLight("#fff8ec", 1.5);
  sunlight.position.set(-70, 140, 70);
  scene.add(sunlight);
  const ground = new THREE.Mesh(
    track(
      polygonGeometry(
        [
          [MAP_BOUNDS.minX - 9, MAP_BOUNDS.minY - 9],
          [MAP_BOUNDS.maxX + 9, MAP_BOUNDS.minY - 9],
          [MAP_BOUNDS.maxX + 9, MAP_BOUNDS.maxY + 9],
          [MAP_BOUNDS.minX - 9, MAP_BOUNDS.maxY + 9],
        ],
        -0.15,
      ),
    ),
    groundMaterial,
  );
  scene.add(ground);

  // Each static ground category is one draw call, independent of lot count.
  const lotRanges = new Map<string, [number, number]>();
  let lotGeometry: THREE.BufferGeometry | null = null;
  for (const kind of ["landscape", "road", "lot", "support"] as const) {
    const positions: number[] = [],
      colors: number[] = [],
      borderPositions: number[] = [];
    for (const entity of ENTITIES.filter((entry) => entry.kind === kind)) {
      const elevation = kind === "landscape" ? -0.08 : kind === "road" ? -0.025 : 0.05;
      const geometry = polygonGeometry(entity.polygon, elevation);
      const data = geometry.getAttribute("position").array;
      const start = positions.length / 3;
      positions.push(...data);
      const color = new THREE.Color(
        kind === "lot"
          ? statusColor(props().statuses[entity.id])
          : kind === "road"
            ? PALETTE.road
            : kind === "landscape"
              ? PALETTE.landscape
              : PALETTE.support,
      );
      for (let i = 0; i < data.length / 3; i++) colors.push(color.r, color.g, color.b);
      if (kind === "lot") lotRanges.set(entity.id, [start, data.length / 3]);
      if (kind !== "landscape") borderPositions.push(...edges(entity.polygon, elevation + 0.035));
      if (kind === "lot" || kind === "support") {
        const pick = new THREE.Mesh(track(geometry), basic("#ffffff"));
        pick.userData.entityId = entity.id;
        pick.updateMatrixWorld();
        pickables.push(pick);
      } else geometry.dispose();
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(new THREE.Mesh(geometry, material));
    if (kind === "lot") lotGeometry = geometry;
    if (borderPositions.length) {
      const border = track(new THREE.BufferGeometry());
      border.setAttribute("position", new THREE.Float32BufferAttribute(borderPositions, 3));
      scene.add(
        new THREE.LineSegments(
          border,
          track(
            new THREE.LineBasicMaterial({ color: kind === "lot" ? PALETTE.lotEdge : "#a59c92" }),
          ),
        ),
      );
    }
  }

  const architectureEdges: number[] = [];
  const accessPositions: number[] = [];
  for (const entity of ENTITIES.filter((entry) => entry.kind === "pavilion")) {
    const h = entity.height ?? 3.2;
    const floor = new THREE.Mesh(track(polygonGeometry(entity.polygon, 0.08)), floorMaterial);
    const plinth = new THREE.Mesh(track(wallGeometry(entity.polygon, 0.08, 0.4)), trimMaterial);
    const shell = new THREE.Group();
    shell.add(new THREE.Mesh(track(wallGeometry(entity.polygon, 0.4, h)), wallMaterial));
    shell.add(new THREE.Mesh(track(polygonGeometry(entity.polygon, h + 0.02)), roofMaterial));
    const parapet = track(wallGeometry(entity.polygon, h, h + 0.16));
    shell.add(new THREE.Mesh(parapet, trimMaterial));
    scene.add(floor, plinth, shell);
    shells.set(entity.id, shell);
    architectureEdges.push(...edges(entity.polygon, 0.1));
    const pick = new THREE.Mesh(track(polygonGeometry(entity.polygon, h + 0.2)), basic("#ffffff"));
    pick.userData.entityId = entity.id;
    pick.updateMatrixWorld();
    pickables.push(pick);
    // Confirmed entry anchors are drawn as plum threshold strips on the floor.
    for (const access of entity.accesses ?? []) {
      const nearest = entity.polygon.reduce(
        (best, p, i) => {
          const q = entity.polygon[(i + 1) % entity.polygon.length];
          const dx = q[0] - p[0],
            dy = q[1] - p[1];
          const length = Math.hypot(dx, dy);
          const t = Math.max(
            0,
            Math.min(1, ((access[0] - p[0]) * dx + (access[1] - p[1]) * dy) / (length * length)),
          );
          const distance = Math.hypot(access[0] - p[0] - dx * t, access[1] - p[1] - dy * t);
          return distance < best.distance ? { distance, dx: dx / length, dy: dy / length } : best;
        },
        { distance: Infinity, dx: 1, dy: 0 },
      );
      const half = 1.1;
      const a: Point = [access[0] - nearest.dx * half, access[1] - nearest.dy * half];
      const b: Point = [access[0] + nearest.dx * half, access[1] + nearest.dy * half];
      const nx = -nearest.dy * 0.6,
        ny = nearest.dx * 0.6;
      const geometry = polygonGeometry(
        [
          [a[0] - nx, a[1] - ny],
          [b[0] - nx, b[1] - ny],
          [b[0] + nx, b[1] + ny],
          [a[0] + nx, a[1] + ny],
        ],
        0.13,
      );
      accessPositions.push(...geometry.getAttribute("position").array);
      geometry.dispose();
    }
  }
  const architecture = track(new THREE.BufferGeometry());
  architecture.setAttribute("position", new THREE.Float32BufferAttribute(architectureEdges, 3));
  scene.add(
    new THREE.LineSegments(
      architecture,
      track(new THREE.LineBasicMaterial({ color: PALETTE.plum })),
    ),
  );
  const accesses = track(new THREE.BufferGeometry());
  accesses.setAttribute("position", new THREE.Float32BufferAttribute(accessPositions, 3));
  scene.add(new THREE.Mesh(accesses, basic(PALETTE.plum)));

  const selectedGeometry = track(new THREE.BufferGeometry());
  const selectionPositions = new Float32Array(
    Math.max(...ENTITIES.map((entity) => entity.polygon.length)) * 6,
  );
  selectedGeometry.setAttribute("position", new THREE.BufferAttribute(selectionPositions, 3));
  selectedGeometry.setDrawRange(0, 0);
  const selectedLine = new THREE.LineSegments(
    selectedGeometry,
    track(new THREE.LineBasicMaterial({ color: "#4d1e3e", linewidth: 2 })),
  );
  selectedLine.renderOrder = 5;
  scene.add(selectedLine);

  // One small canvas atlas and one mesh, with CPU collision/priority only when a
  // draw is already needed. No per-label DOM nodes or individual text textures.
  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = atlasCanvas.height = 1024;
  const atlas = atlasCanvas.getContext("2d");
  if (!atlas) throw new Error("label-atlas-unavailable");
  const labelPositions: number[] = [],
    labelUVs: number[] = [];
  const labelEntities = [...ENTITIES].filter((entity) => entity.kind !== "landscape");
  labelEntities.sort(
    (a, b) =>
      (a.kind === "pavilion" ? 0 : a.kind === "road" ? 1 : a.kind === "support" ? 2 : 3) -
      (b.kind === "pavilion" ? 0 : b.kind === "road" ? 1 : b.kind === "support" ? 2 : 3),
  );
  const cellWidth = 256,
    cellHeight = 40;
  labelEntities.forEach((entity, index) => {
    const text =
      entity.kind === "lot"
        ? (entity.numbers ?? []).map((n) => String(n).padStart(2, "0")).join(" / ") || entity.label
        : (PAVILION_LABELS[entity.id] ?? entity.label);
    const row = Math.floor(index / 4),
      col = index % 4;
    if (row * cellHeight >= 1024) return;
    atlas.font = `${entity.kind === "lot" ? 600 : 700} ${entity.kind === "lot" ? 22 : 19}px sans-serif`;
    const measured = Math.min(240, atlas.measureText(text).width + 16);
    atlas.fillStyle = "rgba(253,250,246,0.94)";
    atlas.fillRect(
      col * cellWidth + (cellWidth - measured) / 2,
      row * cellHeight + 3,
      measured,
      34,
    );
    atlas.fillStyle = PALETTE.text;
    atlas.textAlign = "center";
    atlas.textBaseline = "middle";
    atlas.fillText(text, col * cellWidth + cellWidth / 2, row * cellHeight + 21, 230);
    const size = entity.kind === "lot" ? 1.8 : entity.kind === "pavilion" ? 7 : 6;
    const entityBounds = boundsOf(entity).box;
    const vertical = entity.kind === "road" && entityBounds.depth > entityBounds.width * 2.5;
    const labelWidth = (size * cellWidth) / cellHeight;
    const y = entity.kind === "pavilion" ? (entity.height ?? 3.2) + 0.23 : 0.23;
    const [x, z] = entity.anchor;
    const vertex = labelPositions.length / 3;
    labelPositions.push(
      x - labelWidth / 2,
      y,
      z - size / 2,
      x + labelWidth / 2,
      y,
      z - size / 2,
      x + labelWidth / 2,
      y,
      z + size / 2,
      x - labelWidth / 2,
      y,
      z + size / 2,
    );
    const u0 = col / 4,
      u1 = (col + 1) / 4,
      v0 = 1 - ((row + 1) * cellHeight) / 1024,
      v1 = 1 - (row * cellHeight) / 1024;
    labelUVs.push(u0, v1, u1, v1, u1, v0, u0, v0);
    labels.push({
      entity,
      text,
      size,
      width: labelWidth,
      height: size,
      vertex,
      vertical,
      textWidth: measured / cellWidth,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      priority:
        entity.kind === "pavilion"
          ? 1
          : entity.kind === "road"
            ? 2
            : entity.kind === "support"
              ? 3
              : 4,
    });
  });
  const labelTexture = track(new THREE.CanvasTexture(atlasCanvas));
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.minFilter = THREE.LinearFilter;
  labelTexture.generateMipmaps = false;
  const labelsGeometry = track(new THREE.BufferGeometry());
  labelsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(labelPositions, 3));
  labelsGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(labelUVs, 2));
  const labelIndices = new Uint16Array(labels.length * 6);
  labelsGeometry.setIndex(new THREE.BufferAttribute(labelIndices, 1));
  const labelsMesh = new THREE.Mesh(
    labelsGeometry,
    track(
      new THREE.MeshBasicMaterial({
        map: labelTexture,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
      }),
    ),
  );
  labelsMesh.renderOrder = 3;
  labelsMesh.frustumCulled = false;
  scene.add(labelsMesh);
  const collisionRects: { x: number; y: number; w: number; h: number }[] = [];
  const sortedLabels = [...labels];
  let labelSelection: string | null | undefined;
  function updateLabels() {
    const state = props();
    collisionRects.length = 0;
    if (labelSelection !== state.selectedId) {
      labelSelection = state.selectedId;
      sortedLabels.sort(
        (a, b) =>
          (a.entity.id === labelSelection ? 0 : a.priority) -
          (b.entity.id === labelSelection ? 0 : b.priority),
      );
    }
    let count = 0;
    for (const label of sortedLabels) {
      const { entity, vertex } = label;
      const y =
        entity.kind === "pavilion" && state.inspectedId !== entity.id
          ? (entity.height ?? 3.2) + 0.23
          : 0.23;
      const positions = labelsGeometry.getAttribute("position") as THREE.BufferAttribute;
      projection.set(entity.anchor[0], y, entity.anchor[1]).project(camera);
      if (
        projection.z > 1 ||
        projection.z < -1 ||
        Math.abs(projection.x) > 1.15 ||
        Math.abs(projection.y) > 1.15
      )
        continue;
      const px = ((projection.x + 1) * width) / 2,
        py = ((1 - projection.y) * height) / 2;
      const distance = camera.position.distanceTo(
        scratch.set(entity.anchor[0], y, entity.anchor[1]),
      );
      const selected = entity.id === state.selectedId;
      const worldUnitsPerPixel =
        (2 * Math.max(distance, 1) * Math.tan((camera.fov * Math.PI) / 360)) / height;
      const m = camera.matrixWorld.elements;
      const projectedAxis = label.vertical ? Math.hypot(m[0], m[4]) : Math.hypot(m[2], m[6]);
      const minText =
        entity.kind === "lot" ? (selected ? 12 : 0) : entity.kind === "pavilion" ? 12 : 10;
      const labelHeight = readableLabelSize(
        label.size,
        worldUnitsPerPixel,
        projectedAxis,
        (entity.kind === "lot" ? 22 : 19) / cellHeight,
        minText,
      );
      const labelWidth = (labelHeight * cellWidth) / cellHeight;
      const projectedHeight = (labelHeight / worldUnitsPerPixel) * projectedAxis;
      if (entity.kind === "lot" && !selected && (projectedHeight * 22) / cellHeight < 9) continue;
      const [anchorX, anchorY] = entity.anchor;
      if (label.vertical) {
        positions.setXYZ(vertex, anchorX + labelHeight / 2, y, anchorY - labelWidth / 2);
        positions.setXYZ(vertex + 1, anchorX + labelHeight / 2, y, anchorY + labelWidth / 2);
        positions.setXYZ(vertex + 2, anchorX - labelHeight / 2, y, anchorY + labelWidth / 2);
        positions.setXYZ(vertex + 3, anchorX - labelHeight / 2, y, anchorY - labelWidth / 2);
      } else {
        positions.setXYZ(vertex, anchorX - labelWidth / 2, y, anchorY - labelHeight / 2);
        positions.setXYZ(vertex + 1, anchorX + labelWidth / 2, y, anchorY - labelHeight / 2);
        positions.setXYZ(vertex + 2, anchorX + labelWidth / 2, y, anchorY + labelHeight / 2);
        positions.setXYZ(vertex + 3, anchorX - labelWidth / 2, y, anchorY + labelHeight / 2);
      }
      const rect = label.rect;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      // Project the actual atlas background, not the mostly transparent cell.
      for (let corner = 0; corner < 4; corner++) {
        const ox = ((corner === 0 || corner === 3 ? -1 : 1) * labelWidth * label.textWidth) / 2;
        const oz = ((corner < 2 ? -1 : 1) * labelHeight * 34) / cellHeight / 2;
        projection
          .set(anchorX + (label.vertical ? -oz : ox), y, anchorY + (label.vertical ? ox : oz))
          .project(camera);
        const sx = ((projection.x + 1) * width) / 2,
          sy = ((1 - projection.y) * height) / 2;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      rect.x = (minX + maxX) / 2;
      rect.y = (minY + maxY) / 2;
      rect.w = maxX - minX;
      rect.h = maxY - minY;
      let collides = false;
      if (!selected)
        for (const other of collisionRects) {
          if (
            Math.abs(other.x - rect.x) < (other.w + rect.w) / 2 + 3 &&
            Math.abs(other.y - rect.y) < (other.h + rect.h) / 2 + 3
          ) {
            collides = true;
            break;
          }
        }
      if (collides) continue;
      collisionRects.push(rect);
      labelIndices[count++] = vertex;
      labelIndices[count++] = vertex + 2;
      labelIndices[count++] = vertex + 1;
      labelIndices[count++] = vertex;
      labelIndices[count++] = vertex + 3;
      labelIndices[count++] = vertex + 2;
    }
    labelsGeometry.setDrawRange(0, count);
    labelsGeometry.index!.needsUpdate = true;
    labelsGeometry.getAttribute("position").needsUpdate = true;
  }

  let treeTrunks: THREE.InstancedMesh | null = null,
    treeCrowns: THREE.InstancedMesh | null = null;
  function addTrees() {
    if (disposed || failed) return;
    if (document.hidden || activePointers.size || transition) {
      optionalTask = window.setTimeout(addTrees, 100);
      return;
    }
    treeTrunks = new THREE.InstancedMesh(
      track(new THREE.CylinderGeometry(0.12, 0.17, 1.1, 5)),
      matte("#8d7865"),
      TREES.length,
    );
    treeCrowns = new THREE.InstancedMesh(
      track(new THREE.IcosahedronGeometry(1, 0)),
      matte("#8c9c73"),
      TREES.length,
    );
    const matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    for (let i = 0; i < TREES.length; i++) {
      const point = TREES[i];
      const size = 0.8 + (i % 4) * 0.13;
      matrix.compose(scratch.set(point[0], 0.5, point[1]), rotation, scale.set(1, 1, 1));
      treeTrunks.setMatrixAt(i, matrix);
      matrix.compose(
        scratch.set(point[0], 1.5, point[1]),
        rotation,
        scale.set(size, size * 0.8, size),
      );
      treeCrowns.setMatrixAt(i, matrix);
    }
    treeTrunks.instanceMatrix.needsUpdate = treeCrowns.instanceMatrix.needsUpdate = true;
    treeTrunks.count = treeCrowns.count = Math.floor(TREES.length * QUALITY[tier].trees);
    scene.add(treeTrunks, treeCrowns);
    invalidate();
  }

  function pose(): Pose {
    return { position: camera.position.clone(), target: controls.target.clone() };
  }
  function applyPose(next: Pose) {
    camera.position.copy(next.position);
    controls.target.copy(next.target);
    camera.lookAt(controls.target);
    controls.update();
  }
  function animate(to: Pose, duration: number) {
    if (
      transition &&
      transition.to.position.distanceToSquared(to.position) < 0.001 &&
      transition.to.target.distanceToSquared(to.target) < 0.001
    )
      return;
    if (
      !transition &&
      camera.position.distanceToSquared(to.position) < 0.001 &&
      controls.target.distanceToSquared(to.target) < 0.001
    )
      return;
    transition = {
      from: pose(),
      to,
      start: performance.now(),
      duration: reduceMotion.matches ? 0 : duration,
    };
    diag.cameraState = "transition";
    invalidate();
  }
  function freeRegionPose(
    center: Point,
    radius: number,
    view: MapView,
    box?: { width: number; depth: number; height: number },
  ) {
    const distance = Math.min(
      DIAGONAL * 6,
      Math.max(
        6,
        box
          ? framingBoxDistance(box, width, height, props().insets, view)
          : framingDistance(radius, width, height, props().insets),
      ),
    );
    const direction = new THREE.Vector3(...viewDirection(view)).normalize();
    const target = new THREE.Vector3(center[0], 0, center[1]);
    const position = target.clone().addScaledVector(direction, distance);
    // Shift the visual center to the center of the free region. The same delta
    // moves camera and target, preserving the orbit direction and useful scale.
    const screenRight = new THREE.Vector3().crossVectors(up, direction).normalize();
    const screenUp = new THREE.Vector3().crossVectors(direction, screenRight).normalize();
    const worldPerPixel =
      (distance * 2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, height);
    const shift = screenRight
      .multiplyScalar((props().insets.right * worldPerPixel) / 2)
      .addScaledVector(screenUp, (-props().insets.bottom * worldPerPixel) / 2);
    target.add(shift);
    position.add(shift);
    return { position, target };
  }
  function focus(id?: string) {
    const entity = id ? ENTITY_BY_ID.get(id) : undefined;
    const bounds = boundsOf(entity);
    animate(
      freeRegionPose(
        bounds.center,
        Math.max(bounds.radius, 3),
        props().inspectedId ? "top" : props().view,
        entity ? undefined : bounds.box,
      ),
      entity ? MOVEMENT.focusNearMs : MOVEMENT.focusFarMs,
    );
  }
  function clampTarget() {
    const minX = MAP_BOUNDS.minX,
      maxX = MAP_BOUNDS.maxX;
    const minY = MAP_BOUNDS.minY,
      maxY = MAP_BOUNDS.maxY;
    scratch.set(
      Math.max(minX, Math.min(maxX, controls.target.x)),
      0,
      Math.max(minY, Math.min(maxY, controls.target.z)),
    );
    scratch2.subVectors(scratch, controls.target);
    if (scratch2.lengthSq() > 0) {
      controls.target.add(scratch2);
      camera.position.add(scratch2);
    }
  }
  function invalidate() {
    if (!disposed && !failed && !document.hidden && !scheduled) {
      scheduled = requestAnimationFrame(draw);
      diag.activeLoops = 1;
    }
  }
  function draw(now: number) {
    scheduled = 0;
    diag.activeLoops = 0;
    if (disposed || failed || document.hidden) return;
    const begin = performance.now();
    if (!ready) {
      const live = props().readInitialTarget?.();
      if (live && Number.isFinite(live[0]) && Number.isFinite(live[1])) {
        const dx = live[0] - controls.target.x,
          dz = live[1] - controls.target.z;
        camera.position.x += dx;
        camera.position.z += dz;
        controls.target.x = live[0];
        controls.target.z = live[1];
        // Retain an initial selection's distance/view transition, but never let
        // its older pan target overwrite subsequent navigation in the SVG.
        if (transition) {
          rebasePoseTarget(transition.from, live);
          rebasePoseTarget(transition.to, live);
        }
        camera.lookAt(controls.target);
        controls.update();
      }
    }
    if (transition) {
      const progress = transition.duration
        ? Math.min(1, (now - transition.start) / transition.duration)
        : 1;
      const t = smoothStep(progress);
      camera.position.lerpVectors(transition.from.position, transition.to.position, t);
      controls.target.lerpVectors(transition.from.target, transition.to.target, t);
      camera.lookAt(controls.target);
      controls.update();
      if (progress === 1) {
        transition = null;
        diag.cameraState = "idle";
        if (pendingVisibilityCheck) keepSelectionVisible();
      }
    }
    clampTarget();
    camera.near = Math.max(
      0.05,
      Math.min(camera.position.distanceTo(controls.target) / 280, camera.position.y * 0.2),
    );
    camera.updateProjectionMatrix();
    updateLabels();
    try {
      renderer.render(scene, camera);
    } catch (error) {
      fail(error instanceof Error ? error.message : "screen-draw-failed");
      return;
    }
    frame++;
    diag.frames = frame;
    diag.drawCalls = renderer.info.render.calls;
    diag.triangles = renderer.info.render.triangles;
    diag.geometries = renderer.info.memory.geometries;
    diag.textures = renderer.info.memory.textures;
    diag.programs = renderer.info.programs?.length ?? 0;
    diag.target[0] = controls.target.x;
    diag.target[1] = controls.target.z;
    if (diag.lastSelectedId !== props().selectedId) {
      diag.lastSelectedId = props().selectedId;
      diag.selectionDrawAt = performance.now();
    }
    const active = activePointers.size > 0 || !!transition || now - lastActivity < 240;
    if (active && lastFrame) {
      const delta = now - lastFrame;
      if (props().quality === "auto") adaptiveSamples.push(delta);
      else adaptiveSamples.length = 0;
      if (diag.enabled) {
        diag.frameIntervals.push(delta);
        if (diag.frameIntervals.length > 2000) diag.frameIntervals.shift();
      }
      if (adaptiveSamples.length >= 60 && props().quality === "auto") {
        const mean =
          adaptiveSamples.reduce((sum, value) => sum + value, 0) / adaptiveSamples.length;
        const sorted = [...adaptiveSamples].sort((a, b) => a - b);
        const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
        slowWindows = mean > 33 || p95 > 50 ? slowWindows + 1 : 0;
        fastWindows = mean < 18 && p95 < 22 ? fastWindows + 1 : 0;
        diag.slowFrameWindows = slowWindows;
        diag.sampledFrameWindows++;
        if (shouldUseLightFallback(true, tier, slowWindows)) {
          fail("sustained-low-frame-rate");
          return;
        }
        if (now - lastQualityChange > MOVEMENT.qualityDwellMs) {
          const next = nextAdaptiveQuality(tier, slowWindows, fastWindows);
          if (next !== tier) {
            pendingTier = next;
            slowWindows = fastWindows = 0;
          }
        }
        adaptiveSamples.length = 0;
      }
    }
    lastFrame = active ? now : 0;
    if (diag.enabled) {
      diag.renderDurations.push(performance.now() - begin);
      if (diag.renderDurations.length > 2000) diag.renderDurations.shift();
    }
    if (
      !ready &&
      frame >= 3 &&
      renderer.info.render.calls > 0 &&
      props().canPresent?.() !== false
    ) {
      ready = true;
      diag.readyAt = performance.now();
      canvas.dataset.mapReady = "true";
      performance.mark("indumoveis-map:first-valid-draw");
      performance.mark("indumoveis-map:controls-ready");
      props().onReady();
      optionalTask = window.setTimeout(addTrees, 0);
    }
    if (
      pendingTier &&
      !activePointers.size &&
      !transition &&
      now - lastActivity >= MOVEMENT.qualitySettleMs
    ) {
      applyQuality(pendingTier);
      pendingTier = null;
    }
    if (transition || !ready || active || pendingTier) invalidate();
    else diag.cameraState = "idle";
  }
  function applyQuality(next: QualityTier) {
    tier = next;
    diag.tier = tier;
    lastQualityChange = performance.now();
    slowWindows = fastWindows = 0;
    adaptiveSamples.length = 0;
    diag.slowFrameWindows = 0;
    if (treeCrowns && treeTrunks)
      treeCrowns.count = treeTrunks.count = Math.floor(TREES.length * QUALITY[tier].trees);
    resizeBuffer();
  }
  function resizeBuffer() {
    const dpr = resolvePixelRatio(width, height, window.devicePixelRatio, tier);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    diag.dpr = dpr;
    diag.buffer = [canvas.width, canvas.height];
    invalidate();
  }
  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((clientY - rect.top) / rect.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    return (
      (raycaster.intersectObjects(pickables, false)[0]?.object.userData.entityId as
        string | undefined) ?? null
    );
  }
  function cancelTransition() {
    transition = null;
    lastActivity = performance.now();
    diag.cameraState = "manual";
  }
  function pointerDown(event: PointerEvent) {
    cancelTransition();
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType === "touch",
      candidate: event.button === 0 ? pick(event.clientX, event.clientY) : null,
    });
    clickCancelled = activePointers.size > 1;
  }
  function pointerMove(event: PointerEvent) {
    const initial = activePointers.get(event.pointerId);
    if (initial && !isClick(initial, event.clientX, event.clientY)) clickCancelled = true;
    if (initial) {
      lastActivity = performance.now();
      invalidate();
    }
  }
  function pointerUp(event: PointerEvent) {
    const initial = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (
      initial &&
      !clickCancelled &&
      isClick(initial, event.clientX, event.clientY) &&
      initial.candidate &&
      initial.candidate === pick(event.clientX, event.clientY)
    )
      props().onSelect(initial.candidate);
    if (!activePointers.size) {
      clickCancelled = false;
      lastActivity = performance.now();
      invalidate();
    }
  }
  let cancelling = false;
  function cancelPointers() {
    if (cancelling) return;
    cancelling = true;
    const entries = [...activePointers];
    activePointers.clear();
    clickCancelled = true;
    for (const [pointerId, state] of entries)
      canvas.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          pointerId,
          pointerType: state.touch ? "touch" : "mouse",
        }),
      );
    cancelTransition();
    lastFrame = 0;
    adaptiveSamples.length = 0;
    cancelling = false;
  }
  function pointerCancelled(event: PointerEvent) {
    if (activePointers.has(event.pointerId)) cancelPointers();
  }
  function lostCapture(event: PointerEvent) {
    if (activePointers.has(event.pointerId)) cancelPointers();
  }
  function wheel(event: WheelEvent) {
    // OrbitControls owns pointer gestures; this small wheel transition smooths
    // normalized trackpad/line deltas without a queue or a long inertial tail.
    event.preventDefault();
    event.stopImmediatePropagation();
    const base = transition?.to ?? pose();
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    const anchored = raycaster.ray.intersectPlane(groundPlane, wheelAnchor);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
    const distance = base.position.distanceTo(base.target);
    const nextDistance = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, distance * Math.exp(delta * 0.0015)),
    );
    const ratio = nextDistance / distance;
    const anchor = anchored ?? base.target;
    const next = {
      position: base.position.clone().sub(anchor).multiplyScalar(ratio).add(anchor),
      target: base.target.clone().sub(anchor).multiplyScalar(ratio).add(anchor),
    };
    lastActivity = performance.now();
    animate(next, MOVEMENT.wheelMs);
  }
  function controlsChanged() {
    lastActivity = performance.now();
    invalidate();
  }
  function onVisibility() {
    cancelPointers();
    if (document.hidden) {
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = 0;
    } else {
      lastFrame = 0;
      invalidate();
    }
  }
  function fail(reason: string) {
    if (failed || disposed) return;
    failed = true;
    diag.failureReason = reason;
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    cancelPointers();
    props().onFailure(reason);
  }
  function contextLost(event: Event) {
    event.preventDefault();
    diag.contextLosses++;
    fail("webgl-context-lost");
  }

  canvas.addEventListener("pointerdown", pointerDown, true);
  canvas.addEventListener("pointermove", pointerMove, true);
  window.addEventListener("pointerup", pointerUp, true);
  canvas.addEventListener("pointercancel", pointerCancelled, true);
  canvas.addEventListener("lostpointercapture", lostCapture, true);
  canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
  canvas.addEventListener("webglcontextlost", contextLost);
  window.addEventListener("blur", cancelPointers);
  document.addEventListener("visibilitychange", onVisibility);
  controls.addEventListener("change", controlsChanged);
  function removeListeners() {
    controls.removeEventListener("change", controlsChanged);
    canvas.removeEventListener("pointerdown", pointerDown, true);
    canvas.removeEventListener("pointermove", pointerMove, true);
    window.removeEventListener("pointerup", pointerUp, true);
    canvas.removeEventListener("pointercancel", pointerCancelled, true);
    canvas.removeEventListener("lostpointercapture", lostCapture, true);
    canvas.removeEventListener("wheel", wheel, true);
    canvas.removeEventListener("webglcontextlost", contextLost);
    window.removeEventListener("blur", cancelPointers);
    document.removeEventListener("visibilitychange", onVisibility);
    if (scheduled) cancelAnimationFrame(scheduled);
    window.clearTimeout(optionalTask);
  }
  rollback.push(removeListeners);
  const observer = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (!box || box.width < 1 || box.height < 1) return;
    const oldWidth = width,
      oldHeight = height;
    width = Math.round(box.width);
    height = Math.round(box.height);
    if (width === oldWidth && height === oldHeight) return;
    resizeBuffer();
    // Preserve the target on sidebar/orientation changes; only move a selected
    // item if the new free region actually hides it.
    keepSelectionVisible();
  });
  observer.observe(host);
  rollback.push(() => observer.disconnect());

  function keepSelectionVisible() {
    const selected = props().selectedId ? ENTITY_BY_ID.get(props().selectedId!) : undefined;
    if (!selected || (!ready && props().readInitialTarget)) {
      pendingVisibilityCheck = false;
      return;
    }
    if (activePointers.size) return;
    if (transition) {
      pendingVisibilityCheck = true;
      return;
    }
    pendingVisibilityCheck = false;
    projection.set(selected.anchor[0], 0, selected.anchor[1]).project(camera);
    const px = ((projection.x + 1) * width) / 2,
      py = ((1 - projection.y) * height) / 2;
    if (
      px < 28 ||
      px > width - props().insets.right - 28 ||
      py < 44 ||
      py > height - props().insets.bottom - 28
    )
      focus(selected.id);
  }
  function update() {
    const state = props();
    controls.mouseButtons.LEFT =
      state.view === "top" || state.gesture === "move" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE =
      state.view === "top" || state.gesture === "move" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO =
      state.view === "top" || state.gesture === "rotate"
        ? THREE.TOUCH.DOLLY_PAN
        : THREE.TOUCH.DOLLY_ROTATE;
    controls.enableRotate = state.view !== "top" && !state.inspectedId;
    for (const [id, shell] of shells) shell.visible = state.inspectedId !== id;
    const inspectionChanged = state.inspectedId !== previousInspected;
    if (inspectionChanged) {
      if (state.inspectedId) {
        if (!previousInspected) exteriorPose = pose();
        focus(state.inspectedId);
      } else if (exteriorPose) {
        animate(exteriorPose, MOVEMENT.viewMs);
        exteriorPose = null;
      }
      previousInspected = state.inspectedId;
    }
    if (!inspectionChanged && !state.inspectedId && state.view !== previousView) {
      const distance = camera.position.distanceTo(controls.target);
      const direction = new THREE.Vector3(
        ...viewDirection(state.inspectedId ? "top" : state.view),
      ).normalize();
      animate(
        {
          position: controls.target.clone().addScaledVector(direction, distance),
          target: controls.target.clone(),
        },
        MOVEMENT.viewMs,
      );
    }
    previousView = state.view;
    if (state.quality !== previousQuality) {
      pendingTier =
        state.quality === "auto"
          ? initialQuality(memory, navigator.hardwareConcurrency)
          : state.quality;
      previousQuality = state.quality;
      slowWindows = fastWindows = 0;
      adaptiveSamples.length = 0;
      diag.slowFrameWindows = 0;
    }
    const selected = state.selectedId ? ENTITY_BY_ID.get(state.selectedId) : undefined;
    const selection = selected
      ? edges(
          selected.polygon,
          selected.kind === "pavilion" && state.inspectedId !== selected.id
            ? (selected.height ?? 3.2) + 0.25
            : 0.2,
        )
      : [];
    selectionPositions.fill(0);
    selectionPositions.set(selection);
    selectedGeometry.getAttribute("position").needsUpdate = true;
    selectedGeometry.setDrawRange(0, selection.length / 3);
    selectedGeometry.computeBoundingSphere();
    if (lotGeometry) {
      const colors = lotGeometry.getAttribute("color") as THREE.BufferAttribute;
      for (const [id, [start, count]] of lotRanges) {
        const color = new THREE.Color(
          id === state.selectedId
            ? "#c5a7b8"
            : state.highlightedIds.includes(id)
              ? "#d5c69c"
              : statusColor(state.statuses[id]),
        );
        for (let i = start; i < start + count; i++) colors.setXYZ(i, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    }
    if (previousSelection !== state.selectedId) pendingVisibilityCheck = false;
    if (state.insets.right !== previousInsetRight || state.insets.bottom !== previousInsetBottom)
      keepSelectionVisible();
    previousInsetRight = state.insets.right;
    previousInsetBottom = state.insets.bottom;
    previousSelection = state.selectedId;
    invalidate();
  }

  resizeBuffer();
  const overview = freeRegionPose(CENTER, DIAGONAL / 2, props().view, {
    width: WIDTH,
    depth: DEPTH,
    height: 4.1,
  });
  if (props().initialFocus) {
    const focusTarget = props().initialFocus!;
    const shift = new THREE.Vector3(focusTarget[0] - CENTER[0], 0, focusTarget[1] - CENTER[1]);
    overview.position.add(shift);
    overview.target.add(shift);
  }
  applyPose(overview);
  update();
  performance.mark("indumoveis-map:essential-prepared");
  invalidate();

  return {
    focus,
    zoom(factor) {
      const base = transition?.to;
      const next = base ? { position: base.position.clone(), target: base.target.clone() } : pose();
      scratch.subVectors(next.position, next.target);
      scratch.setLength(
        Math.max(
          controls.minDistance,
          Math.min(controls.maxDistance, scratch.length() / Math.max(0.1, factor)),
        ),
      );
      next.position.copy(next.target).add(scratch);
      animate(next, MOVEMENT.zoomMs);
    },
    pan(dx, dy) {
      cancelTransition();
      const range = camera.position.distanceTo(controls.target) * 0.08;
      scratch.set(dx * range, 0, dy * range);
      camera.position.add(scratch);
      controls.target.add(scratch);
      controls.update();
      clampTarget();
      invalidate();
    },
    rotate(direction) {
      if (!controls.enableRotate) return;
      const base = transition?.to;
      const next = base ? { position: base.position.clone(), target: base.target.clone() } : pose();
      scratch.subVectors(next.position, next.target).applyAxisAngle(up, (direction * Math.PI) / 8);
      next.position.copy(next.target).add(scratch);
      animate(next, MOVEMENT.zoomMs);
    },
    getTarget: () => [controls.target.x, controls.target.z],
    restoreOverview: () => focus(),
    update,
    dispose() {
      disposed = true;
      diag.active = false;
      diag.contextCount = 0;
      observer.disconnect();
      if (scheduled) cancelAnimationFrame(scheduled);
      diag.activeLoops = 0;
      diag.activeContexts = 0;
      window.clearTimeout(optionalTask);
      removeListeners();
      controls.dispose();
      treeTrunks?.dispose();
      treeCrowns?.dispose();
      for (const resource of resources) resource.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      // Retain only a resource-free terminal count for cleanup assertions.
      diag.project = () => null;
      diag.loseContext = () => {};
      diag.resetSamples = () => {};
      performance.mark("indumoveis-map:renderer-disposed");
    },
  };
}
