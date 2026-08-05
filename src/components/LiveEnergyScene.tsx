import {
  BlurMask,
  Canvas,
  Group,
  Circle as SkiaCircle,
  LinearGradient as SkiaLinearGradient,
  Path as SkiaPath,
  vec,
} from "@shopify/react-native-skia";
import { RefreshCw, SunMedium, TowerControl } from "lucide-react-native";
import { memo, useEffect, useState } from "react";
import { AppState, Image, Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import type { InverterTelemetry, WeatherState } from "@/context/energy-types";
import type { TomznLive } from "@/context/EnergyContext";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Fixed aspect ratio for the card so day/night backgrounds never change sizing.
const CARD_ASPECT = 1600 / 899;

// ── Layer 1 — Conduit-style guide paths (90° routing) ───────────────────
// Real cable routing: solar panel (left) and grid tower (right) both go
// straight up, turn 90°, and connect to the inverter hub (center).
// Home stream goes from inverter straight up to the home label.
const SOLAR_CTRL: CtrlArray = [
  { x: 40, y: 185 },   // solar panel (left, bottom)
  { x: 40, y: 136 },   // straight up
  { x: 48, y: 130 },   // tight 90° corner
  { x: 230, y: 130 },  // horizontal to inverter hub
];

const GRID_CTRL: CtrlArray = [
  { x: 420, y: 185 },  // grid tower (right, bottom)
  { x: 420, y: 136 },  // straight up
  { x: 412, y: 130 },  // tight 90° corner
  { x: 230, y: 130 },  // horizontal to inverter hub
];

const HOME_CTRL: CtrlArray = [
  { x: 230, y: 130 },  // inverter hub (center)
  { x: 230, y: 100 },  // straight up
  { x: 230, y: 75 },   // continue up
  { x: 230, y: 50 },   // to home label (center top)
];

const HUB_X = 230;
const HUB_Y = 130;

const SOLAR_PATH_D = `M ${SOLAR_CTRL[0].x} ${SOLAR_CTRL[0].y} C ${SOLAR_CTRL[1].x} ${SOLAR_CTRL[1].y}, ${SOLAR_CTRL[2].x} ${SOLAR_CTRL[2].y}, ${SOLAR_CTRL[3].x} ${SOLAR_CTRL[3].y}`;
const GRID_PATH_D = `M ${GRID_CTRL[0].x} ${GRID_CTRL[0].y} C ${GRID_CTRL[1].x} ${GRID_CTRL[1].y}, ${GRID_CTRL[2].x} ${GRID_CTRL[2].y}, ${GRID_CTRL[3].x} ${GRID_CTRL[3].y}`;
const HOME_PATH_D = `M ${HOME_CTRL[0].x} ${HOME_CTRL[0].y} C ${HOME_CTRL[1].x} ${HOME_CTRL[1].y}, ${HOME_CTRL[2].x} ${HOME_CTRL[2].y}, ${HOME_CTRL[3].x} ${HOME_CTRL[3].y}`;

type CtrlPoint = { x: number; y: number };
type CtrlArray = readonly [CtrlPoint, CtrlPoint, CtrlPoint, CtrlPoint];

type SceneProps = { inverter: InverterTelemetry; weather: WeatherState; offline: boolean; tomznLive: TomznLive; inverterOff: boolean; loadStatus?: 'Low' | 'Normal' | 'High'; normalDrawKw?: number; isVisible?: boolean };

function formatPowerShort(watts: number) {
  if (watts >= 1000) return { value: (watts / 1000).toFixed(2), unit: "kW" };
  return { value: String(Math.round(watts)), unit: "W" };
}

// ── Layer 4 — Moving Energy Particles ───────────────────────────────────
// Animated circles travelling along the Bézier curve. NOT stroke-dasharray.
// Each particle fades in at the source and fades out as it merges into the hub.
function Particle({
  ctrl,
  color,
  offset,
  duration,
  size,
  activeOpacity,
}: {
  ctrl: CtrlArray;
  color: string;
  offset: number;
  duration: number;
  size: number;
  activeOpacity: SharedValue<number>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [duration, progress]);

  const animatedProps = useAnimatedProps(() => {
    const t = (progress.value + offset) % 1;
    const u = 1 - t;
    const x = u * u * u * ctrl[0].x + 3 * u * u * t * ctrl[1].x + 3 * u * t * t * ctrl[2].x + t * t * t * ctrl[3].x;
    const y = u * u * u * ctrl[0].y + 3 * u * u * t * ctrl[1].y + 3 * u * t * t * ctrl[2].y + t * t * t * ctrl[3].y;
    let opacity = activeOpacity.value;
    if (t < 0.08) opacity *= t / 0.08;
    else if (t > 0.88) opacity *= (1 - t) / 0.12;
    return { cx: x, cy: y, opacity };
  });

  return (
    <>
      {/* Glow halo */}
      <AnimatedCircle animatedProps={animatedProps} r={size * 2.8} fill={color} filter="url(#particleGlow)" />
      {/* Sharp core */}
      <AnimatedCircle animatedProps={animatedProps} r={size * 0.7} fill={color} />
    </>
  );
}

// ── Layer 4b — Bubble Energy Particles (Home stream only) ────────────────
// Particles stay fixed at the stream's start point and expand like a bubble:
// grow from original size to 4x while fading out, then restart.
function BubbleParticle({
  ctrl,
  color,
  offset,
  duration,
  size,
  activeOpacity,
}: {
  ctrl: CtrlArray;
  color: string;
  offset: number;
  duration: number;
  size: number;
  activeOpacity: SharedValue<number>;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [duration, progress]);

  const startX = ctrl[0].x;
  const startY = ctrl[0].y;

  const glowProps = useAnimatedProps(() => {
    const t = (progress.value + offset) % 1;
    const scale = 1 + t * 3;
    const opacity = activeOpacity.value * (1 - t);
    return { cx: startX, cy: startY, r: size * 2.8 * scale, opacity };
  });

  const coreProps = useAnimatedProps(() => {
    const t = (progress.value + offset) % 1;
    const scale = 1 + t * 3;
    const opacity = activeOpacity.value * (1 - t);
    return { cx: startX, cy: startY, r: size * 0.7 * scale, opacity };
  });

  return (
    <>
      <AnimatedCircle animatedProps={glowProps} fill={color} filter="url(#particleGlow)" />
      <AnimatedCircle animatedProps={coreProps} fill={color} />
    </>
  );
}

// ── Layers 2 + 3 + 4 — Full Stream ──────────────────────────────────────
function StreamLayer({
  ctrl,
  pathD,
  glowColor,
  streamId,
  active,
  power,
  particleColor,
  strokeWidth = 2.5,
  bubble = false,
}: {
  ctrl: CtrlArray;
  pathD: string;
  glowColor: string;
  streamId: string;
  active: boolean;
  power: number;
  particleColor: string;
  strokeWidth?: number;
  bubble?: boolean;
}) {
  const activeOpacity = useSharedValue(active ? 1 : 0);
  const pulse = useSharedValue(0.85);

  useEffect(() => {
    activeOpacity.value = withTiming(active ? 1 : 0, { duration: 500 });
  }, [active, activeOpacity]);

  useEffect(() => {
    if (active) {
      pulse.value = 0.85;
      pulse.value = withRepeat(
        withSequence(withTiming(1, { duration: 1000 }), withTiming(0.7, { duration: 1000 })),
        -1,
        false,
      );
    }
  }, [active, pulse]);

  // Particle count scales with power: 0W→0, 500W→1, 1500W→2, 4000W→4, 8000W→8
  const particleCount = active ? Math.min(8, Math.max(1, Math.round(power / 1000))) : 0;
  // Duration: 6s at low power → 2s at high power
  const duration = Math.max(2000, 6000 - (power / 8000) * 4000);
  // Particle size: 3px at low power → 5px at high power
  const particleSize = 3 + Math.min(2, power / 4000);

  const glowProps = useAnimatedProps(() => ({ opacity: activeOpacity.value * 0.2 }));
  const streamProps = useAnimatedProps(() => ({ opacity: activeOpacity.value * pulse.value }));

  return (
    <>
      {/* Layer 2 — Base Glow (ambient halo) */}
      <AnimatedPath
        d={pathD}
        stroke={glowColor}
        strokeWidth={strokeWidth + 3}
        fill="none"
        strokeLinecap="round"
        animatedProps={glowProps}
        filter="url(#streamGlow)"
      />
      {/* Layer 3 — Main Stream (gradient, pulsing) */}
      <AnimatedPath
        d={pathD}
        stroke={`url(#${streamId})`}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        animatedProps={streamProps}
      />
      {/* Layer 4 — Energy Particles (moving or bubble) */}
      {Array.from({ length: particleCount }).map((_, i) => (
        bubble ? (
          <BubbleParticle
            key={`b-${particleCount}-${i}`}
            ctrl={ctrl}
            color={particleColor}
            offset={i / particleCount}
            duration={duration}
            size={particleSize}
            activeOpacity={activeOpacity}
          />
        ) : (
          <Particle
            key={`p-${particleCount}-${i}`}
            ctrl={ctrl}
            color={particleColor}
            offset={i / particleCount}
            duration={duration}
            size={particleSize}
            activeOpacity={activeOpacity}
          />
        )
      ))}
    </>
  );
}

// ── Inverter Hub — central junction node where all energy converges ────
function InverterHub({ solarActive, gridActive, homeActive }: { solarActive: boolean; gridActive: boolean; homeActive: boolean }) {
  const breath = useSharedValue(0.3);
  const anyActive = solarActive || gridActive || homeActive;

  useEffect(() => {
    breath.value = 0.3;
    breath.value = withRepeat(
      withSequence(
        withTiming(anyActive ? 0.8 : 0.4, { duration: 1000 }),
        withTiming(anyActive ? 0.3 : 0.2, { duration: 1000 }),
      ),
      -1,
      false,
    );
  }, [anyActive, breath]);

  const glowProps = useAnimatedProps(() => ({
    r: 10 + breath.value * 12,
    opacity: breath.value * 0.35,
  }));

  const coreProps = useAnimatedProps(() => ({
    r: 4 + breath.value * 3,
    opacity: breath.value * 0.7,
  }));

  const ringProps = useAnimatedProps(() => ({
    r: 8 + breath.value * 2,
    opacity: anyActive ? 0.5 : 0.2,
  }));

  return (
    <>
      {/* Outer glow */}
      <AnimatedCircle cx={HUB_X} cy={HUB_Y} animatedProps={glowProps} fill="#5EE6FF" filter="url(#hubGlow)" />
      {/* Static ring */}
      <AnimatedCircle cx={HUB_X} cy={HUB_Y} animatedProps={ringProps} fill="none" stroke="#5EE6FF" strokeWidth={1.5} />
      {/* Bright core */}
      <AnimatedCircle cx={HUB_X} cy={HUB_Y} animatedProps={coreProps} fill="#E0F8FF" />
    </>
  );
}

function SkiaParticle({ ctrl, color, offset, progress, size, activeOpacity }: { ctrl: CtrlArray; color: string; offset: number; progress: SharedValue<number>; size: number; activeOpacity: SharedValue<number> }) {
  const cx = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    const u = 1 - t;
    return u * u * u * ctrl[0].x + 3 * u * u * t * ctrl[1].x + 3 * u * t * t * ctrl[2].x + t * t * t * ctrl[3].x;
  });
  const cy = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    const u = 1 - t;
    return u * u * u * ctrl[0].y + 3 * u * u * t * ctrl[1].y + 3 * u * t * t * ctrl[2].y + t * t * t * ctrl[3].y;
  });
  const opacity = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    if (t < 0.08) return activeOpacity.value * t / 0.08;
    if (t > 0.88) return activeOpacity.value * (1 - t) / 0.12;
    return activeOpacity.value;
  });

  return (
    <>
      <SkiaCircle cx={cx} cy={cy} r={size * 2.8} color={color} opacity={opacity}>
        <BlurMask blur={2} />
      </SkiaCircle>
      <SkiaCircle cx={cx} cy={cy} r={size * 0.7} color={color} opacity={opacity} />
    </>
  );
}

