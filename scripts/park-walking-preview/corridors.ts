import type { Point } from "../../src/features/commercial-map/data/territory";

// References in the A2 drawing's scene frame. The generator verifies every
// segment and frontage connection against the unobstructed floor mesh.
const east = 149.0625;
const central = 114.15;
const west = 70;
const argentina = 65.8125;
const uruguai = 46.3;
const brasil = 24.5;

export const WALKING_CORRIDORS: { id: string; label: string; points: Point[] }[] = [
  {
    id: "brasilia",
    label: "Rua Brasília",
    points: [
      [149.1042480964776, 95.8],
      [east, argentina],
      [east, uruguai],
      [east, brasil],
      [east, 20],
    ],
  },
  {
    id: "argentina",
    label: "Rua Argentina",
    points: [
      [60.1875, argentina],
      [west, argentina],
      [central, argentina],
      [east, argentina],
    ],
  },
  {
    id: "uruguai",
    label: "Rua Uruguai",
    points: [
      [west, uruguai],
      [central, uruguai],
      [east, uruguai],
    ],
  },
  {
    id: "brasil",
    label: "Rua Brasil",
    points: [
      [8, brasil],
      [west, brasil],
      [central, brasil],
      [east, brasil],
    ],
  },
  {
    id: "quadras-centrais",
    label: "Passagem entre as quadras centrais",
    points: [
      [central, brasil],
      [central, uruguai],
      [central, argentina],
    ],
  },
  {
    id: "mercosul",
    label: "Alameda Mercosul",
    points: [
      [west, 7],
      [west, brasil],
      [west, uruguai],
      [west, argentina],
    ],
  },
];
