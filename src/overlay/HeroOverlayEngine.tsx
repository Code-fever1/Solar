import {
    BlurMask,
    Canvas,
    DashPathEffect,
    Circle as SkiaCircle,
    Path as SkiaPath,
} from "@shopify/react-native-skia";
import { memo, useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
    useDerivedValue,
    useFrameCallback,
    useSharedValue,
    withTiming,
    type SharedValue,
} from "react-native-reanimated";

import {
    flowDurationFromPower,
    getPointOnPath,
    pointsToPathD,
    wireOpacity,
} from "./pathUtils";
import type {
    HeroOverlayConfig,
    OverlayPoint,
    OverlayWireStyle,
    WireFlowState,
} from "./types";
import { getOverlayWireStyle } from "./wireStyles";

// ── Animation Scheduler Architecture ──
//
// ONE useFrameCallback (the scheduler) in HeroOverlayEngine advances a shared
// `animationClock` value at the target FPS (120/60/30/10/0). The clock only
// advances when the frame accumulator reaches the target interval (1000/fps).
//
// WireStream and WireParticle each have a useFrameCallback that CONSUMES the
// clock — they read the clock delta and update their stateful values. They do
// NOT advance the clock; they only read it. Between clock ticks, the delta is
// zero and they skip all work.
//
// This is fundamentally different from the old "skip work inside a 120Hz
// callback" approach:
//   - The clock is the single source of animation time, advanced at target FPS
//   - Visual elements consume the clock delta, not the raw device frame time
//   - At 30 FPS, the clock advances every ~33ms → visual steps are larger
//   - At 10 FPS, the clock advances every ~100ms → obvious low-FPS motion
//   - Real-world speed is preserved via time-based progression (dt/duration)

type WireStreamProps = {
  wireId: string;
  points: HeroOverlayConfig["solarPath"];
  viewBox: HeroOverlayConfig["viewBox"];
  width: number;
  height: number;
  wireStyle: OverlayWireStyle;
  flow: WireFlowState;
  isVisible: boolean;
  hidden?: boolean;
  animationClock: SharedValue<number>;
};

function parseDashArray(s: string | undefined, fallback: string): number[] {
  const arr = (s ?? fallback)
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return arr.length >= 2 ? arr : [6, 18];
}