// Bubble variant for Home stream — expands at start point instead of traveling
function SkiaBubbleParticle({ ctrl, color, offset, progress, size, activeOpacity }: { ctrl: CtrlArray; color: string; offset: number; progress: SharedValue<number>; size: number; activeOpacity: SharedValue<number> }) {
  const startX = ctrl[0].x;
  const startY = ctrl[0].y;

  const glowRadius = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    return size * 2.8 * (1 + t * 3);
  });
  const coreRadius = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    return size * 0.7 * (1 + t * 3);
  });
  const opacity = useDerivedValue(() => {
    const t = (progress.value + offset) % 1;
    return activeOpacity.value * (1 - t);
  });

  return (
    <>
      <SkiaCircle cx={startX} cy={startY} r={glowRadius} color={color} opacity={opacity}>
        <BlurMask blur={2} />
      </SkiaCircle>
      <SkiaCircle cx={startX} cy={startY} r={coreRadius} color={color} opacity={opacity} />
    </>
  );
}

function SkiaStreamLayer({ ctrl, path, glowColor, gradientStart, gradientEnd, gradientColors, active, power, particleColor, strokeWidth = 2.5, isVisible, bubble = false }: { ctrl: CtrlArray; path: string; glowColor: string; gradientStart: CtrlPoint; gradientEnd: CtrlPoint; gradientColors: string[]; active: boolean; power: number; particleColor: string; strokeWidth?: number; isVisible: boolean; bubble?: boolean }) {
  const activeOpacity = useSharedValue(active ? 1 : 0);
  const pulse = useSharedValue(0.85);
  const progress = useSharedValue(0);
  const particleCount = active ? Math.min(8, Math.max(1, Math.round(power / 1000))) : 0;
  const duration = Math.max(2000, 6000 - power / 8000 * 4000);
  const particleSize = 3 + Math.min(2, power / 4000);
  const glowOpacity = useDerivedValue(() => activeOpacity.value * 0.2);
  const streamOpacity = useDerivedValue(() => activeOpacity.value * pulse.value);

  useEffect(() => {
    activeOpacity.value = withTiming(active ? 1 : 0, { duration: 500 });
  }, [active, activeOpacity]);

  useEffect(() => {
    cancelAnimation(progress);
    if (!active || !isVisible) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
  }, [active, duration, isVisible, progress]);

  useEffect(() => {
    cancelAnimation(pulse);
    if (!active || !isVisible) {
      pulse.value = 0.85;
      return;
    }
    pulse.value = 0.85;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1000 }), withTiming(0.7, { duration: 1000 })), -1, false);
  }, [active, isVisible, pulse]);

  return (
    <>
      <SkiaPath path={path} color={glowColor} style="stroke" strokeWidth={strokeWidth + 3} strokeCap="round" opacity={glowOpacity}>
        <BlurMask blur={4} />
      </SkiaPath>
      <SkiaPath path={path} style="stroke" strokeWidth={strokeWidth} strokeCap="round" opacity={streamOpacity}>
        <SkiaLinearGradient start={vec(gradientStart.x, gradientStart.y)} end={vec(gradientEnd.x, gradientEnd.y)} colors={gradientColors} />
      </SkiaPath>
      {Array.from({ length: particleCount }).map((_, index) => (
        bubble
          ? <SkiaBubbleParticle key={`skia-b-${particleCount}-${index}`} ctrl={ctrl} color={particleColor} offset={index / particleCount} progress={progress} size={particleSize} activeOpacity={activeOpacity} />
          : <SkiaParticle key={`skia-p-${particleCount}-${index}`} ctrl={ctrl} color={particleColor} offset={index / particleCount} progress={progress} size={particleSize} activeOpacity={activeOpacity} />
      ))}
    </>
  );
}

