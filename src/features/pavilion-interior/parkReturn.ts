import type { MapCameraSnapshot, MapView } from "@/features/commercial-map/types";

export type ParkReturn = {
  editionId: string;
  selectionId: string;
  camera?: MapCameraSnapshot;
  view: MapView;
  orientationFree: boolean;
  search?: { status?: string; space?: string; deal?: string };
};
const KEY = "indumoveis:pavilion-1:park-return:v1";
const finite = (values: unknown[]) =>
  values.every((v) => typeof v === "number" && Number.isFinite(v));
export function validCamera(value: unknown): value is MapCameraSnapshot {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.kind === "2d")
    return finite([c.x, c.y, c.width, c.height]) && Number(c.width) > 0 && Number(c.height) > 0;
  return (
    c.kind === "3d" &&
    Array.isArray(c.position) &&
    c.position.length === 3 &&
    finite(c.position) &&
    Array.isArray(c.target) &&
    c.target.length === 3 &&
    finite(c.target) &&
    c.position.some((v, i) => v !== (c.target as number[])[i])
  );
}
export function saveParkReturn(value: ParkReturn) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* Private-mode storage can be unavailable. */
  }
}
export function readParkReturn(editionId?: string): ParkReturn | null {
  if (!editionId || typeof sessionStorage === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (
      value?.editionId !== editionId ||
      value.selectionId !== "indumoveis:pavilion:1" ||
      !["perspective", "top", "front"].includes(value.view) ||
      (value.camera !== undefined && !validCamera(value.camera))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
