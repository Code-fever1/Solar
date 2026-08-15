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
    type SharedValue
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
  isIdleShared?: SharedValue<number>;
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
  isIdleShared,
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

  const dashOffset = useSharedValue(0);
  const pulse = useSharedValue(0.5);
  const dashTravel = useSharedValue(baseDashTravel);
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

  // Smooth power shared value — lerps toward target each frame for gradual speed changes
  const smoothPower = useSharedValue(flow.power);
  const direction = flow.reverse ? 1 : -1;

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

  // Continuous frame callback — advances dashOffset and pulse based on current power.
  // Both speed AND dash travel distance scale continuously with power.
  // No restarts, no jumps — everything lerps smoothly.
  useFrameCallback((info) => {
    "worklet";
    if (!isVisible) return;
    if (isIdleShared && isIdleShared.value === 1) return;

    // Lerp smoothPower toward flow.power (target)
    const target = flow.power;
    smoothPower.value += (target - smoothPower.value) * 0.08;

    // Duration from current smoothed power (continuous sqrt curve)
    const dur = flowDurationFromPower(smoothPower.value, minDurationMs, maxDurationMs, powerCeilingW);

    // Dash travel scales with power — more power = longer travel per cycle
    // Continuous: travel goes from 40% of base at idle to 160% of base at max
    const powerRatio = Math.max(0, Math.min(smoothPower.value / powerCeilingW, 1));
    const travelScale = 0.4 + Math.sqrt(powerRatio) * 1.2;
    dashTravel.value = baseDashTravel * travelScale;

    // Speed = dashTravel units per duration ms
    const speed = dashTravel.value / dur;
    const dt = info.timeSincePreviousFrame ?? 16;
    dashOffset.value += speed * dt * direction;

    // Pulse oscillates continuously
    const pulseDur = dur * 0.6;
    pulse.value += (dt / pulseDur) * Math.PI;
    if (pulse.value > Math.PI * 2) pulse.value -= Math.PI * 2;
  }, isVisible);

  // Animated dash phases — run on the UI thread via derived values.
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
          isIdleShared={isIdleShared}
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
  isIdleShared,
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
  isIdleShared?: SharedValue<number>;
}) {
  const progress = useSharedValue(0);
  const smoothPower = useSharedValue(power);

  // Continuous frame callback — advances progress based on current power.
  // Speed changes smoothly every frame as power lerps toward target.
  useFrameCallback((info) => {
    "worklet";
    if (!isVisible) return;
    if (isIdleShared && isIdleShared.value === 1) return;
    smoothPower.value += (power - smoothPower.value) * 0.08;
    const dur = flowDurationFromPower(
      smoothPower.value,
      wireStyle.minDurationMs ?? 1800,
      wireStyle.maxDurationMs ?? 10000,
      wireStyle.powerCeilingW ?? 6000,
    );
    const dt = info.timeSincePreviousFrame ?? 16;
    progress.value = (progress.value + dt / dur) % 1;
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
  isIdleShared?: SharedValue<number>;
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
  isIdleShared,
  solarHidden = false,
  gridHidden = false,
  inverterOutputHidden = false,
}: HeroOverlayEngineProps) {
  if (width <= 0 || height <= 0) return null;

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
          isIdleShared={isIdleShared}
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
            isIdleShared={isIdleShared}
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
          isIdleShared={isIdleShared}
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
          isIdleShared={isIdleShared}
        />
      </Canvas>
    </View>
  );
});
