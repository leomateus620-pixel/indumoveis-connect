/** Bake the exact packaged exhibition model with its registered top-down camera. */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const project = fileURLToPath(new URL("../../../", import.meta.url));
const out = process.argv[2];
if (!out) throw new Error("Provide an output folder for the two intermediate PNGs");

const html = `<!doctype html><meta charset="utf-8"><style>*{margin:0}</style>
<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
const model = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync("/exhibition.glb");
const renderer = new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;
renderer.setSize(4208,1864);
renderer.setClearColor(0,0);
const scene = new T.Scene();
const camera = new T.OrthographicCamera(-526,526,233,-233,1,2400);
camera.position.set(554,1000,299);
camera.up.set(0,0,-1);
camera.lookAt(554,0,299);
scene.add(new T.HemisphereLight(0xfffcf4,0xb4ad9f,1.65));
const key = new T.DirectionalLight(0xffefd7,2.45);
key.position.set(240,780,-180);
key.target.position.set(554,0,299);
key.castShadow = true;
key.shadow.mapSize.set(4096,4096);
Object.assign(key.shadow.camera,{near:1,far:2200,left:-640,right:640,top:440,bottom:-440});
key.shadow.bias = -.000045;
key.shadow.normalBias = .04;
scene.add(key,key.target);
model.scene.traverse(object=>{
  if (!object.isMesh) return;
  object.castShadow = object.receiveShadow = true;
  if (object.material.map) object.material.map.anisotropy = Math.min(8,renderer.capabilities.getMaxAnisotropy());
});
scene.add(model.scene);
renderer.render(scene,camera);
window.color = renderer.domElement.toDataURL("image/png");
renderer.shadowMap.enabled = false;
renderer.setSize(2104,932);
scene.overrideMaterial = new T.ShaderMaterial({
  side:T.DoubleSide,
  vertexShader:${JSON.stringify("varying float height; void main(){vec4 world=modelMatrix*vec4(position,1.0);height=world.y;gl_Position=projectionMatrix*viewMatrix*world;}")},
  fragmentShader:${JSON.stringify("varying float height; void main(){gl_FragColor=vec4(vec3(clamp(height/32.0,0.0,1.0)),1.0);}")},
});
renderer.render(scene,camera);
window.heightMap = renderer.domElement.toDataURL("image/png");
</script>`;

const modules = resolve(project, "node_modules/three");
const server = createServer(async (req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" }).end(html);
    return;
  }
  const url = new URL(req.url, "http://localhost");
  const file =
    url.pathname === "/exhibition.glb"
      ? resolve(project, "public/map-assets/pavilion-1/arq-design.glb")
      : resolve(modules, "." + url.pathname.replace(/^\/three/, ""));
  if (url.pathname !== "/exhibition.glb" && !file.startsWith(modules + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const bytes = await readFile(file);
    res
      .writeHead(200, {
        "content-type": file.endsWith(".js") ? "text/javascript" : "application/octet-stream",
      })
      .end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => console.error(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.heightMap, null, { timeout: 90000 });
  for (const [key, name] of [
    ["color", "color.png"],
    ["heightMap", "height.png"],
  ]) {
    const encoded = await page.evaluate((key) => window[key], key);
    await writeFile(resolve(out, name), Buffer.from(encoded.split(",")[1], "base64"));
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