function SkiaInverterHub({ solarActive, gridActive, homeActive, isVisible }: { solarActive: boolean; gridActive: boolean; homeActive: boolean; isVisible: boolean }) {
  const breath = useSharedValue(0.3);
  const anyActive = solarActive || gridActive || homeActive;
  const glowRadius = useDerivedValue(() => 10 + breath.value * 12);
  const glowOpacity = useDerivedValue(() => breath.value * 0.35);
  const coreRadius = useDerivedValue(() => 4 + breath.value * 3);
  const coreOpacity = useDerivedValue(() => breath.value * 0.7);
  const ringRadius = useDerivedValue(() => 8 + breath.value * 2);
  const ringOpacity = useDerivedValue(() => anyActive ? 0.5 : 0.2);

  useEffect(() => {
    cancelAnimation(breath);
    breath.value = 0.3;
    if (!isVisible) return;
    breath.value = withRepeat(withSequence(withTiming(anyActive ? 0.8 : 0.4, { duration: 1000 }), withTiming(anyActive ? 0.3 : 0.2, { duration: 1000 })), -1, false);
  }, [anyActive, breath, isVisible]);

  return (
    <>
      <SkiaCircle cx={HUB_X} cy={HUB_Y} r={glowRadius} color="#5EE6FF" opacity={glowOpacity}>
        <BlurMask blur={6} />
      </SkiaCircle>
      <SkiaCircle cx={HUB_X} cy={HUB_Y} r={ringRadius} color="#5EE6FF" opacity={ringOpacity} style="stroke" strokeWidth={1.5} />
      <SkiaCircle cx={HUB_X} cy={HUB_Y} r={coreRadius} color="#E0F8FF" opacity={coreOpacity} />
    </>
  );
}

