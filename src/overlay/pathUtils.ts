import type { OverlayPoint, OverlayViewBox } from "./types";

export function scalePoint(
  point: OverlayPoint,
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): { x: number; y: number } {
  "worklet";
  return {
    x: (point.x / viewBox.width) * width,
    y: (point.y / viewBox.height) * height,
  };
}

export function scalePoints(
  points: OverlayPoint[],
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): { x: number; y: number }[] {
  "worklet";
  return points.map((p) => scalePoint(p, viewBox, width, height));
}

/** Build an SVG path `d` from polyline corner points (architectural routing). */
export function pointsToPathD(
  points: OverlayPoint[],
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): string {
  if (points.length === 0) return "";
  const scaled = scalePoints(points, viewBox, width, height);
  return scaled
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

type Segment = { x1: number; y1: number; x2: number; y2: number; length: number };

function buildSegments(
  points: OverlayPoint[],
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): Segment[] {
  "worklet";
  const scaled = scalePoints(points, viewBox, width, height);
  const segments: Segment[] = [];
  for (let i = 0; i < scaled.length - 1; i += 1) {
    const a = scaled[i];
    const b = scaled[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, length });
  }
  return segments;
}

export function getPathLength(
  points: OverlayPoint[],
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): number {
  return buildSegments(points, viewBox, width, height).reduce((sum, s) => sum + s.length, 0);
}

/** Interpolate position along a polyline path. `t` is 0–1. */
export function getPointOnPath(
  points: OverlayPoint[],
  t: number,
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): { x: number; y: number } {
  "worklet";
  const segments = buildSegments(points, viewBox, width, height);
  if (segments.length === 0) return { x: 0, y: 0 };

  const total = segments.reduce((sum, s) => sum + s.length, 0);
  if (total <= 0) return { x: segments[0].x1, y: segments[0].y1 };

  const clamped = Math.max(0, Math.min(1, t));
  let remaining = clamped * total;

  for (const seg of segments) {
    if (remaining <= seg.length) {
      const ratio = seg.length === 0 ? 0 : remaining / seg.length;
      return {
        x: seg.x1 + (seg.x2 - seg.x1) * ratio,
        y: seg.y1 + (seg.y2 - seg.y1) * ratio,
      };
    }
    remaining -= seg.length;
  }

  const last = segments[segments.length - 1];
  return { x: last.x2, y: last.y2 };
}

/** Map screen coords back into viewBox space. */
export function screenToViewBox(
  x: number,
  y: number,
  viewBox: OverlayViewBox,
  width: number,
  height: number,
): OverlayPoint {
  return {
    x: Math.round((x / width) * viewBox.width),
    y: Math.round((y / height) * viewBox.height),
  };
}

/** Duration in ms — higher power → faster flow.
 *  Uses a power curve (ratio^0.5) for a natural perceptual mapping where
 *  speed ramps up quickly at low power and flattens toward max speed. */
export function flowDurationFromPower(
  powerW: number,
  minMs = 800,
  maxMs = 3000,
  powerCeilingW = 2000,
): number {
  "worklet";
  const clamped = Math.max(0, Math.min(powerW, powerCeilingW));
  const ratio = clamped / powerCeilingW;
  const curved = Math.sqrt(ratio);
  return maxMs - curved * (maxMs - minMs);
}

export function wireOpacity(
  active: boolean,
  powerW: number,
  idleOpacity = 0.22,
  powerCeilingW = 6000,
  activeFloor = 0.35,
  activeCeiling = 1,
): number {
  if (!active) return idleOpacity;
  const clamped = Math.max(0, Math.min(powerW, powerCeilingW));
  const span = Math.max(0, activeCeiling - activeFloor);
  return activeFloor + (clamped / powerCeilingW) * span;
}
