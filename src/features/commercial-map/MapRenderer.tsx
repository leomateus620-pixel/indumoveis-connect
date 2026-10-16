import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createReflectionEnvironment } from "./reflectionEnvironment";
import { createSurfaceMaterials } from "./surfaceMaterials";
import { createVegetation } from "./vegetation";
import { VISUAL_THEME as PALETTE, COMMERCIAL_STATUS_COLORS } from "./visualTheme";
import {
  STREET_LABEL,
  isWalkway,
  projectedTextMetrics,
  streetLabelCorridor,
  streetLabelPresentation,
  streetLabelVisible,
} from "./labelPolicy";
import { ENTITIES, MAP_BOUNDS, type MapEntity, type Point } from "./data/territory";
import {
  framingDistance,
  framingBoxDistance,
  initialQuality,
  isClick,
  MOVEMENT,
  nextAdaptiveQuality,
  resolvePixelRatio,
  readableLabelSize,
  shouldUseLightFallback,
  smoothStep,
  viewDirection,
  type QualityTier,
} from "./navigation";
import type { MapHandle, MapRendererProps, MapView } from "./types";
import { createPavement } from "./pavement";
import {
  buildArchitecture,
  getArchitectureDefinition,
  architectureVisualHeight,
} from "./architecture";

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
  environmentBytes: number;
  environmentPeakBytes: number;
  ambientFrames: number;
  optionalFailures: string[];
  labels: { id: string; scale: number; visible: boolean; textHeightPx: number }[];
  dpr: number;
  buffer: [number, number];
  tier: QualityTier;
  cameraState: "idle" | "manual" | "transition";
  target: Point;
  position: [number, number, number];
  distance: number;
  polar: number;
  azimuth: number;
  inspectedId: string | null;
  readyAt?: number;
  frameIntervals: number[];
  renderDurations: number[];
  contextLosses: number;
  failureReason?: string;
  slowFrameWindows: number;
  sampledFrameWindows: number;
  selectionDrawAt?: number;
  lastSelectedId?: string | null;
  project(id: string, heightFraction?: number): { x: number; y: number } | null;
  resetSamples(): void;
  loseContext(): void;
  /** Deterministic lab captures only; never used by product controls. */
  setReferencePose(position: [number, number, number], target: Point): void;
};

declare global {
  interface Window {
    __indumoveisMap?: Diagnostic;
  }
}

const ENTITY_BY_ID = new Map(ENTITIES.map((entity) => [entity.id, entity]));
const STREET_CORRIDORS = new Map(
  ENTITIES.filter((entity) => entity.kind === "road").map((entity) => [
    entity.id,
    streetLabelCorridor(entity, ENTITIES),
  ]),
);
function isGroundReference(entity: MapEntity) {
  return (
    entity.kind === "road" || (entity.kind === "support" && !getArchitectureDefinition(entity))
  );
}
const GROUND_REFERENCE_CORRIDORS = new Map(
  ENTITIES.filter((entity) => isGroundReference(entity) && entity.kind !== "road").map((entity) => {
    const box = boundsOf(entity).box;
    return [
      entity.id,
      { length: Math.max(0, box.width - 0.64), width: Math.max(0, box.depth - 0.64) },
    ];
  }),
);
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
    radius: Math.hypot(maxX - minX, maxY - minY, entity ? architectureVisualHeight(entity) : 0) / 2,
    box: {
      width: maxX - minX,
      depth: maxY - minY,
      height: entity ? architectureVisualHeight(entity) : 0,
    },
  };
}

