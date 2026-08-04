import { RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
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

// ── Layer 1 — Invisible Bézier guide paths ──────────────────────────────
// Organic, non-symmetrical curves from solar (left) and grid (right)
// converging at the invisible energy hub behind the house (center).
const SOLAR_CTRL: CtrlArray = [
  { x: 58, y: 88 },   // solar panel (left, mid)
  { x: 96, y: 18 },   // rises sharply
  { x: 168, y: 44 },  // gentle curve over
  { x: 230, y: 158 }, // descends to house hub
];

const GRID_CTRL: CtrlArray = [
  { x: 402, y: 88 },  // grid tower (right, mid)
  { x: 352, y: 52 },  // curves upward gently
  { x: 288, y: 184 }, // dips low then sweeps up
  { x: 230, y: 158 }, // arrives at house hub
];

const HUB_X = 230;
const HUB_Y = 158;

const SOLAR_PATH_D = `M ${SOLAR_CTRL[0].x} ${SOLAR_CTRL[0].y} C ${SOLAR_CTRL[1].x} ${SOLAR_CTRL[1].y}, ${SOLAR_CTRL[2].x} ${SOLAR_CTRL[2].y}, ${SOLAR_CTRL[3].x} ${SOLAR_CTRL[3].y}`;
const GRID_PATH_D = `M ${GRID_CTRL[0].x} ${GRID_CTRL[0].y} C ${GRID_CTRL[1].x} ${GRID_CTRL[1].y}, ${GRID_CTRL[2].x} ${GRID_CTRL[2].y}, ${GRID_CTRL[3].x} ${GRID_CTRL[3].y}`;

type CtrlPoint = { x: number; y: number };
type CtrlArray = readonly [CtrlPoint, CtrlPoint, CtrlPoint, CtrlPoint];

type SceneProps = { inverter: InverterTelemetry; weather: WeatherState; offline: boolean; tomznLive: TomznLive; inverterOff: boolean };

function formatPower(watts: number) {
  return watts >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${Math.round(watts)} W`;
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
  }, [duration]);

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

// ── Layers 2 + 3 + 4 — Full Stream ──────────────────────────────────────
function StreamLayer({
  ctrl,
  pathD,
  glowColor,
  streamId,
  active,
  power,
  particleColor,
}: {
  ctrl: CtrlArray;
  pathD: string;
  glowColor: string;
  streamId: string;
  active: boolean;
  power: number;
  particleColor: string;
}) {
  const activeOpacity = useSharedValue(active ? 1 : 0);
  const pulse = useSharedValue(0.85);

  useEffect(() => {
    activeOpacity.value = withTiming(active ? 1 : 0, { duration: 500 });
  }, [active]);

  useEffect(() => {
    if (active) {
      pulse.value = 0.85;
      pulse.value = withRepeat(
        withSequence(withTiming(1, { duration: 1000 }), withTiming(0.7, { duration: 1000 })),
        -1,
        false,
      );
    }
  }, [active]);

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
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        animatedProps={glowProps}
        filter="url(#streamGlow)"
      />
      {/* Layer 3 — Main Stream (gradient, pulsing) */}
      <AnimatedPath
        d={pathD}
        stroke={`url(#${streamId})`}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        animatedProps={streamProps}
      />
      {/* Layer 4 — Moving Energy Particles */}
      {Array.from({ length: particleCount }).map((_, i) => (
        <Particle
          key={`p-${particleCount}-${i}`}
          ctrl={ctrl}
          color={particleColor}
          offset={i / particleCount}
          duration={duration}
          size={particleSize}
          activeOpacity={activeOpacity}
        />
      ))}
    </>
  );
}

// ── Energy Hub — breathing glow where particles merge ───────────────────
function HouseHub({ solarActive, gridActive }: { solarActive: boolean; gridActive: boolean }) {
  const breath = useSharedValue(0.3);
  const anyActive = solarActive || gridActive;

  useEffect(() => {
    breath.value = 0.3;
    breath.value = withRepeat(
      withSequence(
        withTiming(anyActive ? 0.7 : 0.4, { duration: 1000 }),
        withTiming(anyActive ? 0.3 : 0.2, { duration: 1000 }),
      ),
      -1,
      false,
    );
  }, [anyActive]);

  const glowProps = useAnimatedProps(() => ({
    r: 8 + breath.value * 10,
    opacity: breath.value * 0.4,
  }));

  const coreProps = useAnimatedProps(() => ({
    r: 3 + breath.value * 2,
    opacity: breath.value * 0.6,
  }));

  return (
    <>
      <AnimatedCircle cx={HUB_X} cy={HUB_Y} animatedProps={glowProps} fill="#AAFFAA" filter="url(#hubGlow)" />
      <AnimatedCircle cx={HUB_X} cy={HUB_Y} animatedProps={coreProps} fill="#E0FFE0" />
    </>
  );
}

export function LiveEnergyScene({ inverter, weather, offline, tomznLive, inverterOff }: SceneProps) {
  const [isDayTime, setIsDayTime] = useState(weather.isDay);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetch("https://api.sunrise-sunset.org/json?lat=31.6265&lng=71.0664&formatted=0")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "OK") {
          const now = new Date();
          const sunrise = new Date(data.results.sunrise);
          const sunset = new Date(data.results.sunset);
          setIsDayTime(now >= sunrise && now < sunset);
        }
      })
      .catch(() => {});
  }, []);

  // Tick every second so "Updated Xs ago" stays live.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const solarOnline = !inverterOff && inverter.isLive && !offline && inverter.solarW > 25;
  // When inverter is offline, override its W/V/A with 0.
  const invW = inverterOff ? 0 : inverter.loadW;
  const invV = inverterOff ? 0 : inverter.gridV;
  const invA = inverterOff ? 0 : inverter.loadW / Math.max(1, inverter.gridV);
  // Relay off with fault code 2048 = cutoff state
  const wapdaCutOff = tomznLive.isOnline && !tomznLive.switchOn && tomznLive.faultCode === 2048;
  // Relay off without fault code = standby state
  const wapdaStandby = tomznLive.isOnline && !tomznLive.switchOn && tomznLive.faultCode !== 2048;
  // Grid arc always uses Tomzn (Wapda) meter data — independent of inverter state.
  const gridImporting = tomznLive.isOnline && tomznLive.powerW > 0 && !wapdaCutOff && !wapdaStandby;
  const gridPowerW = gridImporting ? Math.max(0, tomznLive.powerW) : 0;
  const solarColor = solarOnline ? "#F9C641" : "#8A8A8A";
  const gridColor = gridImporting ? "#6E9BFF" : wapdaCutOff ? "#EF4C4C" : wapdaStandby ? "#F8C653" : "#8A8A8A";
  // Home Usage shows whichever watt source is higher; V/A must match that source.
  const usingTomznW = gridPowerW > invW;
  // Real "Updated Xs ago" based on whichever source updated most recently.
  // When new data arrives, the label resets to "Just now" then counts up 1s, 2s...
  const tomznTs = tomznLive.fetchedAt ? new Date(tomznLive.fetchedAt).getTime() : 0;
  const invTs = inverter.fetchedAt ? new Date(inverter.fetchedAt).getTime() : 0;
  const latestTs = Math.max(tomznTs, invTs);
  const elapsedSec = latestTs > 0 ? Math.max(0, Math.floor((now - latestTs) / 1000)) : null;
  const updatedLabel = elapsedSec == null
    ? "Waiting for data"
    : elapsedSec === 0
      ? "Just now"
      : elapsedSec < 60
        ? `Updated ${elapsedSec}s ago`
        : elapsedSec < 3600
          ? `Updated ${Math.floor(elapsedSec / 60)}m ago`
          : `Updated ${Math.floor(elapsedSec / 3600)}h ago`;

  const bgImage = isDayTime
    ? require("../../assets/images/dayback.jpeg")
    : require("../../assets/images/nightback.jpeg");

  return (
    <View style={[styles.card, { aspectRatio: CARD_ASPECT }]}>
      <Image source={bgImage} style={styles.background} resizeMode="stretch" />
      <View style={StyleSheet.absoluteFill}>
        <Svg style={styles.svg} viewBox="0 0 460 216">
          <Defs>
            {/* Solar stream gradient: bright yellow → deep amber */}
            <LinearGradient id="solarStream" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFE066" />
              <Stop offset="1" stopColor="#FFB300" />
            </LinearGradient>
            {/* Grid stream gradient: light blue → deep blue */}
            <LinearGradient id="gridStream" x1="1" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#64B5F6" />
              <Stop offset="1" stopColor="#2196F3" />
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

          <StreamLayer
            ctrl={SOLAR_CTRL}
            pathD={SOLAR_PATH_D}
            glowColor="#FFD54F"
            streamId="solarStream"
            active={solarOnline}
            power={inverter.solarW}
            particleColor="#FFE066"
          />
          <StreamLayer
            ctrl={GRID_CTRL}
            pathD={GRID_PATH_D}
            glowColor="#4FC3F7"
            streamId="gridStream"
            active={gridImporting}
            power={gridPowerW}
            particleColor="#64B5F6"
          />
          <HouseHub solarActive={solarOnline} gridActive={gridImporting} />
        </Svg>

        <View style={styles.topRow}>
          <View style={styles.liveTag}>
            <View style={[styles.liveDot, { backgroundColor: inverter.isLive && !offline ? "#3BE070" : "#F5BF4A" }]} />
            <Text style={styles.liveText}>Live Energy Flow</Text>
          </View>
        </View>
        {Math.max(invW, gridPowerW) > 0 && (
          <View style={styles.homeUsage}>
            <Text style={styles.homeNumber}>{formatPower(Math.max(invW, gridPowerW))}</Text>
            <Text style={styles.homeLabel}>Home Usage</Text>
          </View>
        )}
        {!inverterOff && (
          <View style={[styles.node, styles.solarNode]}>
            <Text style={[styles.nodeValue, { color: solarColor }]}>{formatPower(inverter.solarW)}</Text>
            <Text style={styles.nodeCaption}>{solarOnline ? "Solar Power" : "Solar Offline"}</Text>
          </View>
        )}
        {!wapdaCutOff && (
          <View style={[styles.node, styles.gridNode]}>
            <Text style={[styles.nodeValue, { color: gridColor }]}>{formatPower(gridPowerW)}</Text>
            <Text style={styles.nodeCaption}>
              {wapdaStandby ? "Wapda Standby" : gridImporting ? "From Wapda" : tomznLive.isOnline ? "Wapda Idle" : "Wapda Offline"}
            </Text>
            {wapdaStandby && (
              <Text style={styles.nodeVA}>{tomznLive.voltageV.toFixed(0)}V · {tomznLive.currentA.toFixed(1)}A</Text>
            )}
          </View>
        )}
        <View style={styles.footer}>
          <View style={styles.footerPill}>
            <RefreshCw size={9} color="#DCE7F2" />
            <Text style={styles.footerText}>
              {updatedLabel}
            </Text>
          </View>
          {Math.max(invW, gridPowerW) > 0 && (
            <View style={styles.footerPill}>
              <Text style={styles.footerText}>
                {usingTomznW
                  ? `${wapdaCutOff || wapdaStandby ? 0 : tomznLive.voltageV.toFixed(0)} V · ${wapdaCutOff || wapdaStandby ? 0 : tomznLive.currentA.toFixed(1)} A`
                  : `${invV.toFixed(0)} V · ${invA.toFixed(1)} A`}
              </Text>
            </View>
          )}
          <View style={styles.footerPill}>
            <View style={[styles.footerDot, { backgroundColor: gridImporting ? "#6E9BFF" : wapdaCutOff ? "#EF4C4C" : wapdaStandby ? "#F8C653" : tomznLive.isOnline ? "#F8C653" : "#EF4C4C" }]} />
            <Text style={styles.footerText}>
              {wapdaCutOff ? "Wapda Cut Off" : wapdaStandby ? "Wapda Standby" : inverterOff && gridImporting ? "Bypass Mode" : gridImporting ? "Wapda Importing" : tomznLive.isOnline ? "Wapda Idle" : "Wapda Offline"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

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
  topRow: { position: "absolute", top: "5%", left: "3.2%" },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "#F5F9FD", fontFamily: "Outfit", fontSize: 11, fontWeight: "600" },
  homeUsage: { position: "absolute", top: "6%", left: 0, right: 0, alignItems: "center" },
  homeNumber: { color: "#45E376", fontFamily: "Outfit", fontSize: 24, fontWeight: "700" },
  homeLabel: { color: "#EDF3FA", fontFamily: "Outfit", fontSize: 10, marginTop: 1 },
  node: { position: "absolute", top: "22%", alignItems: "center", width: 96 },
  solarNode: { left: "1.5%" },
  gridNode: { right: "1.5%" },
  nodeValue: { fontFamily: "Outfit", fontSize: 17, fontWeight: "700" },
  nodeCaption: { color: "#DCE6F0", fontFamily: "Outfit", fontSize: 9, marginTop: 1 },
  nodeVA: { color: "#8BA8C8", fontFamily: "Outfit", fontSize: 8, marginTop: 2 },
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