function EnergyCanvas({ solarOnline, gridImporting, homeActive, solarPower, gridPower, homePower, gridArcColor, width, height, isVisible }: { solarOnline: boolean; gridImporting: boolean; homeActive: boolean; solarPower: number; gridPower: number; homePower: number; gridArcColor: string; width: number; height: number; isVisible: boolean }) {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(width / 460, height / 216);
  const offsetX = (width - 460 * scale) / 2;
  const offsetY = (height - 216 * scale) / 2;

  return (
    <Canvas style={styles.svg} pointerEvents="none">
      <Group transform={[{ scale }, { translateX: offsetX }, { translateY: offsetY }]}>
        <SkiaStreamLayer ctrl={SOLAR_CTRL} path={SOLAR_PATH_D} glowColor="#FFD54F" gradientStart={SOLAR_CTRL[0]} gradientEnd={SOLAR_CTRL[3]} gradientColors={["#FFE066", "#FFB300"]} active={solarOnline} power={solarPower} particleColor="#FFE066" strokeWidth={3} isVisible={isVisible} />
        <SkiaStreamLayer ctrl={GRID_CTRL} path={GRID_PATH_D} glowColor={gridArcColor} gradientStart={GRID_CTRL[0]} gradientEnd={GRID_CTRL[3]} gradientColors={[gridArcColor, gridArcColor]} active={gridImporting} power={gridPower} particleColor={gridArcColor} strokeWidth={3} isVisible={isVisible} />
        <SkiaStreamLayer ctrl={HOME_CTRL} path={HOME_PATH_D} glowColor="#45E376" gradientStart={HOME_CTRL[0]} gradientEnd={HOME_CTRL[3]} gradientColors={["#45E376", "#2DD66B"]} active={homeActive} power={homePower} particleColor="#5EE87E" strokeWidth={3.5} isVisible={isVisible} bubble />
        <SkiaInverterHub solarActive={solarOnline} gridActive={gridImporting} homeActive={homeActive} isVisible={isVisible} />
      </Group>
    </Canvas>
  );
}

