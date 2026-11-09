import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CommercialMapWorkspace } from "./CommercialMapWorkspace";
import type { MapHandle, MapRendererProps, MapCameraSnapshot } from "./types";
import { saveParkReturn } from "@/features/pavilion-interior/parkReturn";

const commands = vi.hoisted(() => ({ rotate: vi.fn(), zoom: vi.fn(), rendererMount: vi.fn() }));

vi.mock("./Map2D", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    Map2D: forwardRef<MapHandle, MapRendererProps>(function TestLightMap(props, ref) {
      useImperativeHandle(ref, () => ({
        focus: () => {},
        focusLandmark: () => true,
        zoom: () => {},
        pan: () => {},
        rotate: () => {},
        getTarget: () => [95, 55],
        restoreOverview: () => {},
        restoreCommercial: () => {},
        captureCamera: () => props.initialCamera,
      }));
      return (
        <div
          data-testid="light-map"
          data-selected={props.selectedId ?? ""}
          data-view={props.view}
          data-initial-camera={JSON.stringify(props.initialCamera ?? null)}
        />
      );
    }),
  };
});
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
        commands.rendererMount();
        ready.current();
      }, []);
      return (
        <div
          data-testid="navigation-renderer"
          data-selected={props.selectedId ?? ""}
          data-view={props.view}
          data-initial-camera={JSON.stringify(props.initialCamera ?? null)}
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
  sessionStorage.clear();
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

describe("return from Pavilhão 1 interior", () => {
  const camera2d: MapCameraSnapshot = { kind: "2d", x: 116, y: 44, width: 28, height: 17 };
  const camera3d: MapCameraSnapshot = { kind: "3d", position: [120, 29, 65], target: [104, 0, 51] };
  const save = (camera: MapCameraSnapshot, orientationFree = false) =>
    saveParkReturn({
      editionId: "current-edition",
      selectionId: "indumoveis:pavilion:1",
      camera,
      view: camera.kind === "2d" ? "top" : "front",
      orientationFree,
      search: { space: "previous-external-space" },
    });

  it("restores a saved 2D park camera without starting the 3D renderer", async () => {
    save(camera2d);
    const { container } = render(<CommercialMapWorkspace editionId="current-edition" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector(".im-map-stage")).toHaveAttribute("data-representation", "2d");
    expect(screen.getByTestId("light-map")).toHaveAttribute(
      "data-selected",
      "indumoveis:pavilion:1",
    );
    expect(screen.getByTestId("light-map")).toHaveAttribute("data-view", "top");
    expect(
      JSON.parse(screen.getByTestId("light-map").getAttribute("data-initial-camera")!),
    ).toEqual(camera2d);
    expect(screen.queryByTestId("navigation-renderer")).not.toBeInTheDocument();
    expect(commands.rendererMount).not.toHaveBeenCalled();
    // The user can explicitly request the heavier representation afterwards.
    fireEvent.click(screen.getByRole("button", { name: "Opções de visualização" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar visualização 3D" }));
    await screen.findByTestId("navigation-renderer");
    expect(commands.rendererMount).toHaveBeenCalledOnce();
  });

  it("keeps Pavilhão 1 selected over a stale external URL selection, then accepts a new selection", async () => {
    save(camera2d);
    const { rerender } = render(
      <CommercialMapWorkspace
        editionId="current-edition"
        externalSelection="indumoveis:external:lot:01"
      />,
    );
    expect(screen.getByTestId("light-map")).toHaveAttribute(
      "data-selected",
      "indumoveis:pavilion:1",
    );
    rerender(
      <CommercialMapWorkspace
        editionId="current-edition"
        externalSelection="indumoveis:external:lot:02"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("light-map")).toHaveAttribute(
        "data-selected",
        "indumoveis:external:lot:02",
      ),
    );
    expect(
      JSON.parse(screen.getByTestId("light-map").getAttribute("data-initial-camera")!),
    ).toEqual(camera2d);
  });

  it("passes the saved 3D camera and orientation to the renderer on return", async () => {
    save(camera3d);
    render(<CommercialMapWorkspace editionId="current-edition" />);
    const renderer = await screen.findByTestId("navigation-renderer");
    expect(JSON.parse(renderer.getAttribute("data-initial-camera")!)).toEqual(camera3d);
    expect(renderer).toHaveAttribute("data-selected", "indumoveis:pavilion:1");
    expect(renderer).toHaveAttribute("data-view", "front");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Oblíqua" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
  });

  it("preserves a saved free orientation without marking an orientation preset active", async () => {
    save(camera3d, true);
    render(<CommercialMapWorkspace editionId="current-edition" />);
    await screen.findByText("Orientação livre");
    expect(screen.getByTestId("navigation-renderer")).toHaveAttribute("data-view", "front");
    expect(screen.getByRole("button", { name: "Oblíqua" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      JSON.parse(screen.getByTestId("navigation-renderer").getAttribute("data-initial-camera")!),
    ).toEqual(camera3d);
  });

  it("honours a fresh external deep link when park restoration is disabled", async () => {
    save(camera2d);
    render(
      <CommercialMapWorkspace
        editionId="current-edition"
        restorePark={false}
        externalSelection="indumoveis:external:lot:01"
      />,
    );
    const renderer = await screen.findByTestId("navigation-renderer");
    expect(renderer).toHaveAttribute("data-selected", "indumoveis:external:lot:01");
    expect(renderer).toHaveAttribute("data-initial-camera", "null");
    expect(renderer).toHaveAttribute("data-view", "perspective");
  });
});

describe("pavilion interior entry and return", () => {
  it.each([8, 13] as const)("opens P%s and saves its own edition and filters", async (pavilion) => {
    const open = vi.fn();
    render(
      <CommercialMapWorkspace
        editionId="current-edition"
        initialPavilionNumber={pavilion}
        parkSearch={{ status: "disponivel", deal: "previous-deal" }}
        onOpenInterior={open}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Acesso Interno" }));
    expect(open).toHaveBeenCalledExactlyOnceWith(pavilion);
    const saved = JSON.parse(
      sessionStorage.getItem(`indumoveis:pavilion-${pavilion}:park-return:v1`)!,
    );
    expect(saved).toMatchObject({
      editionId: "current-edition",
      selectionId: `indumoveis:pavilion:${pavilion}`,
      search: { status: "disponivel", deal: "previous-deal" },
    });
    expect(sessionStorage.getItem("indumoveis:pavilion-1:park-return:v1")).toBeNull();
  });

  it("restores the P13 camera when P1 has a newer saved visit", async () => {
    const camera: MapCameraSnapshot = { kind: "2d", x: 211, y: 74, width: 26, height: 16 };
    saveParkReturn({
      editionId: "current-edition",
      selectionId: "indumoveis:pavilion:13",
      camera,
      view: "top",
      orientationFree: false,
    });
    saveParkReturn({
      editionId: "current-edition",
      selectionId: "indumoveis:pavilion:1",
      camera: { kind: "3d", position: [90, 20, 50], target: [75, 0, 40] },
      view: "front",
      orientationFree: false,
    });
    render(<CommercialMapWorkspace editionId="current-edition" initialPavilionNumber={13} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("light-map")).toHaveAttribute(
      "data-selected",
      "indumoveis:pavilion:13",
    );
    expect(
      JSON.parse(screen.getByTestId("light-map").getAttribute("data-initial-camera")!),
    ).toEqual(camera);
    expect(commands.rendererMount).not.toHaveBeenCalled();
  });
});

it("keeps pavilion sheets without interiors out of the access flow", async () => {
  const open = vi.fn();
  render(
    <CommercialMapWorkspace
      editionId="current-edition"
      externalSelection="indumoveis:pavilion:14"
      onOpenInterior={open}
    />,
  );
  await screen.findByTestId("navigation-renderer");
  expect(screen.queryByRole("button", { name: "Acesso Interno" })).not.toBeInTheDocument();
  expect(open).not.toHaveBeenCalled();
});
