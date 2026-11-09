/** Export transparent 3× copies and a review sheet from the generated SVGs. */
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = fileURLToPath(new URL("../", import.meta.url));
const lockups = ["salao-imoveis-primary", "salao-imoveis-compact", "salao-imoveis-monochrome"];

await Promise.all(
  lockups.map((name) =>
    sharp(join(root, `${name}.svg`), { density: 216 })
      .png()
      .toFile(join(root, `${name}.png`)),
  ),
);

const sheet =
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="430" viewBox="0 0 1040 430">
  <rect width="1040" height="430" fill="#F6F0E7"/>
  <path d="M28 218H1012M520 26V404" fill="none" stroke="#D7C9BA"/>
  <g fill="#5D5248" font-family="Arial, sans-serif" font-weight="600" font-size="13" letter-spacing="1.4">
    <text x="36" y="41">ASSINATURA PRINCIPAL</text>
    <text x="547" y="41">ASSINATURA COMPACTA</text>
    <text x="36" y="252">MONOCROMÁTICA</text>
    <text x="547" y="252">PLACAS DE ACESSO</text>
  </g>
</svg>`);
const tiles = [
  { name: lockups[0], left: 36, top: 54 },
  { name: lockups[1], left: 547, top: 63 },
  { name: lockups[2], left: 36, top: 260 },
  { name: "acesso-pavilhao-3", left: 547, top: 275 },
  { name: "acesso-pavilhao-8", left: 658, top: 275 },
  { name: "../pavilion-wayfinding/entrada", left: 773, top: 275 },
  { name: "../pavilion-wayfinding/saida", left: 773, top: 315 },
];
await sharp(sheet)
  .composite(
    tiles.map(({ name, ...position }) => ({ input: join(root, `${name}.svg`), ...position })),
  )
  .png()
  .toFile(join(root, "identity-preview.png"));
