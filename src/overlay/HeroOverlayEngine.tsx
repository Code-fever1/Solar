import {
    BlurMask,
    Canvas,
    DashPathEffect,
    Circle as SkiaCircle,
    Path as SkiaPath,
} from "@shopify/react-native-skia";
import { memo, useCallback, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
    useFrameCallback,
    useSharedValue,
    withTiming,
    type FrameInfo,
    type SharedValue,
} from "react-native-reanimated";

import {
    buildPathSegments,
    flowDurationFromPower,
    pointOnSegments,
    pointsToPathD,
    wireOpacity,
    wrapPhase,
    type PathSeg,
} from "./pathUtils";
import type {
    HeroOverlayConfig,
    OverlayPoint,
    OverlayViewBox,
    OverlayWireStyle,
    WireFlowState,
} from "./types";
import { getOverlayWireStyle } from "./wireStyles";

// iOS only keeps Reanimated's frame loop alive when the callback identity is
// stable. Recreating it on each render (or registering it from a component
// inside <Canvas>) stops the loop, so dashes and particles freeze. Android
// restarts the loop, which is why the same build still animates there.
// Drivers live in hooks on HeroOverlayEngine. Canvas children only read values.

const MAX_PARTICLES = 6;

type WireMotion = {
  pathD: string;
  strokeWidth: number;
  glowWidth: number;
  conduitWidth: number;
  conduitColor: string;
  conduitOpacity: number;
  trackOpacity: number;
  glowDash: number[];
  coreDash: number[];
  dashOffset: SharedValue<number>;
  coreDashOffset: SharedValue<number>;
  glowDashOpacity: SharedValue<number>;
  coreDashOpacity: SharedValue<number>;
  particleCount: number;
  particleSize: number;
  cx: SharedValue<number>[];
  cy: SharedValue<number>[];
  glowOpacity: SharedValue<number>[];
  coreOpacity: SharedValue<number>[];
};

function parseDashArray(s: string | undefined, fallback: string): number[] {
  const arr = (s ?? fallback)
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return arr.length >= 2 ? arr : [6, 18];
}

function useSix(initial: number): SharedValue<number>[] {
  const a = useSharedValue(initial);
  const b = useSharedValue(initial);
  const c = useSharedValue(initial);
  const d = useSharedValue(initial);
  const e = useSharedValue(initial);
  const f = useSharedValue(initial);
  return useMemo(() => [a, b, c, d, e, f], [a, b, c, d, e, f]);
}

