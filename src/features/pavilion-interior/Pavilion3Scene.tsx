import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { PavilionPlan } from "./data";
import { COMMERCIAL_STATUS_COLORS } from "@/features/commercial-map/visualTheme";
import {
  lotBounds,
  PAVILION_3_TOUR,
  type Pavilion3ViewControls,
  type Pavilion3ViewRequest,
} from "./pavilion3-experience";

type Props = {
  plan: PavilionPlan;
  selectedCode?: string;
  saleCodes: ReadonlySet<string>;
  statuses: ReadonlyMap<string, string>;
  availability: boolean;
  salesActive: boolean;
  request: Pavilion3ViewRequest;
  controlsRef: RefObject<Pavilion3ViewControls | null>;
  onSelect: (code: string) => void;
  onConnect: () => void;
  onUnavailable: () => void;
};

/** Geometry is lifted directly from the immutable interior revision. Heights are visual relief. */
export default function Pavilion3Scene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const connection = useRef<HTMLAnchorElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const sync = useRef<() => void>(() => {});
  const navigate = useRef<() => void>(() => {});

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const canvas = document.createElement("canvas");
    let renderer: THREE.WebGLRenderer;
    try {
      const context = canvas.getContext("webgl2", {
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
      if (!context) throw new Error("No WebGL2");
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    } catch {
      latest.current.onUnavailable();
      return;
    }
    container.appendChild(canvas);
    canvas.setAttribute("aria-hidden", "true");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 6000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 95;
    controls.maxDistance = 2400;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.screenSpacePanning = false;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.8;

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const material = (color: string, roughness = 0.82) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
      materials.add(m);
      return m;
    };
    const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
      geometries.add(geometry);
      const object = new THREE.Mesh(geometry, mat);
      object.receiveShadow = true;
      scene.add(object);
      return object;
    };
    const cx = (props.plan.bounds.minX + props.plan.bounds.maxX) / 2;
    const cz = (props.plan.bounds.minY + props.plan.bounds.maxY) / 2;
    const world = (x: number, y: number, height = 0) => new THREE.Vector3(x - cx, height, y - cz);
    const shapes = (path: string) =>
      new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${path}"/></svg>`)
        .paths;
    const extrude = (path: string, depth: number, mat: THREE.Material, base = 0) => {
      for (const source of shapes(path))
        for (const shape of SVGLoader.createShapes(source)) {
          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            curveSegments: 1,
          });
          geometry.rotateX(Math.PI / 2);
          const object = mesh(geometry, mat);
          object.position.set(-cx, base + depth, -cz);
          object.castShadow = true;
        }
    };
    const floor = props.plan.architecture.find((item) => item.id === "p3:floor-outline");
    const perimeter = props.plan.architecture.find((item) => item.id === "p3:perimeter");
    const support = props.plan.architecture.find((item) => item.id === "p3:support");
    if (floor) extrude(floor.path, 8, material("#d8d1c1"), -8);
    if (support) extrude(support.path, 34, material("#4e6656"));
    const wallMaterial = material("#ede8db");
    const capMaterial = material("#64776b");
    if (perimeter)
      for (const path of shapes(perimeter.path))
        for (const sub of path.subPaths) {
          const points = sub.getPoints(1);
          for (let index = 1; index < points.length; index++) {
            const a = points[index - 1],
              b = points[index];
            const length = a.distanceTo(b);
            if (!length) continue;
            for (const [height, base, width, mat] of [
              [26, 13, 3.5, wallMaterial],
              [1.5, 26.8, 4.2, capMaterial],
            ] as const) {
              const wall = mesh(new THREE.BoxGeometry(length, height, width), mat);
              wall.position.copy(world((a.x + b.x) / 2, (a.y + b.y) / 2, base));
              wall.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
              wall.castShadow = true;
            }
          }
        }
    const ground = mesh(new THREE.PlaneGeometry(6000, 6000), material("#e9ede5"));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -9;

    // Exact lot numbers use a single texture atlas, independently of mesh/material state.
    const atlas = document.createElement("canvas");
    atlas.width = 1024;
    atlas.height = 1024;
    const ctx = atlas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 42px system-ui, sans-serif";
    props.plan.environments.forEach((lot, i) =>
      ctx.fillText(lot.code, (i % 8) * 128 + 64, Math.floor(i / 8) * 56 + 28),
    );
    const atlasTexture = new THREE.CanvasTexture(atlas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    textures.add(atlasTexture);
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: atlasTexture,
      color: "#294b3b",
      transparent: true,
      depthWrite: false,
    });
    materials.add(labelMaterial);
    const selectedLabelMaterial = labelMaterial.clone();
    selectedLabelMaterial.color.set("#ffffff");
    materials.add(selectedLabelMaterial);
    const pickable: THREE.Object3D[] = [];
    const displayBack = material("#617a5e");
    const displayEdge = material("#c6b391");
    const divider = material("#e6dfce");
    const lots = props.plan.environments.map((lot, i) => {
      const b = lotBounds([lot]);
      const mat = material(i % 2 ? "#f3efe3" : "#e8e2d3");
      const object = mesh(
        new THREE.BoxGeometry(b.maxX - b.minX - 0.65, 3, b.maxY - b.minY - 0.65),
        mat,
      );
      object.position.copy(world((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 1.5));
      object.castShadow = true;
      object.userData.code = lot.code;
      pickable.push(object);
      // Cutaway exhibition volumes follow each lot's own boundary; they do not create stock.
      // Perimeter rows face the aisles. The central island stays open, without a partition.
      const backX = b.maxX < cx - 100 ? b.minX + 1.4 : b.minX > cx + 100 ? b.maxX - 1.4 : undefined;
      if (backX !== undefined) {
        const back = mesh(new THREE.BoxGeometry(2.1, 15, b.maxY - b.minY - 0.8), displayBack);
        back.position.copy(world(backX, (b.minY + b.maxY) / 2, 10.5));
        back.castShadow = true;
        back.userData.code = lot.code;
        pickable.push(back);
        const cap = mesh(new THREE.BoxGeometry(2.3, 0.7, b.maxY - b.minY - 0.8), displayEdge);
        cap.position.copy(world(backX, (b.minY + b.maxY) / 2, 18.3));
      }
      const side = mesh(new THREE.BoxGeometry(b.maxX - b.minX - 1.2, 2.5, 0.6), divider);
      side.position.copy(world((b.minX + b.maxX) / 2, b.minY + 0.6, 4.25));
      side.castShadow = true;
      side.userData.code = lot.code;
      pickable.push(side);
      const geometry = new THREE.PlaneGeometry(24, 10.5);
      const uv = geometry.getAttribute("uv");
      const col = i % 8,
        row = Math.floor(i / 8);
      for (let j = 0; j < uv.count; j++)
        uv.setXY(j, (col + uv.getX(j)) / 8, 1 - ((row + 1 - uv.getY(j)) * 56) / 1024);
      const label = mesh(geometry, labelMaterial);
      label.position.copy(world(lot.label[0], lot.label[1], 3.3));
      label.rotation.x = -Math.PI / 2;
      const markerMat = material("#b8d6c5");
      const marker = mesh(
        new THREE.BoxGeometry(2, 0.2, Math.max(1, b.maxY - b.minY - 3)),
        markerMat,
      );
      marker.position.copy(world(b.minX + 2, lot.label[1], 3.2));
      return { lot, object, mat, marker, markerMat, label };
    });

    const textPlane = (
      text: string,
      x: number,
      z: number,
      width: number,
      depth: number,
      color = "#55705d",
    ) => {
      const source = document.createElement("canvas");
      source.width = 1024;
      source.height = 128;
      const context = source.getContext("2d")!;
      context.fillStyle = color;
      context.font = "600 56px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 512, 64);
      const texture = new THREE.CanvasTexture(source);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      materials.add(mat);
      const object = mesh(new THREE.PlaneGeometry(width, depth), mat);
      object.position.copy(world(x, z, 0.4));
      object.rotation.x = -Math.PI / 2;
      return object;
    };
    textPlane("CONSTRUÇÃO & MOBILIÁRIO", 290, 157, 188, 23);
    textPlane("ENTRADA", 256, 715, 82, 14);
    textPlane("SAÍDA", 295, 128, 42, 9);
    const passage = textPlane("PAVILHÃO 13 →", 477, 448, 83, 12);
    passage.userData.destination = 13;
    pickable.push(passage);
    textPlane("OESTE", 176, 500, 40, 9).rotation.z = Math.PI / 2;
    textPlane("LESTE", 403, 500, 40, 9).rotation.z = Math.PI / 2;

    scene.add(new THREE.HemisphereLight(0xf6f8f1, 0xa4ae92, 1.8));
    const sun = new THREE.DirectionalLight(0xfff0d5, 2.4);
    sun.position.set(-350, 700, 300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -600,
      right: 600,
      top: 650,
      bottom: -650,
      near: 1,
      far: 1600,
    });
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.4;
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe4edf5, 0.8);
    fill.position.set(400, 250, -400);
    scene.add(fill);

    let disposed = false,
      frame = 0,
      hover: string | undefined;
    let flight:
      | {
          start: number;
          from: THREE.Vector3;
          to: THREE.Vector3;
          fromTarget: THREE.Vector3;
          target: THREE.Vector3;
        }
      | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function render() {
      if (!disposed) {
        renderer.render(scene, camera);
        if (connection.current) {
          const point = world(487, 448, 20).project(camera);
          const width = container!.clientWidth,
            height = container!.clientHeight;
          const x = Math.max(38, Math.min(width - 104, ((point.x + 1) * width) / 2));
          const bottom =
            latest.current.salesActive && window.innerWidth > 700
              ? Math.min(window.innerHeight * 0.46, 400) + 100
              : 100;
          const y = Math.max(108, Math.min(height - bottom, ((1 - point.y) * height) / 2));
          connection.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        }
      }
    }
    function tick(now: number) {
      frame = 0;
      if (disposed) return;
      if (flight) {
        const t = Math.min(1, (now - flight.start) / 650);
        const ease = 1 - (1 - t) ** 3;
        camera.position.lerpVectors(flight.from, flight.to, ease);
        controls.target.lerpVectors(flight.fromTarget, flight.target, ease);
        if (t === 1) flight = undefined;
      }
      const changed = controls.update();
      render();
      if (flight || changed) invalidate();
    }
    function invalidate() {
      if (!frame && !disposed) frame = requestAnimationFrame(tick);
    }
    function fly(target: THREE.Vector3, position: THREE.Vector3, immediate = false) {
      if (immediate || reduced.matches) {
        flight = undefined;
        controls.target.copy(target);
        camera.position.copy(position);
        controls.update();
      } else
        flight = {
          start: performance.now(),
          from: camera.position.clone(),
          to: position,
          fromTarget: controls.target.clone(),
          target,
        };
      invalidate();
    }
    function applyRequest(immediate = false) {
      const request = latest.current.request;
      if (request.kind === "tour") {
        const stop = PAVILION_3_TOUR[request.stop];
        if (!stop) return;
        const target = world(stop.target[0], stop.target[1], 3);
        fly(target, target.clone().add(new THREE.Vector3(...stop.offset)), immediate);
      } else {
        const b = request.kind === "focus" ? request.bounds : props.plan.bounds;
        const target = world((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
        const span = Math.max(
          b.maxY - b.minY,
          (b.maxX - b.minX) / Math.min(camera.aspect, 1.3),
          request.kind === "focus" ? 170 : 0,
        );
        const distance = span * (request.kind === "focus" ? 1.55 : 1.7);
        const offset = new THREE.Vector3(0.32, 0.85, 0.85).normalize().multiplyScalar(distance);
        fly(target, target.clone().add(offset), immediate);
      }
    }
    function updateLots() {
      const p = latest.current;
      for (const { lot, object, mat, marker, markerMat, label } of lots) {
        const status = p.statuses.get(lot.code);
        const forSale = p.saleCodes.has(lot.code);
        const active = p.selectedCode === lot.code || forSale;
        const color = forSale
          ? "#197a74"
          : active
            ? "#376a4c"
            : hover === lot.code
              ? "#bed4b4"
              : p.availability && status
                ? (COMMERCIAL_STATUS_COLORS[status] ?? "#deddd4")
                : Number(lot.code) % 2
                  ? "#f1eddf"
                  : "#e8e1d0";
        mat.color.set(color);
        mat.emissive.set(active ? "#1b3223" : "#000000");
        object.position.y = active ? 4 : 1.5;
        label.position.y = active ? 5.8 : 3.3;
        label.material = active ? selectedLabelMaterial : labelMaterial;
        marker.position.y = active ? 5.7 : 3.2;
        marker.visible = !!status;
        markerMat.color.set(COMMERCIAL_STATUS_COLORS[status ?? ""] ?? "#b6b2b5");
      }
      invalidate();
    }
    const raycaster = new THREE.Raycaster();
    const hit = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return raycaster.intersectObjects(pickable, false)[0]?.object;
    };
    let gesture: { x: number; y: number; moved: boolean } | undefined;
    const activePointers = new Set<number>();
    const down = (event: PointerEvent) => {
      flight = undefined;
      activePointers.add(event.pointerId);
      if (activePointers.size === 1)
        gesture = { x: event.clientX, y: event.clientY, moved: event.button !== 0 };
      else if (gesture) gesture.moved = true;
    };
    const move = (event: PointerEvent) => {
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5)
        gesture.moved = true;
      if (activePointers.size) return;
      const target = hit(event);
      const next = target?.userData.code as string | undefined;
      canvas.style.cursor = target ? "pointer" : "grab";
      if (next !== hover) {
        hover = next;
        updateLots();
      }
    };
    const up = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (!activePointers.size && gesture && !gesture.moved) {
        const target = hit(event);
        if (target?.userData.code) latest.current.onSelect(target.userData.code);
        else if (target?.userData.destination) latest.current.onConnect();
      }
      if (!activePointers.size) gesture = undefined;
    };
    const cancel = () => {
      activePointers.clear();
      gesture = undefined;
    };
    const start = () => {
      flight = undefined;
      invalidate();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      latest.current.onUnavailable();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("webglcontextlost", contextLost);
    window.addEventListener("blur", cancel);
    controls.addEventListener("start", start);
    controls.addEventListener("change", invalidate);
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      applyRequest(true);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    latest.current.controlsRef.current = {
      zoom(factor) {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(
          THREE.MathUtils.clamp(
            offset.length() / factor,
            controls.minDistance,
            controls.maxDistance,
          ),
        );
        fly(controls.target.clone(), controls.target.clone().add(offset));
      },
      rotate() {
        const offset = camera.position
          .clone()
          .sub(controls.target)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
        fly(controls.target.clone(), controls.target.clone().add(offset));
      },
    };
    sync.current = updateLots;
    navigate.current = () => applyRequest();
    resize();
    updateLots();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("start", start);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("webglcontextlost", contextLost);
      window.removeEventListener("blur", cancel);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      latest.current.controlsRef.current = null;
      sync.current = () => {};
      navigate.current = () => {};
    };
  }, [props.plan]);
  useEffect(
    () => sync.current(),
    [props.selectedCode, props.saleCodes, props.statuses, props.availability],
  );
  useEffect(() => navigate.current(), [props.request]);
  return (
    <div
      ref={host}
      className="p3-scene"
      role="group"
      aria-label="Interior tridimensional do Pavilhão 3. Explore os lotes pela busca e pelos setores."
    >
      <a
        ref={connection}
        className="p3-scene-connection"
        href="/mapa/pavilhoes/13/interior"
        aria-label="Acesso ao Pavilhão 13"
        title="Entrar no Pavilhão 13"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          props.onConnect();
        }}
      >
        <img src="/brand/pavilhao-3/acesso-pavilhao-13.svg" alt="" />
      </a>
    </div>
  );
}
