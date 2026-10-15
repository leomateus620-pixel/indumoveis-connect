import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Map2D } from "./Map2D";
import { ENTITIES } from "./data/territory";
import type { MapHandle, MapRendererProps } from "./types";

const props: MapRendererProps = {
  selectedId: null,
  inspectedId: null,
  view: "top",
  quality: "light",
  gesture: "move",
  insets: { right: 0, bottom: 0 },
  onSelect: () => {},
  onReady: () => {},
  onFailure: () => {},
  statuses: {},
  highlightedIds: [],
};
describe("engine-independent territorial fallback", () => {
  it("renders useful HTML without browser globals or a WebGL context", () => {
    const html = renderToString(<Map2D {...props} />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<canvas");
    for (const item of ENTITIES.filter((e) => e.kind === "lot" || e.kind === "pavilion"))
      expect(html).toContain(item.id);
  });
  it("keeps the same SVG and target when selection closes and preserves external pose after inspection", () => {
    const matchMedia = window.matchMedia;
    const reduced = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) => ({ ...matchMedia(query), matches: true }));
    const ref = createRef<MapHandle>();
    const { container, rerender } = render(<Map2D ref={ref} {...props} />);
    const svg = container.querySelector("svg")!;
    const lot = ENTITIES.find((e) => e.kind === "lot")!;
    ref.current!.focus(lot.id);
    const target = ref.current!.getTarget();
    rerender(<Map2D ref={ref} {...props} selectedId={lot.id} />);
    rerender(<Map2D ref={ref} {...props} />);
    expect(container.querySelector("svg")).toBe(svg);
    expect(ref.current!.getTarget()).toEqual(target);
    const pavilion = ENTITIES.find((e) => e.kind === "pavilion")!;
    rerender(<Map2D ref={ref} {...props} inspectedId={pavilion.id} />);
    rerender(<Map2D ref={ref} {...props} />);
    expect(ref.current!.getTarget()).toEqual(target);
    reduced.mockRestore();
  });
  it("does not select at the end of a drag or a canceled gesture", () => {
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
    const select = vi.fn();
    const { container } = render(<Map2D {...props} onSelect={select} />);
    const svg = container.querySelector("svg")!;
    svg.setPointerCapture = () => {};
    svg.getBoundingClientRect = () => ({
      width: 1000,
      height: 600,
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      toJSON: () => ({}),
    });
    const lot = container.querySelector('[data-entity*="external:lot"] polygon')!;
    fireEvent.pointerDown(lot, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 240, clientY: 240, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 240, clientY: 240, pointerId: 1 });
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerDown(lot, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerDown(lot, { button: 0, clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 200, clientY: 200, pointerId: 1 });
    expect(select).toHaveBeenCalledOnce();
  });
});
