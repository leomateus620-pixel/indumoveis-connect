import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CommercialMapWorkspace } from "./CommercialMapWorkspace";
import type { MapHandle, MapRendererProps } from "./types";

const commands = vi.hoisted(() => ({ rotate: vi.fn(), zoom: vi.fn() }));

vi.mock("./Map2D", () => ({ Map2D: () => null }));
vi.mock("./MapRenderer", async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react");
  return {
    default: forwardRef<MapHandle, MapRendererProps>(function TestRenderer(props, ref) {
      const ready = useRef(props.onReady);
      useImperativeHandle(ref, () => ({
        focus: () => {},
        focusLandmark: () => true,
        zoom: commands.zoom,
        pan: () => {},
        rotate: commands.rotate,
        getTarget: () => [95, 55],
        restoreOverview: () => {},
        restoreCommercial: () => {},
      }));
      useEffect(() => {
        ready.current();
      }, []);
      return (
        <div
          data-testid="navigation-renderer"
          data-selected={props.selectedId ?? ""}
          data-view={props.view}
        >
          <button onClick={() => props.onSelect("indumoveis:external:lot:01")}>Select A</button>
          <button onClick={() => props.onSelect("indumoveis:pavilion:12")}>Select B</button>
          <button onClick={() => props.onDeselect?.()}>Empty ground</button>
          <button onClick={() => props.onManualOrientation?.()}>Manual orbit</button>
        </div>
      );
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1366);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1366,
    bottom: 768,
    width: 1366,
    height: 768,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("selection presentation session", () => {
  it("exposes keyboard-focusable rotation and zoom controls while help is closed", async () => {
    render(<CommercialMapWorkspace />);
    const right = await screen.findByRole("button", { name: "Girar à direita" });
    expect(screen.queryByText("Como navegar")).toBeNull();
    right.focus();
    expect(right).toHaveFocus();
    fireEvent.click(right);
    fireEvent.click(screen.getByRole("button", { name: "Girar à esquerda" }));
    fireEvent.click(screen.getByRole("button", { name: "Aproximar" }));
    expect(commands.rotate.mock.calls).toEqual([[1], [-1]]);
    expect(commands.zoom).toHaveBeenCalledWith(1.2);
  });
  it("restores the pre-A view after A to B to Escape without changing the gesture scheme", async () => {
    render(<CommercialMapWorkspace />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Superior" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Superior" }));
    fireEvent.click(screen.getByRole("button", { name: "Select A" }));
    expect(screen.getByTestId("navigation-renderer")).toHaveAttribute(
      "data-selected",
      "indumoveis:external:lot:01",
    );
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    fireEvent.click(screen.getByRole("button", { name: "Select B" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("navigation-renderer")).toHaveAttribute("data-selected", "");
    expect(screen.getByRole("button", { name: "Superior" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("combobox", { name: "Gesto de navegação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Girar mapa" })).toBeNull();
  });
  it("keeps the original free orientation indicator across repeated selection and closes on empty ground", async () => {
    const { rerender } = render(<CommercialMapWorkspace />);
    await waitFor(() => expect(screen.getByRole("button", { name: "3D" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Manual orbit" }));
    fireEvent.click(screen.getByRole("button", { name: "Select A" }));
    fireEvent.click(screen.getByRole("button", { name: "Select A" }));
    fireEvent.click(screen.getByRole("button", { name: "Superior" }));
    rerender(<CommercialMapWorkspace statuses={{ "indumoveis:external:lot:01": "vendido" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Empty ground" }));
    expect(screen.getByTestId("navigation-renderer")).toHaveAttribute("data-view", "perspective");
    expect(screen.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("navigation-renderer")).toHaveAttribute("data-selected", "");
  });
});