function WireStream({
  wireId,
  points,
  viewBox,
  width,
  height,
  wireStyle,
  flow,
  isVisible,
  hidden = false,
  animationClock,
}: WireStreamProps) {
  const pathD = useMemo(
    () => pointsToPathD(points, viewBox, width, height),
    [points, viewBox, width, height],
  );

  const strokeWidth = wireStyle.strokeWidth ?? 2.5;
  const glowWidth = wireStyle.glowWidth ?? strokeWidth + 2;
  const conduitWidth = wireStyle.conduitWidth ?? strokeWidth + 4;
  const baseDashTravel = wireStyle.dashTravel ?? 48;
  const particleCount = wireStyle.particleCount ?? 3;
  const minDurationMs = wireStyle.minDurationMs ?? 1800;
  const maxDurationMs = wireStyle.maxDurationMs ?? 10000;
  const powerCeilingW = wireStyle.powerCeilingW ?? 6000;
  const idleOpacity = wireStyle.idleOpacity ?? flow.idleOpacity ?? 0.18;
  const activeOpacityFloor = wireStyle.activeOpacityFloor ?? 0.35;
  const activeOpacityCeiling = wireStyle.activeOpacityCeiling ?? 1;

  const glowDash = useMemo(
    () => parseDashArray(wireStyle.glowDashArray, wireStyle.dashArray ?? "10 14"),
    [wireStyle.glowDashArray, wireStyle.dashArray],
  );
  const coreDash = useMemo(
    () => parseDashArray(wireStyle.dashArray, "6 18"),
    [wireStyle.dashArray],
  );

  // ── Stateful animation values ──
  const dashOffset = useSharedValue(0);
  const pulse = useSharedValue(0.5);
  const smoothPower = useSharedValue(flow.power);
  const prevClock = useSharedValue(-1);

  // ── Target opacity (data-driven, animated via withTiming) ──
  const targetOpacity = useSharedValue(
    wireOpacity(
      flow.active,
      flow.power,
      idleOpacity,
      powerCeilingW,
      activeOpacityFloor,
      activeOpacityCeiling,
    ),
  );

  useEffect(() => {
    targetOpacity.value = withTiming(
      wireOpacity(
        flow.active,
        flow.power,
        idleOpacity,
        powerCeilingW,
        activeOpacityFloor,
        activeOpacityCeiling,
      ),
      { duration: 400 },
    );
  }, [
    activeOpacityCeiling,
    activeOpacityFloor,
    flow.active,
    flow.power,
    idleOpacity,
    powerCeilingW,
    targetOpacity,
  ]);

  const direction = flow.reverse ? 1 : -1;

  // ── Consume the animation clock ──
  // This callback runs at the device refresh rate but only does work when the
  // clock has advanced (i.e., at the target FPS). When clockDelta is 0, all
  // work is skipped. The clock is advanced by the single scheduler in
  // HeroOverlayEngine — this callback is a consumer, not an independent clock.
  useFrameCallback(() => {
    "worklet";
    if (!isVisible) return;
    const clockDelta = animationClock.value - prevClock.value;
    if (clockDelta <= 0) return;
    prevClock.value = animationClock.value;

    // Frame-rate independent exponential smoothing for power.
    // tau = 200ms time constant → same convergence rate at any FPS.
    const alpha = 1 - Math.exp(-clockDelta / 200);
    smoothPower.value += (flow.power - smoothPower.value) * alpha;

    // Duration from smoothed power
    const dur = flowDurationFromPower(
      smoothPower.value,
      minDurationMs,
      maxDurationMs,
      powerCeilingW,
    );

    // Dash travel scales with power
    const powerRatio = Math.max(0, Math.min(smoothPower.value / powerCeilingW, 1));
    const travelScale = 0.4 + Math.sqrt(powerRatio) * 1.2;
    const dashTravel = baseDashTravel * travelScale;

    // Advance dash offset — time-based, so speed is constant in real-world time
    const dashSpeed = dashTravel / dur;
    dashOffset.value += dashSpeed * clockDelta * direction;

    // Advance pulse oscillation
    const pulseDur = dur * 0.6;
    pulse.value += (clockDelta / pulseDur) * Math.PI;
    if (pulse.value > Math.PI * 2) pulse.value -= Math.PI * 2;
  }, isVisible);

  // ── Derived visual values (computed on UI thread from shared values) ──
  const glowPhase = useDerivedValue(() => dashOffset.value);
  const corePhase = useDerivedValue(() => dashOffset.value * 0.85);
  const glowDashOpacity = useDerivedValue(
    () => targetOpacity.value * (0.45 + (0.5 + 0.5 * Math.sin(pulse.value)) * 0.25),
  );
  const coreDashOpacity = useDerivedValue(
    () => targetOpacity.value * (0.65 + (0.5 + 0.5 * Math.sin(pulse.value)) * 0.2),
  );

  const trackOpacity = flow.active ? 0.28 : idleOpacity;

  if (hidden) return null;

  return (
    <>
      {/* Conduit (background track) */}
      <SkiaPath
        path={pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={conduitWidth}
        color={wireStyle.conduitColor ?? "rgba(20, 30, 44, 0.75)"}
        opacity={wireStyle.conduitOpacity ?? 0.78}
      />
      {/* Glow track (static, blurred) */}
      <SkiaPath
        path={pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={glowWidth}
        color={flow.color}
        opacity={trackOpacity * 0.32}
      >
        <BlurMask blur={3} />
      </SkiaPath>
      {/* Core track (static) */}
      <SkiaPath
        path={pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={strokeWidth}
        color={flow.color}
        opacity={trackOpacity}
      />
      {/* Glow dash (animated) */}
      <SkiaPath
        path={pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={glowWidth}
        color={flow.glowColor}
        opacity={glowDashOpacity}
      >
        <DashPathEffect intervals={glowDash} phase={glowPhase} />
        <BlurMask blur={3} />
      </SkiaPath>
      {/* Core dash (animated) */}
      <SkiaPath
        path={pathD}
        style="stroke"
        strokeJoin="round"
        strokeCap="round"
        strokeWidth={strokeWidth - 0.5}
        color={flow.color}
        opacity={coreDashOpacity}
      >
        <DashPathEffect intervals={coreDash} phase={corePhase} />
      </SkiaPath>
      {Array.from({ length: particleCount }).map((_, i) => (
        <WireParticle
          key={`${wireId}-p-${i}`}
          points={points}
          viewBox={viewBox}
          width={width}
          height={height}
          color={flow.color}
          offset={i / particleCount}
          duration={flowDurationFromPower(flow.power, minDurationMs, maxDurationMs, powerCeilingW)}
          active={flow.active}
          power={flow.power}
          opacity={targetOpacity}
          isVisible={isVisible}
          wireStyle={wireStyle}
          reverse={flow.reverse}
          animationClock={animationClock}
        />
      ))}
    </>
  );
}

function WireParticle({
  points,
  viewBox,
  width,
  height,
  color,
  offset,
  duration: _duration,
  active,
  power,
  opacity,
  isVisible,
  wireStyle,
  reverse,
  animationClock,
}: {
  points: HeroOverlayConfig["solarPath"];
  viewBox: HeroOverlayConfig["viewBox"];
  width: number;
  height: number;
  color: string;
  offset: number;
  duration: number;
  active: boolean;
  power: number;
  opacity: SharedValue<number>;
  isVisible: boolean;
  wireStyle: OverlayWireStyle;
  reverse?: boolean;
  animationClock: SharedValue<number>;
}) {
  const progress = useSharedValue(0);
  const smoothPower = useSharedValue(power);
  const prevClock = useSharedValue(-1);

  // ── Consume the animation clock ──
  // Progress advances by clockDelta/duration each clock tick. At 120 FPS,
  // clockDelta ≈ 8.33ms (tiny steps). At 10 FPS, clockDelta ≈ 100ms (large
  // steps). But progress += clockDelta/dur means the total travel time is
  // the same — only the visual smoothness changes.
  useFrameCallback(() => {
    "worklet";
    if (!isVisible) return;
    const clockDelta = animationClock.value - prevClock.value;
    if (clockDelta <= 0) return;
    prevClock.value = animationClock.value;

    // Frame-rate independent power smoothing
    const alpha = 1 - Math.exp(-clockDelta / 200);
    smoothPower.value += (power - smoothPower.value) * alpha;
    const dur = flowDurationFromPower(
      smoothPower.value,
      wireStyle.minDurationMs ?? 1800,
      wireStyle.maxDurationMs ?? 10000,
      wireStyle.powerCeilingW ?? 6000,
    );
    progress.value = (progress.value + clockDelta / dur) % 1;
  }, isVisible);

  const powerRatio = Math.max(
    0,
    Math.min(power / (wireStyle.powerCeilingW ?? 6000), 1),
  );
  const minRadius = wireStyle.minParticleRadius ?? 2.1;
  const maxRadius = wireStyle.maxParticleRadius ?? 3.2;
  const size =
    (active ? minRadius : minRadius * 0.8) +
    (maxRadius - minRadius) * powerRatio;

  const cx = useDerivedValue(() => {
    const raw = (progress.value + offset) % 1;
    const t = reverse ? 1 - raw : raw;
    return getPointOnPath(points, t, viewBox, width, height).x;
  });
  const cy = useDerivedValue(() => {
    const raw = (progress.value + offset) % 1;
    const t = reverse ? 1 - raw : raw;
    return getPointOnPath(points, t, viewBox, width, height).y;
  });
  const glowOpacity = useDerivedValue(() => {
    const raw = (progress.value + offset) % 1;
    const t = reverse ? 1 - raw : raw;
    let alpha = opacity.value * (active ? 0.85 : 0.35);
    if (t < 0.08) alpha *= t / 0.08;
    else if (t > 0.9) alpha *= (1 - t) / 0.1;
    return alpha;
  });
  const coreOpacity = useDerivedValue(() => {
    const raw = (progress.value + offset) % 1;
    const t = reverse ? 1 - raw : raw;
    let alpha = opacity.value * (active ? 1 : 0.45);
    if (t < 0.08) alpha *= t / 0.08;
    else if (t > 0.9) alpha *= (1 - t) / 0.1;
    return alpha;
  });

  return (
    <>
      <SkiaCircle cx={cx} cy={cy} r={size * 2.2} color={color} opacity={glowOpacity}>
        <BlurMask blur={3} />
      </SkiaCircle>
      <SkiaCircle cx={cx} cy={cy} r={size * 0.65} color={color} opacity={coreOpacity} />
    </>
  );
}

export type HeroOverlayEngineProps = {
  config: HeroOverlayConfig;
  width: number;
  height: number;
  /** When set, overrides config.gridPath (e.g. bypass mode). */
  gridPathOverride?: OverlayPoint[];
  solarFlow: WireFlowState;
  gridFlow: WireFlowState;
  inverterOutputFlow?: WireFlowState;
  /** When set, renders a second grid wire (grid → DB bypass path) alongside the normal grid path. */
  gridBypassFlow?: WireFlowState;
  isVisible?: boolean;
  animationFpsShared?: SharedValue<number>;
  /** When true, the solar wire stream is not rendered at all. */
  solarHidden?: boolean;
  /** When true, the grid wire stream is not rendered at all. */
  gridHidden?: boolean;
  /** When true, the inverter output wire stream is not rendered at all. */
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
  if (width <= 0 || height <= 0) return null;

  // ── Animation Clock (the single scheduler) ──
  // ONE useFrameCallback advances animationClock at the target FPS using a
  // time accumulator. All WireStreams and WireParticles consume this clock
  // via their own useFrameCallback (reading the clock delta). They do NOT
  // advance the clock — they only read it. Between clock ticks, the delta
  // is zero and all consumer work is skipped.
  const animationClock = useSharedValue(0);
  const frameAccum = useSharedValue(0);
  // Dev instrumentation: measure actual animation tick rate
  const _devTickTs = useSharedValue(0);
  const _devTickCount = useSharedValue(0);

  useFrameCallback((info) => {
    "worklet";
    if (!isVisible) return;
    const fps = animationFpsShared ? animationFpsShared.value : 120;
    if (fps === 0) return;

    const dt = info.timeSincePreviousFrame ?? 8.33;
    const interval = 1000 / fps;
    frameAccum.value += dt;
    if (frameAccum.value < interval) return;

    // Advance the clock by the accumulated real time. This ensures:
    //   - At 120 FPS: clock advances ~8.33ms per tick (every frame on 120Hz)
    //   - At 60 FPS:  clock advances ~16.67ms per tick (every 2nd frame)
    //   - At 30 FPS:  clock advances ~33.33ms per tick (every 4th frame)
    //   - At 10 FPS:  clock advances ~100ms per tick (every 12th frame)
    // Visual elements see larger clockDelta at lower FPS → larger position
    // jumps, but same real-world travel duration.
    animationClock.value += frameAccum.value;
    frameAccum.value = 0;

    // Dev instrumentation: count ticks per second
    const now = info.timestamp;
    const prevTs = _devTickTs.value;
    if (prevTs === 0) {
      _devTickTs.value = now;
      _devTickCount.value = 0;
    } else if (now - prevTs >= 1000) {
      const measuredFps = Math.round((_devTickCount.value * 1000) / (now - prevTs));
      // eslint-disable-next-line no-console
      console.log(`[AnimFPS] target=${fps} actual≈${measuredFps}`);
      _devTickTs.value = now;
      _devTickCount.value = 0;
    }
    _devTickCount.value += 1;
  }, isVisible);

  const gridPathPoints = gridPathOverride ?? config.gridPath;

  const inverterFlow: WireFlowState = inverterOutputFlow ?? {
    active: solarFlow.active || gridFlow.active,
    power: Math.max(solarFlow.power, gridFlow.power),
    color: "#45E376",
    glowColor: "#2DDB6C",
    idleOpacity: 0.2,
  };

  const gridWireStyle = getOverlayWireStyle(config, "grid");
  const solarWireStyle = getOverlayWireStyle(config, "solar");
  const inverterWireStyle = getOverlayWireStyle(config, "inverterOutput");

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width, height }}>
        <WireStream
          wireId="grid"
          points={gridPathPoints}
          viewBox={config.viewBox}
          width={width}
          height={height}
          wireStyle={gridWireStyle}
          flow={gridFlow}
          isVisible={isVisible}
          hidden={gridHidden}
          animationClock={animationClock}
        />
        {gridBypassFlow && config.gridBypassPath && (
          <WireStream
            wireId="gridBypass"
            points={config.gridBypassPath}
            viewBox={config.viewBox}
            width={width}
            height={height}
            wireStyle={gridWireStyle}
            flow={gridBypassFlow}
            isVisible={isVisible}
            hidden={false}
            animationClock={animationClock}
          />
        )}
        <WireStream
          wireId="solar"
          points={config.solarPath}
          viewBox={config.viewBox}
          width={width}
          height={height}
          wireStyle={solarWireStyle}
          flow={solarFlow}
          isVisible={isVisible}
          hidden={solarHidden}
          animationClock={animationClock}
        />
        <WireStream
          wireId="inverterOutput"
          points={config.inverterOutputPath}
          viewBox={config.viewBox}
          width={width}
          height={height}
          wireStyle={inverterWireStyle}
          flow={inverterFlow}
          isVisible={isVisible}
          hidden={inverterOutputHidden}
          animationClock={animationClock}
        />
      </Canvas>
    </View>
  );
});
