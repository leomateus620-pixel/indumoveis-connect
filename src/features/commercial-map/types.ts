import type { Point } from "./data/territory";

export type MapView = "perspective" | "top" | "front";
export type MapQuality = "auto" | "light" | "balanced" | "detailed";
export type MapGesture = "move" | "rotate";
export interface MapInsets {
  right: number;
  bottom: number;
}

export interface MapHandle {
  focus(id?: string): void;
  zoom(factor: number): void;
  pan(dx: number, dy: number): void;
  rotate(direction: number): void;
  getTarget(): Point;
  restoreOverview(): void;
}

export interface MapRendererProps {
  selectedId: string | null;
  inspectedId: string | null;
  view: MapView;
  quality: MapQuality;
  gesture: MapGesture;
  insets: MapInsets;
  onSelect(id: string): void;
  onReady(): void;
  onFailure(reason: string): void;
  statuses: Record<string, string>;
  highlightedIds: string[];
  initialFocus?: Point;
  /** Read the still-visible fallback's current target during renderer preparation. */
  readInitialTarget?: () => Point | undefined;
  /** Keep the fallback visible until its active pointer gesture has ended. */
  canPresent?: () => boolean;
}
