import { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Map2D } from "./Map2D";
import { ENTITIES } from "./data/territory";
import type { MapHandle, MapRendererProps } from "./types";
import { STREET_LABEL } from "./labelPolicy";
import { COMMERCIAL_STATUS_COLORS, VISUAL_THEME } from "./visualTheme";
import { LOT_GRAPHICS } from "./commercialPresentation";

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
  it("gives streets fixed world text with no plaque and keeps selection separate from status", () => {
    const lot = ENTITIES.find((entity) => entity.kind === "lot")!;
    const { container } = render(
      <Map2D {...props} selectedId={lot.id} statuses={{ [lot.id]: "disponivel" }} />,
    );
    const streetText = container.querySelector<SVGTextElement>(".im-map-labels .im-map-road text")!;
    expect(streetText.style.fontSize).toBe(`${STREET_LABEL.baseTextHeight}px`);
    expect(streetText.style.fill).toBe(VISUAL_THEME.roadText);
    expect(streetText.parentElement?.querySelector("rect")).toBeNull();
    expect(
      container.querySelector<SVGPolygonElement>(
        '[data-entity="indumoveis:road:argentina"] polygon',
      )?.style.fill,
    ).toBe("transparent");
    for (const avenue of ["benvenuto", "imigrantes"])
      expect(
        container.querySelector<SVGPolygonElement>(
          `[data-entity="indumoveis:road:${avenue}"] polygon`,
        )?.style.fill,
      ).toBe(VISUAL_THEME.road);
    for (const surface of container.querySelectorAll(".im-map-physical-context path"))
      expect(surface.getAttribute("fill-rule")).toBe("evenodd");
    const lotPolygons = container.querySelectorAll<SVGPolygonElement>(
      `[data-entity="${lot.id}"] polygon`,
    );
    expect(lotPolygons[0].style.fill).toBe(COMMERCIAL_STATUS_COLORS.disponivel);
    expect(lotPolygons[1].style.fill).toBe(LOT_GRAPHICS.selected);
    expect(lotPolygons[1].style.fillOpacity).toBe("0.09");
  });
  it("keeps numbers as transparent text and reveals building names only with selection", () => {
    const pavilion = ENTITIES.find((entity) => entity.kind === "pavilion")!;
    const { container, rerender } = render(<Map2D {...props} />);
    expect(container.querySelector(".im-map-labels rect")).toBeNull();
    const text = container.querySelector<SVGTextElement>(
      `[data-label-entity="${pavilion.id}"] text`,
    )!;
    expect(text.style.visibility).toBe("hidden");
    rerender(<Map2D {...props} selectedId={pavilion.id} />);
    expect(text.style.visibility).not.toBe("hidden");
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
  it("focuses each selection once and restores the whole original SVG pose after A to B to close", () => {
    const matchMedia = window.matchMedia;
    const reduced = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) => ({ ...matchMedia(query), matches: true }));
    const ref = createRef<MapHandle>();
    const { container, rerender } = render(<Map2D ref={ref} {...props} />);
    const svg = container.querySelector("svg")!;
    const original = svg.getAttribute("viewBox");
    const [a, b] = ENTITIES.filter((e) => e.kind === "lot");
    rerender(<Map2D ref={ref} {...props} selectedId={a.id} />);
    expect(svg.getAttribute("viewBox")).not.toBe(original);
    const focusA = svg.getAttribute("viewBox");
    rerender(<Map2D ref={ref} {...props} selectedId={a.id} statuses={{ [a.id]: "vendido" }} />);
    expect(svg.getAttribute("viewBox")).toBe(focusA);
    ref.current!.pan(1, 0);
    rerender(<Map2D ref={ref} {...props} selectedId={b.id} />);
    rerender(<Map2D ref={ref} {...props} />);
    expect(svg.getAttribute("viewBox")).toBe(original);
    expect(container.querySelector("svg")).toBe(svg);
    expect(ref.current!.focusLandmark("arena")).toBe(true);
    expect(svg.getAttribute("viewBox")).not.toBe(original);
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
  it("does not run a canceled focus callback after a manual pan, even if that RAF was already queued", () => {
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const ref = createRef<MapHandle>();
    const { container, rerender } = render(<Map2D ref={ref} {...props} />);
    const a = ENTITIES.find((entry) => entry.kind === "lot")!;
    rerender(<Map2D ref={ref} {...props} selectedId={a.id} />);
    expect(callbacks).toHaveLength(1);
    const old = callbacks[0];
    ref.current!.pan(1, 0);
    const visible = container.querySelector("svg")!.getAttribute("viewBox");
    old(performance.now() + 1000);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe(visible);
    rerender(<Map2D ref={ref} {...props} selectedId={a.id} statuses={{ [a.id]: "vendido" }} />);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe(visible);
    raf.mockRestore();
    cancel.mockRestore();
  });
  it("dismisses a selection only after an empty-ground click, never a release beyond the click threshold", () => {
    Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
    const close = vi.fn();
    const a = ENTITIES.find((entry) => entry.kind === "lot")!;
    const { container } = render(<Map2D {...props} selectedId={a.id} onDeselect={close} />);
    const svg = container.querySelector("svg")!;
    svg.setPointerCapture = () => {};
    fireEvent.pointerDown(svg, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(svg, { button: 0, clientX: 40, clientY: 20 });
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(svg, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(svg, { button: 0, clientX: 20, clientY: 20 });
    expect(close).toHaveBeenCalledOnce();
  });
});