function useWireMotion({
  points,
  viewBox,
  width,
  height,
  wireStyle,
  flow,
  isVisible,
  hidden,
  animationClock,
}: {
  points: OverlayPoint[];
  viewBox: OverlayViewBox;
  width: number;
  height: number;
  wireStyle: OverlayWireStyle;
  flow: WireFlowState;
  isVisible: boolean;
  hidden: boolean;
  animationClock: SharedValue<number>;
}): WireMotion {
  const pathD = useMemo(
    () => (width > 0 && height > 0 ? pointsToPathD(points, viewBox, width, height) : ""),
    [points, viewBox, width, height],
  );
  const pathSegments = useMemo(
    () => (width > 0 && height > 0 ? buildPathSegments(points, viewBox, width, height) : []),
    [points, viewBox, width, height],
  );

  const strokeWidth = wireStyle.strokeWidth ?? 2.5;
  const glowWidth = wireStyle.glowWidth ?? strokeWidth + 2;
  const conduitWidth = wireStyle.conduitWidth ?? strokeWidth + 4;
  const particleCount = Math.min(MAX_PARTICLES, Math.max(0, wireStyle.particleCount ?? 3));
  const glowDash = useMemo(
    () => parseDashArray(wireStyle.glowDashArray, wireStyle.dashArray ?? "10 14"),
    [wireStyle.glowDashArray, wireStyle.dashArray],
  );
  const coreDash = useMemo(
    () => parseDashArray(wireStyle.dashArray, "6 18"),
    [wireStyle.dashArray],
  );

  const segsSV = useSharedValue<PathSeg[]>(pathSegments);
  const visibleSV = useSharedValue(isVisible && !hidden);
  const powerSV = useSharedValue(flow.power);
  const smoothPower = useSharedValue(flow.power);
  const directionSV = useSharedValue(flow.reverse ? 1 : -1);
  const activeSV = useSharedValue(flow.active);
  const countSV = useSharedValue(particleCount);
  const dashTravelSV = useSharedValue(wireStyle.dashTravel ?? 48);
  const minDurSV = useSharedValue(wireStyle.minDurationMs ?? 1800);
  const maxDurSV = useSharedValue(wireStyle.maxDurationMs ?? 10000);
  const ceilingSV = useSharedValue(wireStyle.powerCeilingW ?? 6000);
  const idleSV = useSharedValue(wireStyle.idleOpacity ?? flow.idleOpacity ?? 0.18);
  const floorSV = useSharedValue(wireStyle.activeOpacityFloor ?? 0.35);
  const ceilOpSV = useSharedValue(wireStyle.activeOpacityCeiling ?? 1);
  const glowPeriodSV = useSharedValue((glowDash[0] ?? 10) + (glowDash[1] ?? 14));
  const corePeriodSV = useSharedValue((coreDash[0] ?? 6) + (coreDash[1] ?? 18));

  const dashOffset = useSharedValue(0);
  const coreDashOffset = useSharedValue(0);
  const pulse = useSharedValue(0.5);
  const targetOpacity = useSharedValue(
    wireOpacity(flow.active, flow.power, idleSV.value, ceilingSV.value, floorSV.value, ceilOpSV.value),
  );
  const glowDashOpacity = useSharedValue(0.4);
  const coreDashOpacity = useSharedValue(0.6);
  const prevClock = useSharedValue(-1);

  const cx = useSix(0);
  const cy = useSix(0);
  const glowOpacity = useSix(0);
  const coreOpacity = useSix(0);

  useEffect(() => {
    segsSV.value = pathSegments;
    const n = Math.min(particleCount, cx.length);
    for (let i = 0; i < n; i += 1) {
      const pt = pointOnSegments(pathSegments, i / Math.max(1, n));
      cx[i].value = pt.x;
      cy[i].value = pt.y;
    }
  }, [cx, cy, particleCount, pathSegments, segsSV]);

  useEffect(() => {
    visibleSV.value = isVisible && !hidden;
    powerSV.value = flow.power;
    directionSV.value = flow.reverse ? 1 : -1;
    activeSV.value = flow.active;
    countSV.value = particleCount;
    dashTravelSV.value = wireStyle.dashTravel ?? 48;
    minDurSV.value = wireStyle.minDurationMs ?? 1800;
    maxDurSV.value = wireStyle.maxDurationMs ?? 10000;
    ceilingSV.value = wireStyle.powerCeilingW ?? 6000;
    idleSV.value = wireStyle.idleOpacity ?? flow.idleOpacity ?? 0.18;
    floorSV.value = wireStyle.activeOpacityFloor ?? 0.35;
    ceilOpSV.value = wireStyle.activeOpacityCeiling ?? 1;
    glowPeriodSV.value = (glowDash[0] ?? 10) + (glowDash[1] ?? 14);
    corePeriodSV.value = (coreDash[0] ?? 6) + (coreDash[1] ?? 18);
    targetOpacity.value = withTiming(
      wireOpacity(
        flow.active,
        flow.power,
        idleSV.value,
        ceilingSV.value,
        floorSV.value,
        ceilOpSV.value,
      ),
      { duration: 400 },
    );
  }, [
    activeSV,
    ceilOpSV,
    ceilingSV,
    corePeriodSV,
    countSV,
    dashTravelSV,
    directionSV,
    flow.active,
    flow.idleOpacity,
    flow.power,
    flow.reverse,
    floorSV,
    glowDash,
    glowPeriodSV,
    coreDash,
    hidden,
    idleSV,
    isVisible,
    maxDurSV,
    minDurSV,
    particleCount,
    powerSV,
    targetOpacity,
    visibleSV,
    wireStyle,
  ]);

  const tick = useCallback((_info: FrameInfo) => {
    "worklet";
    if (!visibleSV.value) return;
    const clockDelta = animationClock.value - prevClock.value;
    if (clockDelta <= 0) return;
    prevClock.value = animationClock.value;

    const alpha = 1 - Math.exp(-clockDelta / 200);
    smoothPower.value += (powerSV.value - smoothPower.value) * alpha;

    const dur = flowDurationFromPower(
      smoothPower.value,
      minDurSV.value,
      maxDurSV.value,
      ceilingSV.value,
    );
    const powerRatio = Math.max(0, Math.min(smoothPower.value / ceilingSV.value, 1));
    const travelScale = 0.4 + Math.sqrt(powerRatio) * 1.2;
    const dashSpeed = (dashTravelSV.value * travelScale) / dur;
    const dir = directionSV.value;
    dashOffset.value = wrapPhase(
      dashOffset.value + dashSpeed * clockDelta * dir,
      glowPeriodSV.value,
    );
    coreDashOffset.value = wrapPhase(
      coreDashOffset.value + dashSpeed * 0.85 * clockDelta * dir,
      corePeriodSV.value,
    );

    const pulseDur = dur * 0.6;
    pulse.value += (clockDelta / pulseDur) * Math.PI;
    if (pulse.value > Math.PI * 2) pulse.value -= Math.PI * 2;
    const wave = 0.5 + 0.5 * Math.sin(pulse.value);
    glowDashOpacity.value = targetOpacity.value * (0.45 + wave * 0.25);
    coreDashOpacity.value = targetOpacity.value * (0.65 + wave * 0.2);

    const n = Math.min(countSV.value, cx.length);
    for (let i = 0; i < n; i += 1) {
      const progress = wrapPhase((animationClock.value / dur + i / Math.max(1, n)), 1);
      const t = dir > 0 ? 1 - progress : progress;
      const pt = pointOnSegments(segsSV.value, t);
      cx[i].value = pt.x;
      cy[i].value = pt.y;
      let glow = targetOpacity.value * (activeSV.value ? 0.85 : 0.35);
      let core = targetOpacity.value * (activeSV.value ? 1 : 0.45);
      if (t < 0.08) {
        const fade = t / 0.08;
        glow *= fade;
        core *= fade;
      } else if (t > 0.9) {
        const fade = (1 - t) / 0.1;
        glow *= fade;
        core *= fade;
      }
      glowOpacity[i].value = glow;
      coreOpacity[i].value = core;
    }
  }, [
    activeSV,
    animationClock,
    ceilingSV,
    coreDashOffset,
    coreDashOpacity,
    coreOpacity,
    corePeriodSV,
    countSV,
    cx,
    cy,
    dashOffset,
    dashTravelSV,
    directionSV,
    glowDashOpacity,
    glowOpacity,
    glowPeriodSV,
    maxDurSV,
    minDurSV,
    powerSV,
    prevClock,
    pulse,
    segsSV,
    smoothPower,
    targetOpacity,
    visibleSV,
  ]);

  useFrameCallback(tick, true);

  const powerRatio = Math.max(0, Math.min(flow.power / (wireStyle.powerCeilingW ?? 6000), 1));
  const minRadius = wireStyle.minParticleRadius ?? 2.1;
  const maxRadius = wireStyle.maxParticleRadius ?? 3.2;
  const particleSize =
    (flow.active ? minRadius : minRadius * 0.8) + (maxRadius - minRadius) * powerRatio;
  const trackOpacity = flow.active ? 0.28 : (wireStyle.idleOpacity ?? flow.idleOpacity ?? 0.18);

  return {
    pathD,
    strokeWidth,
    glowWidth,
    conduitWidth,
    conduitColor: wireStyle.conduitColor ?? "rgba(20, 30, 44, 0.75)",
    conduitOpacity: wireStyle.conduitOpacity ?? 0.78,
    trackOpacity,
    glowDash,
    coreDash,
    dashOffset,
    coreDashOffset,
    glowDashOpacity,
    coreDashOpacity,
    particleCount,
    particleSize,
    cx,
    cy,
    glowOpacity,
    coreOpacity,
  };
}

