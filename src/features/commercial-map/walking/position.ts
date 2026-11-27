import {
  referenceLocalMetres,
  referenceMetresToScene,
  sceneToReferenceCoordinate,
} from "../urbanReference";
import { distance, interpolate, type Metres } from "./network";

export const FRESH_MS = 12_000;
export const WALK_IDLE_MS = 3_500;

type Fix = { point: Metres; accuracy: number; at: number };
export type Position = Fix & {
  centre: Metres;
  radius: number;
  anchor: Fix;
  moving: boolean;
  movementSamples: number;
  heading?: number;
  candidateHeading?: number;
};

export function readFix(position: GeolocationPosition, now: number): Fix | null {
  const { latitude, longitude, accuracy } = position.coords;
  const at = position.timestamp;
  if (
    ![latitude, longitude, accuracy, at].every(Number.isFinite) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    accuracy <= 0 ||
    now - at > FRESH_MS ||
    at > now + 2_000
  )
    return null;
  return { point: referenceLocalMetres([longitude, latitude]), accuracy, at };
}

export function filterFix(previous: Position | null, fix: Fix): Position | null {
  if (previous && fix.at <= previous.at) return null;
  if (!previous || fix.at - previous.at > FRESH_MS) {
    return {
      ...fix,
      centre: fix.point,
      radius: fix.accuracy,
      anchor: fix,
      moving: false,
      movementSamples: 0,
    };
  }
  const elapsed = (fix.at - previous.at) / 1000;
  const step = distance(previous.point, fix.point);
  if (step > 4 * elapsed + Math.min(24, previous.accuracy + fix.accuracy)) return null;

  const anchor = previous.anchor;
  const travelled = distance(anchor.point, fix.point);
  const sinceAnchor = (fix.at - anchor.at) / 1000;
  const accurate = fix.accuracy <= 10 && previous.accuracy <= 10 && anchor.accuracy <= 10;
  const direction = Math.atan2(fix.point[0] - anchor.point[0], fix.point[1] - anchor.point[1]);
  const headingDelta =
    previous.candidateHeading == null
      ? 0
      : Math.abs(
          Math.atan2(
            Math.sin(direction - previous.candidateHeading),
            Math.cos(direction - previous.candidateHeading),
          ),
        );
  const meaningful =
    accurate &&
    sinceAnchor >= 0.7 &&
    sinceAnchor <= 10 &&
    travelled > Math.max(1.8, (anchor.accuracy + fix.accuracy) * 0.7) &&
    travelled / sinceAnchor >= 0.55 &&
    travelled / sinceAnchor <= 3.6;

  const movementSamples = meaningful
    ? headingDelta < 1.2
      ? previous.movementSamples + 1
      : 1
    : step < Math.max(0.8, fix.accuracy * 0.45) || elapsed * 1000 > WALK_IDLE_MS
      ? 0
      : previous.movementSamples;
  const moving = meaningful && movementSamples >= 2;
  const centre = moving
    ? interpolate(previous.centre, fix.point, 0.8)
    : travelled <= Math.max(anchor.accuracy, fix.accuracy, 1.25)
      ? previous.centre
      : interpolate(previous.centre, fix.point, 0.55);
  return {
    ...fix,
    centre,
    radius: fix.accuracy + distance(centre, fix.point),
    anchor: meaningful || sinceAnchor > 10 || !accurate ? fix : anchor,
    moving,
    movementSamples,
    heading: moving ? direction : previous.heading,
    candidateHeading: meaningful ? direction : previous.candidateHeading,
  };
}

export function permitsAvatar(
  wasAvatar: boolean,
  pixels: number,
  polarDegrees: number,
  approximate: boolean,
) {
  return (
    !approximate &&
    (wasAvatar ? pixels >= 19 && polarDegrees >= 26 : pixels >= 25 && polarDegrees >= 34)
  );
}

/** Round a device readout to the order of magnitude of the reported uncertainty. */
export function deviceCoordinateLabels(fix: Pick<Position, "point" | "accuracy">) {
  const [longitude, latitude] = sceneToReferenceCoordinate(referenceMetresToScene(fix.point));
  const metresPerDegree = 111_319 * Math.max(0.001, Math.abs(Math.cos((latitude * Math.PI) / 180)));
  const digits = Math.max(0, Math.min(5, Math.round(Math.log10(metresPerDegree / fix.accuracy))));
  const formatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return { latitude: formatter.format(latitude), longitude: formatter.format(longitude) };
}