function statusColor(status?: string) {
  return COMMERCIAL_STATUS_COLORS[status?.toLowerCase() ?? ""] ?? PALETTE.lot;
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
    props.viewRevision,
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
  controls.maxPolarAngle = Math.PI * 0.46;
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
  let environmentTask = 0,
    ambientTimer = 0;
  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  let environmentAttempted = false;
  let vegetation: ReturnType<typeof createVegetation> | null = null;
  let ambientDisabled = false;
  let ambientSlowFrames = 0;
  type CameraAction = "focus" | "view" | "wheel" | "zoom" | "rotate";
  let transition: {
    from: Pose;
    to: Pose;
    start: number;
    duration: number;
    kind: CameraAction;
  } | null = null;
  let exteriorPose: Pose | null = null;
  let focusedBuilding: MapEntity | undefined;
  let inspectionInterruptedTarget: Point | null = null;
  let previousInspected = props().inspectedId;
  let previousView = props().view;
  let previousViewRevision = props().viewRevision;
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
  let manualPolar = 0,
    manualAzimuth = 0,
    manualOrientationReported = false;
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
  rollback.push(() => {
    for (const resource of resources) resource.dispose();
    scene.clear();
  });
  const pickables: THREE.Mesh[] = [];
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
    textHeight: number;
    visible: boolean;
    scale: number;
    textHeightPx: number;
    drawn: boolean;
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
    environmentBytes: 0,
    environmentPeakBytes: 0,
    ambientFrames: 0,
    optionalFailures: [],
    labels: [],
    dpr: 1,
    buffer: [0, 0],
    tier,
    cameraState: "idle",
    target: [...CENTER],
    position: [0, 0, 0],
    distance: 0,
    polar: 0,
    azimuth: 0,
    inspectedId: null,
    frameIntervals: [],
    renderDurations: [],
    contextLosses: 0,
    slowFrameWindows: 0,
    sampledFrameWindows: 0,
    project(id, heightFraction = 1) {
      const entity = ENTITY_BY_ID.get(id);
      if (!entity) return null;
      projection
        .set(
          entity.anchor[0],
          architectureVisualHeight(entity) * heightFraction + 0.2,
          entity.anchor[1],
        )
        .project(camera);
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
    setReferencePose(position, target) {
      if (!diag.enabled || !position.every(Number.isFinite) || !target.every(Number.isFinite))
        return;
      cancelTransition();
      applyPose({
        position: new THREE.Vector3(...position),
        target: new THREE.Vector3(target[0], 0, target[1]),
      });
      invalidate();
    },
  };
  window.__indumoveisMap = diag;
  rollback.push(() => {
    diag.active = false;
    diag.activeContexts = diag.contextCount = diag.activeLoops = 0;
    diag.project = () => null;
    diag.loseContext = () => {};
    diag.setReferencePose = () => {};
    diag.resetSamples = () => {};
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
  const presentationParams = new URLSearchParams(window.location.search);
  const surfaces = createSurfaceMaterials({
    maps: !(diag.enabled && presentationParams.get("mapSurfaceMaps") === "off"),
  });
  surfaces.setQuality(tier);
  diag.textureBytes += surfaces.textureBytes;
  rollback.push(() => surfaces.dispose());
  const groundMaterial = matte(PALETTE.ground);
  scene.add(new THREE.HemisphereLight("#edf4ff", "#b8bca8", 1.55));
  const sunlight = new THREE.DirectionalLight("#fff1dc", 2.15);
  sunlight.position.set(-70, 140, 70);
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight("#dbe8f5", 0.55);
  fill.position.set(80, 60, -110);
  scene.add(fill);
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
  const pavement = createPavement(ENTITIES, surfaces);
  scene.add(pavement.group);
  pavement.resources.forEach(track);
  diag.textureBytes += pavement.textureBytes;
  // Picking remains attached to the original surfaces despite network batching.
  for (const entity of ENTITIES.filter((entry) => entry.kind === "road")) {
    const pickMesh = new THREE.Mesh(
      track(polygonGeometry(entity.polygon, -0.02)),
      basic("#ffffff"),
    );
    pickMesh.userData.entityId = entity.id;
    pickMesh.updateMatrixWorld();
    pickables.push(pickMesh);
  }
  for (const kind of ["landscape", "lot", "support"] as const) {
    const positions: number[] = [],
      colors: number[] = [],
      borderPositions: number[] = [];
    for (const entity of ENTITIES.filter(
      (entry) => entry.kind === kind && !(kind === "support" && getArchitectureDefinition(entry)),
    )) {
      const elevation = kind === "landscape" ? -0.08 : 0.05;
      const geometry = polygonGeometry(entity.polygon, elevation);
      const data = geometry.getAttribute("position").array;
      const start = positions.length / 3;
      positions.push(...data);
      const color = new THREE.Color(
        kind === "lot"
          ? statusColor(props().statuses[entity.id])
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

  const architecture = buildArchitecture(ENTITIES, surfaces);
  scene.add(architecture.group);
  pickables.push(...architecture.pickables);
  rollback.push(() => architecture.dispose());

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
  const selectionFillGeometry = track(new THREE.BufferGeometry());
  const selectionFillPositions = new Float32Array(
    Math.max(...ENTITIES.map((entity) => entity.polygon.length - 2)) * 9,
  );
  selectionFillGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(selectionFillPositions, 3),
  );
  selectionFillGeometry.setDrawRange(0, 0);
  const selectionFill = new THREE.Mesh(
    selectionFillGeometry,
    track(
      new THREE.MeshBasicMaterial({
        color: PALETTE.plum,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    ),
  );
  selectionFill.renderOrder = 4;
  selectionFill.frustumCulled = false;
  scene.add(selectionFill);

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
    const metrics = atlas.measureText(text);
    const street = entity.kind === "road";
    const groundReference = isGroundReference(entity);
    const glyphHeight = Math.ceil(
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    );
    const measured = Math.min(240, metrics.width + (groundReference ? 4 : 14));
    const glyphBand = groundReference ? glyphHeight + 2 : 30;
    if (!groundReference) {
      atlas.fillStyle = entity.kind === "lot" ? "rgba(251,250,245,0.78)" : "rgba(251,250,245,0.96)";
      atlas.beginPath();
      atlas.roundRect(
        col * cellWidth + (cellWidth - measured) / 2,
        row * cellHeight + 6,
        measured,
        30,
        5,
      );
      atlas.fill();
    }
    atlas.fillStyle = street && !isWalkway(entity) ? PALETTE.roadText : PALETTE.text;
    atlas.textAlign = "center";
    atlas.textBaseline = "middle";
    if (groundReference) {
      atlas.strokeStyle = !street || isWalkway(entity) ? "#f5f3ec" : PALETTE.roadHalo;
      atlas.lineWidth = 1.3;
      atlas.lineJoin = "round";
      atlas.strokeText(text, col * cellWidth + cellWidth / 2, row * cellHeight + 21, 230);
    }
    atlas.fillText(text, col * cellWidth + cellWidth / 2, row * cellHeight + 21, 230);
    const size = groundReference
      ? (STREET_LABEL.baseTextHeight * cellHeight) / glyphBand
      : entity.kind === "lot"
        ? 1.8
        : entity.kind === "pavilion"
          ? 7
          : 4.8;
    const entityBounds = boundsOf(entity).box;
    const vertical = entity.kind === "road" && entityBounds.depth > entityBounds.width * 2.5;
    const labelWidth = (size * cellWidth) / cellHeight;
    const y = getArchitectureDefinition(entity) ? architectureVisualHeight(entity) + 0.6 : 0.23;
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
      textHeight: glyphBand / cellHeight,
      visible: false,
      scale: 1,
      textHeightPx: 0,
      drawn: false,
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
      label.drawn = false;
      const { entity, vertex } = label;
      const building = !!getArchitectureDefinition(entity);
      const y = building ? architectureVisualHeight(entity) + 0.6 : 0.23;
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
      const projectedAxis = building
        ? 1
        : label.vertical
          ? Math.hypot(m[0], m[4])
          : Math.hypot(m[2], m[6]);
      const minText =
        entity.kind === "lot" ? (selected ? 12 : 0) : entity.kind === "pavilion" ? 12 : 10;
      let labelHeight = isGroundReference(entity)
        ? label.size
        : readableLabelSize(
            label.size,
            worldUnitsPerPixel,
            projectedAxis,
            (entity.kind === "lot" ? 22 : 19) / cellHeight,
            minText,
          );
      let labelWidth = (labelHeight * cellWidth) / cellHeight;
      const projectedHeight = (labelHeight / worldUnitsPerPixel) * projectedAxis;
      if (entity.kind === "lot" && !selected && (projectedHeight * 22) / cellHeight < 9) continue;
      const [anchorX, anchorY] = entity.anchor;
      // Buildings share the same atlas but face the camera above the ridge.
      // Ground labels keep the plant axis; flip 180 degrees when viewed backwards.
      const rx = building ? m[0] : label.vertical ? 0 : 1;
      const ry = building ? m[1] : 0;
      const rz = building ? m[2] : label.vertical ? 1 : 0;
      const ux = building ? m[4] : label.vertical ? 1 : 0;
      const uy = building ? m[5] : 0;
      const uz = building ? m[6] : label.vertical ? 0 : -1;
      const sign = building || rx * m[0] + rz * m[2] >= 0 ? 1 : -1;
      const projectText = (w: number, h: number) => {
        const corners: { x: number; y: number }[] = [];
        for (let corner = 0; corner < 4; corner++) {
          const ox = ((corner === 0 || corner === 3 ? -1 : 1) * w * label.textWidth) / 2;
          const oz = ((corner < 2 ? 1 : -1) * h * label.textHeight) / 2;
          projection
            .set(
              anchorX + (rx * ox + ux * oz) * sign,
              y + (ry * ox + uy * oz) * sign,
              anchorY + (rz * ox + uz * oz) * sign,
            )
            .project(camera);
          corners.push({
            x: ((projection.x + 1) * width) / 2,
            y: ((1 - projection.y) * height) / 2,
          });
        }
        return corners;
      };
      if (isGroundReference(entity)) {
        const wasVisible = label.visible;
        const natural = projectedTextMetrics(projectText(labelWidth, labelHeight));
        const corridor =
          STREET_CORRIDORS.get(entity.id) ?? GROUND_REFERENCE_CORRIDORS.get(entity.id)!;
        const presentation = streetLabelPresentation({
          naturalTextHeightPx: natural.height,
          naturalTextWidthPx: natural.width,
          worldTextWidth: labelWidth * label.textWidth,
          worldTextHeight: labelHeight * label.textHeight,
          corridorLength: corridor.length,
          corridorWidth: corridor.width,
          wasVisible,
          selected,
        });
        label.scale = presentation.scale;
        labelHeight *= presentation.scale;
        labelWidth *= presentation.scale;
        // Perspective division is not uniform across a ground rectangle. Reproject
        // the actual shrunken glyph band, then conservatively enforce the cap.
        for (let pass = 0; pass < 3; pass++) {
          const actual = projectedTextMetrics(projectText(labelWidth, labelHeight));
          label.textHeightPx = actual.height;
          if (actual.height <= STREET_LABEL.maxTextPixels) break;
          const correction = (STREET_LABEL.maxTextPixels / actual.height) * 0.998;
          labelHeight *= correction;
          labelWidth *= correction;
          label.scale *= correction;
        }
        // Depth changes across a long, ground-anchored word. The final glyph
        // can be much smaller than the initial linear estimate after capping.
        // Hysteresis must use that final projected size, never the old estimate.
        label.textHeightPx = projectedTextMetrics(projectText(labelWidth, labelHeight)).height;
        label.visible = streetLabelVisible(label.textHeightPx, wasVisible);
        if (!label.visible) continue;
      }
      for (let corner = 0; corner < 4; corner++) {
        const ox = (((corner === 0 || corner === 3 ? -1 : 1) * labelWidth) / 2) * sign;
        const oz = (((corner < 2 ? 1 : -1) * labelHeight) / 2) * sign;
        positions.setXYZ(
          vertex + corner,
          anchorX + rx * ox + ux * oz,
          y + ry * ox + uy * oz,
          anchorY + rz * ox + uz * oz,
        );
      }
      const rect = label.rect;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      // Project the actual atlas background, not the mostly transparent cell.
      for (let corner = 0; corner < 4; corner++) {
        const ox = ((corner === 0 || corner === 3 ? -1 : 1) * labelWidth * label.textWidth) / 2;
        const oz = ((corner < 2 ? 1 : -1) * labelHeight * label.textHeight) / 2;
        projection
          .set(
            anchorX + (rx * ox + ux * oz) * sign,
            y + (ry * ox + uy * oz) * sign,
            anchorY + (rz * ox + uz * oz) * sign,
          )
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
      label.drawn = true;
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
    if (diag.enabled)
      diag.labels = labels
        .filter((label) => isGroundReference(label.entity))
        .map((label) => ({
          id: label.entity.id,
          scale: label.scale,
          visible: label.drawn,
          textHeightPx: label.textHeightPx,
        }));
  }

  function addTrees() {
    optionalTask = 0;
    if (disposed || failed) return;
    if (document.hidden) return;
    if (activePointers.size || transition) {
      optionalTask = window.setTimeout(addTrees, 100);
      return;
    }
    try {
      vegetation = createVegetation();
      scene.add(vegetation.group);
      diag.textureBytes += vegetation.textureBytes;
      rollback.push(() => vegetation?.dispose());
    } catch {
      ambientDisabled = true;
      diag.optionalFailures.push("vegetation-preparation");
    }
    invalidate();
  }

  // Deferred optional reflection: first navigation already works with local
  // albedo + direct daylight. No remote asset or probe per building/frame.
  function prepareEnvironment() {
    environmentTask = 0;
    if (disposed || failed || tier === "light" || environmentAttempted) return;
    if (document.hidden) return;
    if (activePointers.size || transition) {
      environmentTask = window.setTimeout(prepareEnvironment, 250);
      return;
    }
    environmentAttempted = true;
    try {
      const environment = createReflectionEnvironment(renderer, {
        fail: diag.enabled && presentationParams.get("mapEnvironment") === "fail",
      });
      environmentTarget = environment.target;
      // Packed CubeUV LODs use the actual RGBA half-float target dimensions.
      // Source and scratch targets are already disposed; no depth target.
      diag.environmentBytes = environment.textureBytes;
      diag.environmentPeakBytes = environment.peakTextureBytes;
      diag.textureBytes += diag.environmentBytes;
      scene.environment = environmentTarget.texture;
      rollback.push(() => environmentTarget?.dispose());
    } catch {
      // Direct sun + sky fill and all semantic materials remain valid.
      environmentTarget?.dispose();
      environmentTarget = null;
      diag.optionalFailures.push("environment-preparation");
    }
    invalidate();
  }

  function scheduleAmbient() {
    window.clearTimeout(ambientTimer);
    if (
      disposed ||
      failed ||
      document.hidden ||
      reduceMotion.matches ||
      tier !== "detailed" ||
      ambientDisabled ||
      !vegetation
    )
      return;
    ambientTimer = window.setTimeout(() => {
      ambientTimer = 0;
      // Decorative cadence never enters the active-navigation sample window.
      invalidate();
    }, 1000 / 24);
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
  function animate(to: Pose, duration: number, kind: CameraAction = "focus") {
    // A header command can arrive from a second finger while the first is
    // dragging. End that pointer session before the automatic owner takes over.
    if (activePointers.size) cancelPointers();
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
      kind,
    };
    controls.minDistance = 0.1;
    controls.maxDistance = DIAGONAL * 6;
    diag.cameraState = "transition";
    invalidate();
  }
  function freeRegionPose(
    center: Point,
    radius: number,
    view: MapView,
    box?: { width: number; depth: number; height: number },
    currentDirection?: THREE.Vector3,
  ) {
    const distance = Math.min(
      DIAGONAL * 6,
      Math.max(
        6,
        box
          ? framingBoxDistance(
              box,
              width,
              height,
              props().insets,
              view,
              camera.fov,
              currentDirection?.toArray(),
            )
          : framingDistance(radius, width, height, props().insets),
      ),
    );
    const direction = currentDirection ?? new THREE.Vector3(...viewDirection(view)).normalize();
    const target = new THREE.Vector3(center[0], 0, center[1]);
    const position = target.clone().addScaledVector(direction, distance);
    // Shift the visual center to the center of the free region. The same delta
    // moves camera and target, preserving the orbit direction and useful scale.
    const screenRight = new THREE.Vector3().crossVectors(up, direction).normalize();
    const screenUp = new THREE.Vector3().crossVectors(direction, screenRight).normalize();
    // Pan on the ground while preserving the required screen displacement.
    // A vertical world shift would put the orbit target below the terrain and
    // be undone by its safety clamp at the end of a mobile-panel transition.
    const groundProjection = Math.max(0.01, screenUp.x ** 2 + screenUp.z ** 2);
    screenUp.set(screenUp.x / groundProjection, 0, screenUp.z / groundProjection);
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
    focusedBuilding = entity && getArchitectureDefinition(entity) ? entity : undefined;
    const bounds = boundsOf(entity);
    animate(
      freeRegionPose(
        bounds.center,
        Math.max(bounds.radius, 3),
        props().view,
        entity ? undefined : bounds.box,
        ready
          ? new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
          : undefined,
      ),
      entity ? MOVEMENT.focusNearMs : MOVEMENT.focusFarMs,
    );
  }
  function clampTarget() {
    const inspected = props().inspectedId ? ENTITY_BY_ID.get(props().inspectedId!) : undefined;
    const b = boundsOf(inspected);
    // A contextual margin keeps navigation recoverable without a hard wall at
    // the cadastral outline. Inspection retains useful room around its building.
    const margin = inspected ? Math.max(b.box.width, b.box.depth) * 0.65 : DIAGONAL * 0.22;
    const minX = inspected ? b.center[0] - b.box.width / 2 - margin : MAP_BOUNDS.minX - margin,
      maxX = inspected ? b.center[0] + b.box.width / 2 + margin : MAP_BOUNDS.maxX + margin;
    const minY = inspected ? b.center[1] - b.box.depth / 2 - margin : MAP_BOUNDS.minY - margin,
      maxY = inspected ? b.center[1] + b.box.depth / 2 + margin : MAP_BOUNDS.maxY + margin;
    scratch.set(
      Math.max(
        inspectionInterruptedTarget ? Math.min(minX, inspectionInterruptedTarget[0]) : minX,
        Math.min(
          inspectionInterruptedTarget ? Math.max(maxX, inspectionInterruptedTarget[0]) : maxX,
          controls.target.x,
        ),
      ),
      0,
      Math.max(
        inspectionInterruptedTarget ? Math.min(minY, inspectionInterruptedTarget[1]) : minY,
        Math.min(
          inspectionInterruptedTarget ? Math.max(maxY, inspectionInterruptedTarget[1]) : maxY,
          controls.target.z,
        ),
      ),
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
      controls.target.lerpVectors(transition.from.target, transition.to.target, t);
      // Interpolate orbit coordinates, not a chord through the building/ground
      // when presets cross opposite sides of the target.
      const from = new THREE.Spherical().setFromVector3(
        scratch.subVectors(transition.from.position, transition.from.target),
      );
      const to = new THREE.Spherical().setFromVector3(
        scratch.subVectors(transition.to.position, transition.to.target),
      );
      const angle = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
      scratch.setFromSpherical(
        new THREE.Spherical(
          THREE.MathUtils.lerp(from.radius, to.radius, t),
          THREE.MathUtils.lerp(from.phi, to.phi, t),
          from.theta + angle * t,
        ),
      );
      camera.position.copy(controls.target).add(scratch);
      camera.lookAt(controls.target);
      controls.update();
      if (progress === 1) {
        transition = null;
        navigationLimits();
        diag.cameraState = "idle";
        if (pendingVisibilityCheck) keepSelectionVisible();
      }
    }
    if (!transition) clampTarget();
    const navigationActive = activePointers.size > 0 || !!transition || now - lastActivity < 240;
    vegetation?.animate(
      now / 1000,
      tier === "detailed" && !reduceMotion.matches && !ambientDisabled,
    );
    surfaces.updateDetail(camera.position.distanceTo(controls.target));
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
    camera.position.toArray(diag.position);
    diag.distance = camera.position.distanceTo(controls.target);
    diag.polar = controls.getPolarAngle();
    diag.azimuth = controls.getAzimuthalAngle();
    diag.inspectedId = props().inspectedId;
    if (diag.lastSelectedId !== props().selectedId) {
      diag.lastSelectedId = props().selectedId;
      diag.selectionDrawAt = performance.now();
    }
    const active = navigationActive;
    if (!active && tier === "detailed" && !reduceMotion.matches && !ambientDisabled)
      diag.ambientFrames++;
    if (active && lastFrame) {
      const delta = now - lastFrame;
      ambientSlowFrames = delta > 50 ? ambientSlowFrames + 1 : 0;
      if (ambientSlowFrames >= 8) ambientDisabled = true;
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
        if (p95 > 35) ambientDisabled = true;
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
      if (tier !== "light") environmentTask = window.setTimeout(prepareEnvironment, 350);
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
    else {
      diag.cameraState = "idle";
      scheduleAmbient();
    }
  }
  function applyQuality(next: QualityTier) {
    tier = next;
    diag.tier = tier;
    lastQualityChange = performance.now();
    slowWindows = fastWindows = 0;
    adaptiveSamples.length = 0;
    diag.slowFrameWindows = 0;
    surfaces.setQuality(tier);
    scene.environment = tier === "light" ? null : (environmentTarget?.texture ?? null);
    if (tier !== "light" && !environmentAttempted && !environmentTask)
      environmentTask = window.setTimeout(prepareEnvironment, 350);
    window.clearTimeout(ambientTimer);
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
    if (transition && props().inspectedId)
      inspectionInterruptedTarget = [controls.target.x, controls.target.z];
    transition = null;
    navigationLimits();
    lastActivity = performance.now();
    diag.cameraState = "manual";
  }
  function pointerDown(event: PointerEvent) {
    cancelTransition();
    if (!activePointers.size) {
      manualPolar = controls.getPolarAngle();
      manualAzimuth = controls.getAzimuthalAngle();
      manualOrientationReported = false;
    }
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
    if (initial && !isClick(initial, event.clientX, event.clientY)) {
      clickCancelled = true;
    }
    if (initial) {
      lastActivity = performance.now();
      invalidate();
    } else if (event.pointerType === "mouse") {
      canvas.style.cursor = pick(event.clientX, event.clientY) ? "pointer" : "grab";
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
    // Only a previous wheel destination may accumulate wheel input. A preset
    // or focus animation is interrupted at its visible pose.
    if (activePointers.size) return;
    const base = transition?.kind === "wheel" ? transition.to : pose();
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
      distanceLimits().min,
      Math.min(distanceLimits().max, distance * Math.exp(delta * 0.0015)),
    );
    const ratio = nextDistance / distance;
    const anchor = anchored ?? base.target;
    const next = {
      position: base.position.clone().sub(anchor).multiplyScalar(ratio).add(anchor),
      target: base.target.clone().sub(anchor).multiplyScalar(ratio).add(anchor),
    };
    lastActivity = performance.now();
    animate(next, MOVEMENT.wheelMs, "wheel");
  }
  function controlsChanged() {
    if (
      activePointers.size &&
      !transition &&
      !manualOrientationReported &&
      (Math.abs(controls.getPolarAngle() - manualPolar) > 0.0001 ||
        Math.abs(controls.getAzimuthalAngle() - manualAzimuth) > 0.0001)
    ) {
      manualOrientationReported = true;
      props().onManualOrientation?.();
    }
    lastActivity = performance.now();
    invalidate();
  }
  function onVisibility() {
    cancelPointers();
    if (document.hidden) {
      window.clearTimeout(ambientTimer);
      window.clearTimeout(optionalTask);
      window.clearTimeout(environmentTask);
      optionalTask = environmentTask = 0;
      if (scheduled) cancelAnimationFrame(scheduled);
      scheduled = 0;
    } else {
      lastFrame = 0;
      if (ready && !vegetation && !ambientDisabled) optionalTask = window.setTimeout(addTrees, 0);
      if (ready && tier !== "light" && !environmentAttempted)
        environmentTask = window.setTimeout(prepareEnvironment, 350);
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
  reduceMotion.addEventListener("change", invalidate);
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
    reduceMotion.removeEventListener("change", invalidate);
    if (scheduled) cancelAnimationFrame(scheduled);
    window.clearTimeout(optionalTask);
    window.clearTimeout(environmentTask);
    window.clearTimeout(ambientTimer);
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
    const points = getArchitectureDefinition(selected)
      ? selected.polygon.flatMap(([x, z]) => [
          new THREE.Vector3(x, 0, z),
          new THREE.Vector3(x, architectureVisualHeight(selected) + 0.6, z),
        ])
      : [new THREE.Vector3(selected.anchor[0], 0, selected.anchor[1])];
    const hidden = points.some((point) => {
      point.project(camera);
      const px = ((point.x + 1) * width) / 2,
        py = ((1 - point.y) * height) / 2;
      return (
        point.z > 1 ||
        point.z < -1 ||
        px < 28 ||
        px > width - props().insets.right - 28 ||
        py < 16 ||
        py > height - props().insets.bottom - 28
      );
    });
    if (hidden) focus(selected.id);
  }
  function distanceLimits() {
    const inspected = props().inspectedId ? ENTITY_BY_ID.get(props().inspectedId!) : undefined;
    const b = boundsOf(inspected);
    const limits = {
      min: inspected
        ? Math.max(3, Math.min(b.box.width, b.box.depth) * 0.22)
        : focusedBuilding
          ? Math.max(5, boundsOf(focusedBuilding).radius * 1.1)
          : 5,
      max: inspected ? Math.max(b.radius * 9, 70) : DIAGONAL * 6,
    };
    // An interrupted flight may be outside the new building range. All inputs
    // share that visible boundary and converge back to the contextual limits
    // instead of snapping or allowing extra travel away from the building.
    const current = camera.position.distanceTo(controls.target);
    return { min: Math.min(limits.min, current || limits.min), max: Math.max(limits.max, current) };
  }
  function navigationLimits() {
    const limits = distanceLimits();
    controls.minDistance = limits.min;
    controls.maxDistance = limits.max;
  }
  function update() {
    const state = props();
    controls.mouseButtons.LEFT = state.gesture === "move" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    controls.touches.ONE = state.gesture === "move" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.enableRotate = true;
    if (!transition) navigationLimits();
    for (const [id, roof] of architecture.roofs) roof.visible = state.inspectedId !== id;
    const inspectionChanged = state.inspectedId !== previousInspected;
    if (inspectionChanged) {
      inspectionInterruptedTarget = null;
      if (state.inspectedId) {
        if (!previousInspected) exteriorPose = pose();
        focus(state.inspectedId);
      } else if (exteriorPose) {
        animate(exteriorPose, MOVEMENT.viewMs, "view");
        exteriorPose = null;
      }
      previousInspected = state.inspectedId;
    }
    if (
      !inspectionChanged &&
      (state.view !== previousView || state.viewRevision !== previousViewRevision)
    ) {
      const distance = camera.position.distanceTo(controls.target);
      const direction = new THREE.Vector3(...viewDirection(state.view)).normalize();
      animate(
        {
          position: controls.target.clone().addScaledVector(direction, distance),
          target: controls.target.clone(),
        },
        MOVEMENT.viewMs,
        "view",
      );
    }
    previousView = state.view;
    previousViewRevision = state.viewRevision;
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
          getArchitectureDefinition(selected) && state.inspectedId !== selected.id
            ? architectureVisualHeight(selected) + 0.3
            : 0.2,
        )
      : [];
    selectionPositions.fill(0);
    selectionPositions.set(selection);
    selectedGeometry.getAttribute("position").needsUpdate = true;
    selectedGeometry.setDrawRange(0, selection.length / 3);
    selectedGeometry.computeBoundingSphere();
    if (selected && !getArchitectureDefinition(selected)) {
      const surface = polygonGeometry(selected.polygon, 0.13);
      const positions = surface.getAttribute("position").array;
      selectionFillPositions.set(positions);
      selectionFillGeometry.getAttribute("position").needsUpdate = true;
      selectionFillGeometry.setDrawRange(0, positions.length / 3);
      surface.dispose();
    } else selectionFillGeometry.setDrawRange(0, 0);
    if (lotGeometry) {
      const colors = lotGeometry.getAttribute("color") as THREE.BufferAttribute;
      for (const [id, [start, count]] of lotRanges) {
        const color = new THREE.Color(
          state.highlightedIds.includes(id) && !state.statuses[id]
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
    height: Math.max(...ENTITIES.map(architectureVisualHeight)),
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
      const base = transition?.kind === "zoom" ? transition.to : undefined;
      const next = base ? { position: base.position.clone(), target: base.target.clone() } : pose();
      scratch.subVectors(next.position, next.target);
      scratch.setLength(
        Math.max(
          distanceLimits().min,
          Math.min(distanceLimits().max, scratch.length() / Math.max(0.1, factor)),
        ),
      );
      next.position.copy(next.target).add(scratch);
      animate(next, MOVEMENT.zoomMs, "zoom");
    },
    pan(dx, dy) {
      cancelTransition();
      const range = camera.position.distanceTo(controls.target) * 0.08;
      // Ground projections of screen right/down stay intuitive after any orbit.
      const m = camera.matrixWorld.elements;
      scratch
        .set(m[0], 0, m[2])
        .normalize()
        .multiplyScalar(dx * range);
      scratch2
        .set(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z)
        .normalize()
        .multiplyScalar(dy * range);
      scratch.add(scratch2);
      camera.position.add(scratch);
      controls.target.add(scratch);
      controls.update();
      clampTarget();
      invalidate();
    },
    rotate(direction) {
      if (!controls.enableRotate) return;
      props().onManualOrientation?.();
      const base = transition?.kind === "rotate" ? transition.to : undefined;
      const next = base ? { position: base.position.clone(), target: base.target.clone() } : pose();
      scratch.subVectors(next.position, next.target).applyAxisAngle(up, (direction * Math.PI) / 8);
      next.position.copy(next.target).add(scratch);
      animate(next, MOVEMENT.zoomMs, "rotate");
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
      vegetation?.dispose();
      scene.environment = null;
      environmentTarget?.dispose();
      surfaces.dispose();
      for (const resource of resources) resource.dispose();
      architecture.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      // Retain only a resource-free terminal count for cleanup assertions.
      diag.project = () => null;
      diag.loseContext = () => {};
      diag.setReferencePose = () => {};
      diag.resetSamples = () => {};
      performance.mark("indumoveis-map:renderer-disposed");
    },
  };
}