export const LiveEnergyScene = memo(function LiveEnergyScene({ inverter, weather, offline, tomznLive, inverterOff, loadStatus, normalDrawKw, isVisible = true }: SceneProps) {
  const [sunrise, setSunrise] = useState<Date | null>(null);
  const [sunset, setSunset] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [appActive, setAppActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    fetch("https://api.sunrise-sunset.org/json?lat=31.6265&lng=71.0664&formatted=0")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "OK") {
          setSunrise(new Date(data.results.sunrise));
          setSunset(new Date(data.results.sunset));
        }
      })
      .catch(() => {});
  }, []);

  // Tick every 10 seconds for the time display — no need for 1s precision.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, []);

  // Evaluate day/night every tick — uses sunrise/sunset if available,
  // otherwise falls back to the weather.isDay prop from the backend.
  const isDayTime = sunrise && sunset
    ? (now >= sunrise.getTime() && now < sunset.getTime())
    : weather.isDay;

  const solarOnline = !inverterOff && inverter.isLive && !offline && inverter.solarW > 25;
  // Inverter is considered unavailable when it's off (standby) OR not responding at all.
  // In this state, solar and home W/V/A are meaningless — only grid (TOMZN) values are shown.
  const inverterUnavailable = inverterOff || !inverter.isLive || offline;
  // When inverter is offline or system is offline (no internet), override W/V/A with 0.
  const invW = (inverterOff || offline) ? 0 : (inverter.loadW || 0);
  // Use inverter AC output V and VA when grid is on standby or not connected.
  // A = VA / V (derived from the inverter's AC output readings).
  const gridV = inverter.gridV || 0;
  const acOutV = inverter.acOutV || 0;
  const loadVa = inverter.loadVa || 0;
  const usingAcOut = !inverterOff && !offline && gridV <= 0 && acOutV > 0;
  const invV = (inverterOff || offline) ? 0 : (gridV > 0 ? gridV : acOutV);
  const invA = (inverterOff || offline) ? 0 : (usingAcOut ? loadVa / acOutV : (inverter.loadW || 0) / Math.max(1, gridV));
  // TOMZN fault codes:
  // 2048 = wapda cut off while load was on (relay was on, power was drawing, wapda went away)
  // 8192 = wapda gone and relay also off (grid disconnected, relay already open)
  // Both are "Wapda Cut Off" states — the grid is no longer available.
  const fault = tomznLive.faultCode || 0;
  const wapdaCutOff = !offline && tomznLive.isOnline && (fault === 2048 || fault === 8192);
  // Relay off with no fault = standby (user/manual disconnect, not a fault)
  const wapdaStandby = !offline && tomznLive.isOnline && !tomznLive.switchOn && fault !== 2048 && fault !== 8192;
  // Grid arc always uses Tomzn (Wapda) meter data — independent of inverter state.
  const gridImporting = !offline && tomznLive.isOnline && tomznLive.powerW > 0 && !wapdaCutOff && !wapdaStandby;
  const gridPowerW = gridImporting ? Math.max(0, tomznLive.powerW) : 0;
  const gridColor = gridImporting ? "#6E9BFF" : wapdaCutOff ? "#EF4C4C" : wapdaStandby ? "#F8C653" : "#8A8A8A";

  // Pace algorithm — uses TOMZN powerW (total home draw) for BOTH label and color.
  // TOMZN sees all power flowing to the home whether from solar or grid, so the
  // ratio is consistent and not affected by whether solar is active or not.
  const lerpSpeed = (a: number, b: number, x: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, x)));
  const getPowerColor = (): string => {
    const currentKw = (tomznLive.powerW || 0) / 1000;
    const normalKw = normalDrawKw ?? 0;
    if (normalKw <= 0 || currentKw <= 0) return "#6B7280";
    const loadRatio = currentKw / normalKw;
    const delta = loadRatio - 1;
    // Wider dead zone (±15%) so minor fluctuations don't trigger color changes
    if (Math.abs(delta) < 0.15) return "#F8FAFC";
    if (delta > 0) {
      // white → yellow → orange → red (above normal)
      const t = Math.min(1, delta / 1.0);
      if (t < 0.4) {
        const s = t / 0.4;
        return `rgb(255,${lerpSpeed(255, 200, s)},${lerpSpeed(255, 50, s)})`;
      } else if (t < 0.7) {
        const s = (t - 0.4) / 0.3;
        return `rgb(255,${lerpSpeed(200, 130, s)},${lerpSpeed(50, 15, s)})`;
      }
      const s = (t - 0.7) / 0.3;
      return `rgb(${lerpSpeed(255, 239, s)},${lerpSpeed(130, 68, s)},${lerpSpeed(15, 68, s)})`;
    }
    // white → mint → green (below normal)
    const t = Math.min(1, Math.abs(delta) / 0.6);
    if (t < 0.45) {
      const s = t / 0.45;
      return `rgb(${lerpSpeed(255, 100, s)},${lerpSpeed(255, 230, s)},${lerpSpeed(255, 175, s)})`;
    }
    const s = (t - 0.45) / 0.55;
    return `rgb(${lerpSpeed(100, 16, s)},${lerpSpeed(230, 185, s)},${lerpSpeed(175, 129, s)})`;
  };
  const paceColor = getPowerColor();
  // Grid arc color uses pace algorithm when importing, falls back to status color otherwise
  const gridArcColor = gridImporting ? paceColor : gridColor;

  // ── Power mode label + color ──
  // Hybrid: solar + grid both supplying power (tomzn powerW > 0)
  // Hybrid Idle: tomzn relay is ON, no error, inverter on, but tomzn powerW = 0
  //   (grid is connected and ready, solar is supplying, grid just not drawing yet)
  // Solar Only: solar producing AND tomzn relay is OFF (standby/cutoff) — grid disconnected
  // Wapda Importing: solar near zero, wapda supplying
  // Bypass Mode: inverter fully off, tomzn importing
  // Wapda Cut Off / Standby / Offline: wapda states when no solar
  const solarProducing = !inverterOff && inverter.isLive && !offline && inverter.solarW > 5;
  const solarLow = !inverterOff && inverter.isLive && !offline && inverter.solarW <= 5;
  // Relay is ON and healthy (no fault) but no power flowing — grid connected but idle
  const relayOnIdle = !offline && tomznLive.isOnline && tomznLive.switchOn && fault !== 2048 && fault !== 8192 && (tomznLive.powerW || 0) === 0;
  // Label uses loadStatus from backend (which also uses TOMZN powerW).
  // Show pace whenever TOMZN is online and drawing power, not just when grid imports.
  // When hybrid idle (relay on, solar producing, but 0W from grid), show "Idle".
  const tomznDrawing = tomznLive.isOnline && (tomznLive.powerW || 0) > 0;
  const paceLabel = relayOnIdle && solarProducing
    ? "Idle"
    : !tomznDrawing
    ? "No draw"
    : loadStatus === "High" ? "↑ High"
    : loadStatus === "Low" ? "↓ Low"
    : "On Pace";
  const { modeLabel, modeColor } = (() => {
    if (offline) return { modeLabel: "System Offline", modeColor: "#EF4C4C" };
    if (wapdaCutOff) return { modeLabel: "Wapda Cut Off", modeColor: "#EF4C4C" };
    if (inverterOff && gridImporting) return { modeLabel: "Bypass Mode", modeColor: "#F8C653" };
    if (solarProducing && gridImporting) return { modeLabel: "Hybrid", modeColor: "#32E56B" };
    // Solar producing, relay ON but no power flowing → still "Hybrid" mode,
    // but pace label will show "Idle" instead of High/Low/On Pace.
    if (solarProducing && relayOnIdle) return { modeLabel: "Hybrid", modeColor: "#32E56B" };
    // Solar producing, relay OFF (standby/cutoff) → true Solar Only
    if (solarProducing && !gridImporting) return { modeLabel: "Solar Only", modeColor: "#F9C641" };
    if (solarLow && gridImporting) return { modeLabel: "Wapda Importing", modeColor: paceColor };
    if (gridImporting) return { modeLabel: "Wapda Importing", modeColor: paceColor };
    if (wapdaStandby) return { modeLabel: solarProducing ? "Solar Only" : "Wapda Standby", modeColor: solarProducing ? "#F9C641" : "#F8C653" };
    if (tomznLive.isOnline) return { modeLabel: solarProducing ? "Solar Only" : "Wapda Idle", modeColor: solarProducing ? "#F9C641" : "#F8C653" };
    return { modeLabel: "Wapda Offline", modeColor: "#EF4C4C" };
  })();
  // Home Usage shows whichever watt source is higher; V/A must match that source.
  const usingTomznW = gridPowerW > invW;
  // Real time display based on whichever source updated most recently.
  // When new data arrives, the label resets to "Just now" then counts up 1s, 2s...
  const tomznTs = tomznLive.fetchedAt ? new Date(tomznLive.fetchedAt).getTime() : 0;
  const invTs = inverter.fetchedAt ? new Date(inverter.fetchedAt).getTime() : 0;
  const latestTs = Math.max(tomznTs, invTs);
  const elapsedSec = latestTs > 0 ? Math.max(0, Math.floor((now - latestTs) / 1000)) : null;
  const updatedLabel = offline
    ? "Offline"
    : elapsedSec == null
    ? "Waiting for data"
    : elapsedSec === 0
      ? "Just now"
      : elapsedSec < 60
        ? `${elapsedSec}s`
        : elapsedSec < 3600
          ? `${Math.floor(elapsedSec / 60)}m`
          : `${Math.floor(elapsedSec / 3600)}h`;

  const bgImage = isDayTime
    ? require("../../assets/images/dayback.jpeg")
    : require("../../assets/images/nightback.jpeg");

  // Home power = whichever source is supplying (inverter load or grid)
  const homeW = offline ? 0 : Math.max(invW, gridPowerW);
  const homeV = offline ? 0 : usingTomznW ? (wapdaCutOff || wapdaStandby ? 0 : tomznLive.voltageV) : invV;
  const homeA = offline ? 0 : usingTomznW ? (wapdaCutOff || wapdaStandby ? 0 : tomznLive.currentA) : invA;
  const homeActive = !offline && homeW > 0;

  // Solar V/A
  const solarV = inverter.solarV || 0;
  const solarA = inverter.solarA || 0;
  // Grid V/A (from tomzn meter)
  const tomznV = tomznLive.voltageV || 0;
  const tomznA = tomznLive.currentA || 0;

  const solarP = formatPowerShort(offline ? 0 : inverter.solarW);
  const homeP = formatPowerShort(homeW);
  const gridP = formatPowerShort(offline ? 0 : gridPowerW);

  return (
    <View
      style={[styles.card, { aspectRatio: CARD_ASPECT }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setCanvasSize((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      <Image source={bgImage} style={styles.background} resizeMode="stretch" />
      <View style={StyleSheet.absoluteFill}>
        {Platform.OS === "web" ? (
          <Svg style={styles.svg} viewBox="0 0 460 216">
            <Defs>
              {/* Solar stream gradient: bright yellow → deep amber */}
              <LinearGradient id="solarStream" x1="0" y1="1" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFE066" />
                <Stop offset="1" stopColor="#FFB300" />
              </LinearGradient>
              {/* Grid stream gradient */}
              <LinearGradient id="gridStream" x1="1" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={gridArcColor} stopOpacity={0.9} />
                <Stop offset="1" stopColor={gridArcColor} stopOpacity={0.6} />
              </LinearGradient>
              {/* Home stream gradient: green */}
              <LinearGradient id="homeStream" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#45E376" />
                <Stop offset="1" stopColor="#2DD66B" />
              </LinearGradient>
              {/* Blur filters for glow effects */}
              <Filter id="streamGlow" x="-50%" y="-50%" width="200%" height="200%">
                <FeGaussianBlur stdDeviation="4" />
              </Filter>
              <Filter id="particleGlow" x="-200%" y="-200%" width="500%" height="500%">
                <FeGaussianBlur stdDeviation="2" />
              </Filter>
              <Filter id="hubGlow" x="-150%" y="-150%" width="400%" height="400%">
                <FeGaussianBlur stdDeviation="6" />
              </Filter>
            </Defs>

            {/* Solar → Inverter (left to center, 90° conduit) */}
            <StreamLayer
              ctrl={SOLAR_CTRL}
              pathD={SOLAR_PATH_D}
              glowColor="#FFD54F"
              streamId="solarStream"
              active={solarOnline}
              power={inverter.solarW}
              particleColor="#FFE066"
              strokeWidth={3}
            />
            {/* Grid → Inverter (right to center, 90° conduit) */}
            <StreamLayer
              ctrl={GRID_CTRL}
              pathD={GRID_PATH_D}
              glowColor={gridArcColor}
              streamId="gridStream"
              active={gridImporting}
              power={gridPowerW}
              particleColor={gridArcColor}
              strokeWidth={3}
            />
            {/* Inverter → Home (center, going up) — bubble particles */}
            <StreamLayer
              ctrl={HOME_CTRL}
              pathD={HOME_PATH_D}
              glowColor="#45E376"
              streamId="homeStream"
              active={homeActive}
              power={homeW}
              particleColor="#5EE87E"
              strokeWidth={3.5}
              bubble
            />
            {/* Inverter junction hub */}
            <InverterHub solarActive={solarOnline} gridActive={gridImporting} homeActive={homeActive} />
          </Svg>
        ) : (
          <EnergyCanvas
            solarOnline={solarOnline}
            gridImporting={gridImporting}
            homeActive={homeActive}
            solarPower={inverter.solarW}
            gridPower={gridPowerW}
            homePower={homeW}
            gridArcColor={gridArcColor}
            width={canvasSize.width}
            height={canvasSize.height}
            isVisible={isVisible && appActive}
          />
        )}

        {/* ── LIVE tag (top left, small) ── */}
        <View style={styles.topRow}>
          <View style={styles.liveTag}>
            <View style={[styles.liveDot, { backgroundColor: offline ? "#EF4C4C" : inverter.isLive && !offline ? "#3BE070" : "#F5BF4A" }]} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>

        {/* ── 3-column labels: Solar | Home | Grid ── */}
        {/* Solar column (left) — hidden when inverter is unavailable */}
        <View style={styles.colSolar}>
          <SunMedium size={18} color={solarOnline ? "#F9C641" : "#8A8A8A"} />
          {!inverterUnavailable && (
            <>
              <View style={styles.powerRow}>
                <Text style={[styles.powerValue, { color: solarOnline ? "#FFD54F" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{solarP.value}</Text>
                <Text style={[styles.powerUnit, { color: solarOnline ? "#FFD54F" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{solarP.unit}</Text>
              </View>
              <Text style={[styles.vaText, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{solarV.toFixed(0)}V · {solarA.toFixed(1)}A</Text>
            </>
          )}
        </View>

        {/* Home column (center) — hidden when inverter is unavailable */}
        <View style={styles.colHome}>
          {!inverterUnavailable && (
            <>
              <View style={styles.powerRow}>
                <Text style={[styles.powerValue, { color: homeActive ? "#45E376" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{homeP.value}</Text>
                <Text style={[styles.powerUnit, { color: homeActive ? "#45E376" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{homeP.unit}</Text>
              </View>
              <Text style={[styles.vaText, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{homeV.toFixed(0)}V · {homeA.toFixed(1)}A</Text>
            </>
          )}
        </View>

        {/* Grid column (right) */}
        <View style={styles.colGrid}>
          <TowerControl size={18} color={gridImporting ? gridArcColor : wapdaStandby ? "#F8C653" : "#8A8A8A"} />
          <View style={styles.powerRow}>
            <Text style={[styles.powerValue, { color: gridImporting ? gridArcColor : wapdaStandby ? "#F8C653" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{gridP.value}</Text>
            <Text style={[styles.powerUnit, { color: gridImporting ? gridArcColor : wapdaStandby ? "#F8C653" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{gridP.unit}</Text>
          </View>
          <Text style={[styles.vaText, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{tomznV.toFixed(0)}V · {tomznA.toFixed(1)}A</Text>
        </View>

        {/* ── Footer: time | mode ── */}
        <View style={styles.footer}>
          <View style={styles.footerPill}>
            <RefreshCw size={9} color="#DCE7F2" />
            <Text style={styles.footerText}>{updatedLabel}</Text>
          </View>
          <View style={styles.footerPill}>
            <View style={[styles.footerDot, { backgroundColor: modeColor }]} />
            <Text style={[styles.footerText, { color: modeColor }]}>{modeLabel}</Text>
            {(tomznDrawing || (relayOnIdle && solarProducing)) && (
              <Text style={[styles.footerText, { color: paceColor, fontWeight: '700', marginLeft: 4 }]}>
                · {paceLabel}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(190,212,240,0.16)",
  },
  background: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  svg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  // ── LIVE tag ──
  topRow: { position: "absolute", top: "4%", left: "3.2%" },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "#F5F9FD", fontFamily: "Outfit", fontSize: 10, fontWeight: "600" },
  // ── 3-column labels ──
  colSolar: {
    position: "absolute",
    top: "10%",
    left: "3%",
    alignItems: "center",
    width: 90,
  },
  colHome: {
    position: "absolute",
    top: "8%",
    left: "50%",
    transform: [{ translateX: -45 }],
    alignItems: "center",
    width: 90,
  },
  colGrid: {
    position: "absolute",
    top: "10%",
    right: "3%",
    alignItems: "center",
    width: 90,
  },
  powerRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 3 },
  powerValue: { fontFamily: "Outfit", fontSize: 18, fontWeight: "800" },
  powerUnit: { fontFamily: "Outfit", fontSize: 10, fontWeight: "600" },
  // Black outline for watt values in daytime so they're readable over bright background
  textOutlineDay: {
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  // White outline for watt values at night so they're readable over dark background
  textOutlineNight: {
    textShadowColor: "rgba(255,255,255,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  colLabel: { color: "#DCE6F0", fontFamily: "Outfit", fontSize: 9, fontWeight: "600", marginTop: 2 },
  // ── V/A text (no container, just outlined) ──
  vaText: { color: "#E8F0FA", fontFamily: "Outfit", fontSize: 9, fontWeight: "600", marginTop: 3 },
  // ── Footer ──
  footer: {
    position: "absolute",
    left: "2.6%",
    right: "2.6%",
    bottom: "4.5%",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(10,18,28,0.55)",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { color: "#E4EDF6", fontFamily: "Outfit", fontSize: 9 },
});
