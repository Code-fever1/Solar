import { LinearGradient } from "expo-linear-gradient";
import { RefreshCw, Sun, UtilityPole } from "lucide-react-native";
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, Line, Path, Stop, LinearGradient as SvgGradient } from "react-native-svg";

import type { InverterTelemetry, WeatherState } from "@/context/energy-types";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The whole scene is drawn in one fixed coordinate space so the composition
// never stretches: nodes, arcs, and house keep the reference proportions at
// any card width.
const VIEW_W = 460;
const VIEW_H = 216;
const SOLAR_ARC = "M 78 96 C 128 108 152 138 196 158";
const GRID_ARC = "M 382 96 C 332 108 306 138 264 158";

type SceneProps = { inverter: InverterTelemetry; weather: WeatherState; offline: boolean };

function sceneKind(weather: WeatherState) {
  if (!weather.isDay) return weather.precipitation > 0 || weather.code >= 51 ? "rain-night" : "night";
  if (weather.precipitation > 0 || weather.code >= 51) return "rain";
  if (weather.cloudCover > 40 || weather.code >= 2) return "cloud";
  return "sun";
}

function Flow({ d, color, active, duration }: { d: string; color: string; active: boolean; duration: number }) {
  const offset = useSharedValue(0);
  useEffect(() => { offset.value = active ? withRepeat(withTiming(-90, { duration, easing: Easing.linear }), -1, false) : 0; }, [active, duration, offset]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  return active ? <AnimatedPath d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 14" animatedProps={animatedProps} /> : null;
}

function formatPower(watts: number) { return watts >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${Math.round(watts)} W`; }

export function LiveEnergyScene({ inverter, weather, offline }: SceneProps) {
  const kind = sceneKind(weather);
  const isNight = kind === "night" || kind === "rain-night";
  const rainy = kind === "rain" || kind === "rain-night";
  const solarOnline = inverter.isLive && !offline && inverter.solarW > 25;
  const gridOnline = inverter.isLive && !offline && inverter.gridConnected;
  const solarColor = solarOnline ? "#F9C641" : "#EF4C4C";
  const gridColor = gridOnline ? "#6E9BFF" : "#EF4C4C";
  const colors = useMemo(() => isNight
    ? ["#131C33", "#2C3A55", "#463F49", "#131B26"] as const
    : rainy || kind === "cloud"
      ? ["#4A6076", "#5F7381", "#6B6D6C", "#22303C"] as const
      : ["#3C598A", "#7E6C63", "#A18163", "#2A3A50"] as const, [isNight, kind, rainy]);

  return <LinearGradient colors={colors} start={{ x: 0.1, y: 0 }} end={{ x: 0.85, y: 1 }} style={styles.card}>
    <View style={styles.frame}>
      <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="windowGlow" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#FFDF96" /><Stop offset="1" stopColor="#D98A35" /></SvgGradient>
          <SvgGradient id="ground" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="rgba(13,26,31,0.28)" /><Stop offset="1" stopColor="rgba(6,14,19,0.88)" /></SvgGradient>
        </Defs>
        {isNight && [26, 66, 118, 168, 224, 286, 332, 388, 428].map((x, index) => <Circle key={x} cx={x} cy={14 + index % 4 * 9} r={index % 3 ? 1 : 1.6} fill="#EDF3FF" opacity={0.85} />)}
        {rainy && [40, 84, 130, 178, 226, 274, 320, 368, 414].map((x, index) => <Line key={x} x1={x} y1={30 + index % 3 * 14} x2={x - 4} y2={44 + index % 3 * 14} stroke="rgba(196,224,251,0.55)" strokeWidth={1.1} />)}
        <Path d="M0 176 C55 160 96 182 150 170 C205 158 260 180 320 168 C370 158 420 172 460 162 V216 H0 Z" fill="url(#ground)" />
        <Ellipse cx="230" cy="196" rx="98" ry="13" fill="rgba(4,10,14,0.55)" />
        {/* House */}
        <Path d="M182 155 L230 106 L280 155 L280 195 L182 195 Z" fill={isNight ? "#161F29" : "#232E39"} stroke="#0B131C" strokeWidth="2.4" />
        <Path d="M170 158 L230 96 L292 158 L281 165 L230 112 L181 165 Z" fill={isNight ? "#121B25" : "#1D2833"} stroke="#0A121B" strokeWidth="2.4" />
        <Path d="M198 132 L229 104 L262 134 L251 138 L229 118 L209 138 Z" fill="#41586B" stroke="#93AFC2" strokeWidth="1.1" />
        <Path d="M199 160 H216 V195 H199 Z" fill="url(#windowGlow)" opacity={isNight ? 1 : 0.72} />
        <Path d="M240 158 H262 V178 H240 Z" fill="url(#windowGlow)" opacity={isNight ? 0.95 : 0.66} />
        <Path d="M183 161 H196 V177 H183 Z" fill="url(#windowGlow)" opacity={isNight ? 0.9 : 0.6} />
        <Line x1="230" y1="110" x2="230" y2="52" stroke="#57E37D" strokeWidth="2" />
        <Circle cx="230" cy="48" r="4.4" fill="#4FE076" />
        <Circle cx="230" cy="48" r="8.5" fill="rgba(79,224,118,0.25)" />
        {/* Base arcs are always visible; energy dots animate above them */}
        <Path d={SOLAR_ARC} stroke={`${solarColor}3D`} strokeWidth="5" fill="none" strokeLinecap="round" />
        <Path d={GRID_ARC} stroke={`${gridColor}3D`} strokeWidth="5" fill="none" strokeLinecap="round" />
        <Flow d={SOLAR_ARC} color={solarColor} active={solarOnline} duration={Math.max(750, 2300 - inverter.solarW)} />
        <Flow d={GRID_ARC} color={gridColor} active={gridOnline && inverter.gridW > 25} duration={Math.max(750, 2300 - inverter.gridW)} />
      </Svg>

      <View style={styles.topRow}><View style={styles.liveTag}><View style={[styles.liveDot, { backgroundColor: inverter.isLive && !offline ? "#3BE070" : "#F5BF4A" }]} /><Text style={styles.liveText}>Live Energy Flow</Text></View></View>

      <View style={styles.homeUsage}><Text style={styles.homeNumber}>{formatPower(inverter.loadW)}</Text><Text style={styles.homeLabel}>Home Usage</Text></View>

      <View style={[styles.node, styles.solarNode]}><View style={[styles.nodeCircle, { borderColor: solarColor, shadowColor: solarColor }]}><Sun size={25} color={solarColor} strokeWidth={1.6} /></View><Text style={[styles.nodeValue, { color: solarColor }]}>{formatPower(inverter.solarW)}</Text><Text style={styles.nodeCaption}>{solarOnline ? "Solar Power" : "Solar Offline"}</Text></View>
      <View style={[styles.node, styles.gridNode]}><View style={[styles.nodeCircle, { borderColor: gridColor, shadowColor: gridColor }]}><UtilityPole size={24} color={gridColor} strokeWidth={1.6} /></View><Text style={[styles.nodeValue, { color: gridColor }]}>{formatPower(inverter.gridW)}</Text><Text style={styles.nodeCaption}>{gridOnline ? inverter.gridDirection === "export" ? "To Grid" : "From Grid" : "Grid Offline"}</Text></View>

      <View style={styles.footer}><View style={styles.footerPill}><RefreshCw size={9} color="#DCE7F2" /><Text style={styles.footerText}>{inverter.isLive && !offline ? "Updated 2 sec ago" : "Waiting for data"}</Text></View><View style={styles.footerPill}><View style={[styles.footerDot, { backgroundColor: gridOnline ? "#6E9BFF" : "#EF4C4C" }]} /><Text style={styles.footerText}>{gridOnline ? inverter.gridDirection === "export" ? "Grid Exporting" : "Grid Importing" : "Grid Offline"}</Text></View></View>
    </View>
  </LinearGradient>;
}

const styles = StyleSheet.create({
  card: { width: "100%", maxWidth: 520, alignSelf: "center", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(190,212,240,0.16)" },
  frame: { width: "100%", aspectRatio: VIEW_W / VIEW_H },
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
  nodeCircle: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.6, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(9,18,30,0.35)", shadowOpacity: 0.7, shadowRadius: 12, elevation: 6 },
  nodeValue: { fontFamily: "Outfit", fontSize: 17, fontWeight: "700", marginTop: 7 },
  nodeCaption: { color: "#DCE6F0", fontFamily: "Outfit", fontSize: 9, marginTop: 1 },
  footer: { position: "absolute", left: "2.6%", right: "2.6%", bottom: "4.5%", flexDirection: "row", justifyContent: "space-between" },
  footerPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(10,18,28,0.55)", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { color: "#E4EDF6", fontFamily: "Outfit", fontSize: 9 },
});
