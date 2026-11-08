import type { Point } from "./data/territory";
import type { PermanentParkLandmark } from "./permanentParkLayout";

export type MapView = "perspective" | "top" | "front";
export type MapQuality = "auto" | "light" | "balanced" | "detailed";
export type MapGesture = "move" | "rotate";
export type MapCameraSnapshot =
  | { kind: "2d"; x: number; y: number; width: number; height: number }
  | { kind: "3d"; position: [number, number, number]; target: [number, number, number] };
export interface MapInsets {
  right: number;
  bottom: number;
}

export interface MapHandle {
  focus(id?: string): void;
  /** Returns false when the optional permanent park is not available. */
  focusLandmark(id: PermanentParkLandmark["id"]): boolean;
  zoom(factor: number): void;
  pan(dx: number, dy: number): void;
  rotate(direction: number): void;
  getTarget(): Point;
  captureCamera?(): MapCameraSnapshot | undefined;
  restoreOverview(): void;
  restoreCommercial(): void;
}

export interface MapRendererProps {
  selectedId: string | null;
  inspectedId: string | null;
  view: MapView;
  /** Reapply a preset after manual orbit without inventing a fourth view button. */
  viewRevision?: number;
  onManualOrientation?(): void;
  quality: MapQuality;
  /** Retained for callers; mouse/touch bindings are stable and ignore modes. */
  gesture: MapGesture;
  insets: MapInsets;
  onSelect(id: string): void;
  /** A click on unselectable ground closes the current inspection session. */
  onDeselect?(): void;
  onReady(): void;
  onFailure(reason: string): void;
  statuses: Record<string, string>;
  highlightedIds: string[];
  initialFocus?: Point;
  initialCamera?: MapCameraSnapshot;
  /** Read the still-visible fallback's current target during renderer preparation. */
  readInitialTarget?: () => Point | undefined;
  /** Keep the fallback visible until its active pointer gesture has ended. */
  canPresent?: () => boolean;
}
