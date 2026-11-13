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

export type PavilionProjection = {
  pavilionNumber: number;
  x: number;
  y: number;
  distance: number;
  scale: number;
};
export type PavilionViewport = { width: number; height: number };
export type ReportPavilionProjections = (
  projections: readonly PavilionProjection[],
  viewport: PavilionViewport,
) => void;

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
  /** A click on a permanent, non-commercial structure identifies it in
   * context. It selects nothing and never opens a commercial inspection. */
  onLandmark?(id: string | null): void;
  onReady(): void;
  onFailure(reason: string): void;
  statuses: Record<string, string>;
  highlightedIds: string[];
  /** Visible roof centres in CSS pixels, relative to the map stage. */
  onPavilionProjection?: ReportPavilionProjections;
  initialFocus?: Point;
  initialCamera?: MapCameraSnapshot;
  /** Read the still-visible fallback's current target during renderer preparation. */
  readInitialTarget?: () => Point | undefined;
  /** Keep the fallback visible until its active pointer gesture has ended. */
  canPresent?: () => boolean;
}
