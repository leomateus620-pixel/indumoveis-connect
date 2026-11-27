import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { CommercialMapWorkspace } from "../../src/features/commercial-map/CommercialMapWorkspace";
import {
  referenceMetresToScene,
  sceneToReferenceCoordinate,
} from "../../src/features/commercial-map/urbanReference";
import { INDOMOVEIS_WALKING_PILOT as pilot } from "../../src/features/commercial-map/walking/pilot";
import {
  findWalkingRoute,
  pathAfter,
  type Metres,
} from "../../src/features/commercial-map/walking/network";
import type { WalkingNetwork } from "../../src/features/commercial-map/walking/network";
import extendedNetwork from "./extended-network.json";
import "./preview.css";

const start = { node: "gate-03" };
const initial = pilot.nodes[start.node].point;
function createDemoSource() {
  let timer: number | undefined;
  let callback: PositionCallback | undefined;
  let errorCallback: PositionErrorCallback | undefined;
  let point = initial;
  const stop = () => window.clearInterval(timer);
  function emit(accuracy = 3) {
    const [longitude, latitude] = sceneToReferenceCoordinate(referenceMetresToScene(point));
    callback?.({
      timestamp: Date.now(),
      coords: {
        longitude,
        latitude,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
    } as GeolocationPosition);
  }
  const rest = () => {
    stop();
    emit();
    timer = window.setInterval(emit, 2_000);
  };
  return {
    geo: {
      watchPosition(success, error) {
        callback = success;
        errorCallback = error ?? undefined;
        // Match the asynchronous browser API.
        window.setTimeout(() => {
          if (callback === success) rest();
        }, 20);
        return 1;
      },
      clearWatch() {
        stop();
        callback = errorCallback = undefined;
        point = initial;
      },
      getCurrentPosition() {},
    } satisfies Geolocation,
    rest,
    reset() {
      point = initial;
      rest();
    },
    loseSignal() {
      stop();
      errorCallback?.({ code: 2 } as GeolocationPositionError);
    },
    walk(destination: number) {
      const route = findWalkingRoute(pilot, start, pilot.destinations[destination]);
      if (!route || !callback) return;
      stop();
      let progress = 0;
      point = initial;
      emit(2);
      timer = window.setInterval(() => {
        progress += 3.2;
        point = pathAfter(route.path, progress)[0] as Metres;
        emit(2);
        if (progress >= route.metres) rest();
      }, 2_000);
    },
  };
}
const demo = createDemoSource();
export function Preview() {
  const [source, setSource] = useState("demo");
  const [extended, setExtended] = useState(false);
  const network = extended ? (extendedNetwork as unknown as WalkingNetwork) : pilot;
  return (
    <>
      <header className="preview-bar">
        <strong>Indumóveis · preview do piloto</strong>
        <label>
          Rede{" "}
          <select
            aria-label="Rede"
            value={extended ? "extended" : "pilot"}
            onChange={(event) => setExtended(event.target.value === "extended")}
          >
            <option value="pilot">Piloto</option>
            <option value="extended">Ampliada</option>
          </select>
        </label>
        <label>
          GPS{" "}
          <select
            aria-label="GPS"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="demo">Simulado</option>
            <option value="browser">Navegador</option>
          </select>
        </label>
        {source === "demo" && (
          <label>
            Cenário{" "}
            <select
              aria-label="Cenário"
              value=""
              onChange={(event) => {
                const action = event.target.value;
                if (action === "gate") demo.reset();
                if (action === "stop") demo.rest();
                if (action === "p1") demo.walk(0);
                if (action === "p12") demo.walk(1);
                if (action === "loss") demo.loseSignal();
              }}
            >
              <option value="">Selecionar</option>
              <option value="gate">Voltar ao Portão 3</option>
              <option value="p1">Caminhar ao Pavilhão 1</option>
              <option value="p12">Caminhar ao Pavilhão 12</option>
              <option value="stop">Parar</option>
              <option value="loss">Perder sinal</option>
            </select>
          </label>
        )}
      </header>
      <CommercialMapWorkspace
        key={`${source}:${network.revision}`}
        editionYear={pilot.editionYear}
        restorePark={false}
        commercialState="confirmed"
        walkingPreview={network}
        walkingGeolocation={source === "demo" ? demo.geo : undefined}
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