function WireGraphics({
  motion,
  color,
  glowColor,
  hidden,
}: {
  motion: WireMotion;
  color: string;
  glowColor: string;
  hidden: boolean;
}) {
  if (hidden || !motion.pathD) return null;
  return (
    <>
      <SkiaPath
        path={motion.pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={motion.conduitWidth}
        color={motion.conduitColor}
        opacity={motion.conduitOpacity}
      />
      <SkiaPath
        path={motion.pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={motion.glowWidth}
        color={color}
        opacity={motion.trackOpacity * 0.32}
      >
        <BlurMask blur={3} />
      </SkiaPath>
      <SkiaPath
        path={motion.pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={motion.strokeWidth}
        color={color}
        opacity={motion.trackOpacity}
      />
      <SkiaPath
        path={motion.pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={motion.glowWidth}
        color={glowColor}
        opacity={motion.glowDashOpacity}
      >
        <DashPathEffect intervals={motion.glowDash} phase={motion.dashOffset} />
        <BlurMask blur={3} />
      </SkiaPath>
      <SkiaPath
        path={motion.pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={motion.strokeWidth - 0.5}
        color={color}
        opacity={motion.coreDashOpacity}
      >
        <DashPathEffect intervals={motion.coreDash} phase={motion.coreDashOffset} />
      </SkiaPath>
      {motion.cx.slice(0, motion.particleCount).map((cx, i) => (
        <SkiaCircle
          key={i}
          cx={cx}
          cy={motion.cy[i]}
          r={motion.particleSize * 2.2}
          color={color}
          opacity={motion.glowOpacity[i]}
        >
          <BlurMask blur={3} />
        </SkiaCircle>
      ))}
      {motion.cx.slice(0, motion.particleCount).map((cx, i) => (
        <SkiaCircle
          key={`c-${i}`}
          cx={cx}
          cy={motion.cy[i]}
          r={motion.particleSize * 0.65}
          color={color}
          opacity={motion.coreOpacity[i]}
        />
      ))}
    </>
  );
}

export type HeroOverlayEngineProps = {
  config: HeroOverlayConfig;
  width: number;
  height: number;
  gridPathOverride?: OverlayPoint[];
  solarFlow: WireFlowState;
  gridFlow: WireFlowState;
  inverterOutputFlow?: WireFlowState;
  gridBypassFlow?: WireFlowState;
  isVisible?: boolean;
  animationFpsShared?: SharedValue<number>;
  solarHidden?: boolean;
  gridHidden?: boolean;
  inverterOutputHidden?: boolean;
};

export const HeroOverlayEngine = memo(function HeroOverlayEngine({
  config,
  width,
  height,
  gridPathOverride,
  solarFlow,
  gridFlow,
  inverterOutputFlow,
  gridBypassFlow,
  isVisible = true,
  animationFpsShared,
  solarHidden = false,
  gridHidden = false,
  inverterOutputHidden = false,
}: HeroOverlayEngineProps) {
  const animationClock = useSharedValue(0);
  const frameAccum = useSharedValue(0);
  const visibleSV = useSharedValue(isVisible);
  const localFps = useSharedValue(120);
  const fpsSV = animationFpsShared ?? localFps;

  useEffect(() => {
    visibleSV.value = isVisible;
  }, [isVisible, visibleSV]);

  const tickClock = useCallback((info: FrameInfo) => {
    "worklet";
    if (!visibleSV.value) return;
    const fps = fpsSV.value;
    if (fps === 0) return;
    const dt = info.timeSincePreviousFrame ?? 8.33;
    const interval = 1000 / fps;
    frameAccum.value += dt;
    if (frameAccum.value < interval) return;
    animationClock.value += frameAccum.value;
    frameAccum.value = 0;
  }, [animationClock, fpsSV, frameAccum, visibleSV]);

  useFrameCallback(tickClock, true);

  const gridPoints = gridPathOverride ?? config.gridPath;
  const gridStyle = getOverlayWireStyle(config, "grid");
  const solarStyle = getOverlayWireStyle(config, "solar");
  const inverterStyle = getOverlayWireStyle(config, "inverterOutput");
  const inverterFlow: WireFlowState = inverterOutputFlow ?? {
    active: solarFlow.active || gridFlow.active,
    power: Math.max(solarFlow.power, gridFlow.power),
    color: "#45E376",
    glowColor: "#2DDB6C",
    idleOpacity: 0.2,
  };
  const bypassFlow: WireFlowState = gridBypassFlow ?? {
    active: false,
    power: 0,
    color: "#6E9BFF",
    glowColor: "#6E9BFF",
  };

  const gridMotion = useWireMotion({
    points: gridPoints,
    viewBox: config.viewBox,
    width,
    height,
    wireStyle: gridStyle,
    flow: gridFlow,
    isVisible,
    hidden: gridHidden,
    animationClock,
  });
  const bypassMotion = useWireMotion({
    points: config.gridBypassPath ?? [],
    viewBox: config.viewBox,
    width,
    height,
    wireStyle: gridStyle,
    flow: bypassFlow,
    isVisible,
    hidden: !gridBypassFlow || !config.gridBypassPath?.length,
    animationClock,
  });
  const solarMotion = useWireMotion({
    points: config.solarPath,
    viewBox: config.viewBox,
    width,
    height,
    wireStyle: solarStyle,
    flow: solarFlow,
    isVisible,
    hidden: solarHidden,
    animationClock,
  });
  const inverterMotion = useWireMotion({
    points: config.inverterOutputPath,
    viewBox: config.viewBox,
    width,
    height,
    wireStyle: inverterStyle,
    flow: inverterFlow,
    isVisible,
    hidden: inverterOutputHidden,
    animationClock,
  });

  if (width <= 0 || height <= 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <WireGraphics motion={gridMotion} color={gridFlow.color} glowColor={gridFlow.glowColor} hidden={gridHidden} />
        <WireGraphics motion={bypassMotion} color={bypassFlow.color} glowColor={bypassFlow.glowColor} hidden={!gridBypassFlow || !config.gridBypassPath?.length} />
        <WireGraphics motion={solarMotion} color={solarFlow.color} glowColor={solarFlow.glowColor} hidden={solarHidden} />
        <WireGraphics motion={inverterMotion} color={inverterFlow.color} glowColor={inverterFlow.glowColor} hidden={inverterOutputHidden} />
      </Canvas>
    </View>
  );
});
