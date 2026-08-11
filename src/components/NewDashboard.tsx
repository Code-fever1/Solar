import { LinearGradient } from "expo-linear-gradient";
import { CloudSun, Cpu, RadioTower, Sun, Waves } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollView as ScrollViewType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { GlassCard } from "@/components/GlassCard";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { HERO_SCENE_LIST } from "@/overlay/heroScenes";
import type { HeroSceneId } from "@/overlay/types";
import { LiveEnergyScene } from "./LiveEnergyScene";
import { EnergyReceivedCard, EnergyUsedCard } from "./NewDashboardCards";

const SCENE_LABELS: Record<HeroSceneId, string> = {
  night: "Night",
  "rain-light": "Rain",
  "clouds-dark": "Clouds",
  fog: "Fog",
  evening: "Evening",
  "morning-cloud": "Morning",
};


type FlowPoint = { timestamp: number; solarKw: number; gridKw: number; loadKw: number };

const FlowChart = memo(function FlowChart({ points, width, windowStart, isLight, hideSolar }: { points: FlowPoint[]; width: number; windowStart: number; isLight: boolean; hideSolar?: boolean }) {
  const height = 140;
  const graphWidth = Math.max(1, width - 40);
  const chartLeft = 28;
  const [tooltip, setTooltip] = useState<{ x: number; time: string; solarKw: number; gridKw: number; loadKw: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending auto-hide timer on unmount
  useEffect(() => () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); }, []);

  const { values, max, paths, yLabels } = useMemo(() => {
    // Use real data if we have at least 2 points; otherwise generate a 24h empty axis.
    const vals = points.length > 1 ? points : Array.from({ length: 24 }, (_, i) => ({
      timestamp: windowStart + i * 3_600_000,
      solarKw: 0,
      loadKw: 0,
      gridKw: 0,
    }));
    const mx = Math.max(1, ...vals.flatMap((p) => [p.solarKw, p.loadKw, p.gridKw]));
    // Rolling 24h window: x position = hours from windowStart (0 = 24h ago, 24 = now)
    const HOUR_MS = 60 * 60 * 1000;
    const hourOf = (ts: number) => (ts - windowStart) / HOUR_MS;
    const make = (key: keyof FlowPoint) => vals.map((p, i) => {
      const x = chartLeft + (hourOf(p.timestamp) / 24) * graphWidth;
      const y = 104 - (p[key] as number) / mx * 76;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const peakIdx = vals.reduce((mi, p, i, arr) => p.loadKw > arr[mi].loadKw ? i : mi, 0);
    const peakX = chartLeft + (hourOf(vals[peakIdx].timestamp) / 24) * graphWidth;
    const peakY = 104 - vals[peakIdx].loadKw / mx * 76;
    // Current time is always at the right edge of the rolling 24h graph
    const currentX = chartLeft + graphWidth;
    const niceMax = Math.ceil(mx * 1.1);
    const yL = [
      { kw: niceMax, y: 28 },
      { kw: niceMax / 2, y: 66 },
      { kw: 0, y: 104 },
    ];
    return { values: vals, max: mx, paths: { solar: make("solarKw"), home: make("loadKw"), grid: make("gridKw"), peakX, peakY, currentX }, yLabels: yL };
  }, [graphWidth, points, chartLeft, windowStart]);

  const findNearestPoint = (x: number) => {
    const hour = ((x - chartLeft) / graphWidth) * 24;
    if (hour < 0 || hour > 24) return null;
    let nearest = values[0];
    let minDist = Infinity;
    for (const p of values) {
      const ph = (p.timestamp - windowStart) / (60 * 60 * 1000);
      const dist = Math.abs(ph - hour);
      if (dist < minDist) { minDist = dist; nearest = p; }
    }
    return nearest;
  };

  const handleTouch = (evtX: number) => {
    const pt = findNearestPoint(evtX);
    if (!pt) { setTooltip(null); return; }
    const d = new Date(pt.timestamp);
    const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const hourOf = (pt.timestamp - windowStart) / (60 * 60 * 1000);
    const tx = chartLeft + (hourOf / 24) * graphWidth;
    setTooltip({ x: tx, time: timeStr, solarKw: pt.solarKw, gridKw: pt.gridKw, loadKw: pt.loadKw });
    // Auto-hide tooltip after 5 seconds
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 5000);
  };

  const tooltipBg = isLight ? "rgba(255,255,255,0.92)" : "rgba(10,18,28,0.88)";
  const tooltipBorder = isLight ? "rgba(15,23,42,0.12)" : "rgba(176,199,224,0.15)";
  const tooltipTextColor = isLight ? "#0F172A" : "#F4F8FC";
  // SVG element colors — adapt for light scenes (fog, morning-cloud) where
  // glassmorphism lets more light through. Dark text/lines on light, light on dark.
  const gridStroke = isLight ? "rgba(15,23,42,0.12)" : "rgba(142,167,196,0.08)";
  const axisTextFill = isLight ? "#475569" : "#8A9BAE";
  const markerStroke = isLight ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.15)";
  const markerFill = isLight ? "#0F172A" : "#F4F8FC";
  const tooltipLineStroke = isLight ? "rgba(15,23,42,0.4)" : "rgba(255,255,255,0.3)";
  return (
    <View
      style={{ width, height }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => handleTouch(e.nativeEvent.locationX)}
      onResponderMove={(e) => handleTouch(e.nativeEvent.locationX)}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Y-axis grid lines + labels */}
        {yLabels.map((yl, i) => (
          <G key={`y-${i}`}>
            <Line x1={chartLeft} y1={yl.y} x2={width - 12} y2={yl.y} stroke={gridStroke} />
            <SvgText x={2} y={yl.y + 3} fill={axisTextFill} fontSize="7" fontFamily="Outfit">{yl.kw.toFixed(1)}kW</SvgText>
          </G>
        ))}
        {/* Current time marker — vertical dashed line */}
        <Line x1={paths.currentX} y1="24" x2={paths.currentX} y2="104" stroke={markerStroke} strokeWidth="1" strokeDasharray="2 3" />
        <Circle cx={paths.currentX} cy="22" r="2.5" fill={markerFill} />
        {/* Energy flow lines — solar line hidden when solar is on standby */}
        {!hideSolar && <Path d={paths.solar} stroke="#F9C641" strokeWidth={1.4} fill="none" />}
        <Path d={paths.home} stroke="#2DDB6C" strokeWidth={1.3} fill="none" />
        <Path d={paths.grid} stroke="#4A85FF" strokeWidth={1.3} fill="none" />
        {/* Peak marker */}
        <Circle cx={paths.peakX} cy={paths.peakY} r="3" fill="#2DDB6C" />
        <Circle cx={paths.peakX} cy={paths.peakY} r="5" fill="#2DDB6C" opacity="0.2" />
        {/* Touch tooltip — vertical line + dots */}
        {tooltip && (
          <>
            <Line x1={tooltip.x} y1="24" x2={tooltip.x} y2="104" stroke={tooltipLineStroke} strokeWidth="1" />
            {!hideSolar && <Circle cx={tooltip.x} cy={104 - tooltip.solarKw / max * 76} r="3" fill="#F9C641" />}
            {!hideSolar && <Circle cx={tooltip.x} cy={104 - tooltip.solarKw / max * 76} r="5" fill="#F9C641" opacity="0.3" />}
            <Circle cx={tooltip.x} cy={104 - tooltip.loadKw / max * 76} r="3" fill="#2DDB6C" />
            <Circle cx={tooltip.x} cy={104 - tooltip.gridKw / max * 76} r="3" fill="#4A85FF" />
          </>
        )}
      </Svg>
      {/* Tooltip label overlay */}
      {tooltip && (
        <View
          style={[
            fcStyles.tooltip,
            {
              left: Math.max(4, Math.min(width - 120, tooltip.x - 60)),
              top: 2,
              backgroundColor: tooltipBg,
              borderColor: tooltipBorder,
            },
          ]}
        >
          <Text style={[fcStyles.tooltipTime, { color: tooltipTextColor }]}>{tooltip.time}</Text>
          {!hideSolar && <Text style={[fcStyles.tooltipRow, { color: "#F9C641" }]}>Solar {tooltip.solarKw.toFixed(2)} kW</Text>}
          <Text style={[fcStyles.tooltipRow, { color: "#2DDB6C" }]}>Home {tooltip.loadKw.toFixed(2)} kW</Text>
          <Text style={[fcStyles.tooltipRow, { color: "#4A85FF" }]}>Grid {tooltip.gridKw.toFixed(2)} kW</Text>
        </View>
      )}
    </View>
  );
});

const fcStyles = StyleSheet.create({
  tooltip: {
    position: "absolute",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    minWidth: 116,
  },
  tooltipTime: { fontFamily: "Outfit", fontSize: 8, fontWeight: "700", marginBottom: 2 },
  tooltipRow: { fontFamily: "Outfit", fontSize: 7, fontWeight: "600", marginTop: 1 },
});

export const NewDashboard = memo(function NewDashboard() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [isLiveSceneVisible, setIsLiveSceneVisible] = useState(true);
  const scrollRef = useRef<ScrollViewType>(null);
  const liveSceneLayout = useRef({ y: 0, height: 0 });
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateLiveSceneVisibility(event.nativeEvent.contentOffset.y);
  };
  const liveSceneVisible = useRef(true);
  const updateLiveSceneVisibility = (offsetY: number) => {
    const layout = liveSceneLayout.current;
    if (layout.height <= 0) return;
    const visible = layout.y + layout.height > offsetY && layout.y < offsetY + height;
    if (visible === liveSceneVisible.current) return;
    liveSceneVisible.current = visible;
    setIsLiveSceneVisible(visible);
  };
  const { activeMeter, energyToday, flowHistory, home, inverter, isOffline, meters, weather, tomznLive, ups, lastSyncedAt, gridFlow, refreshAll, refreshTomznForce, refreshInverterForce } = useEnergy();
  const meterOne = meters.meter1;
  const meterTwo = meters.meter2;
  const chartWidth = Math.min(width - 32, 520);
  const peakLoadW = useMemo(() => Math.max(...flowHistory.slice(-288).map(p => p.loadKw * 1000), inverter.loadW), [flowHistory, inverter.loadW]);
  // Rolling 24-hour window for the flow graph. Current time is always at the
  // right edge; the x-axis shifts dynamically with the time of day.
  const windowStart = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, [flowHistory]);
  // Show the last 24 hours of flow data, downsampled to max 1 point per 5 min.
  const rolling24hFlow = useMemo(() => {
    const filtered = flowHistory.filter((p) => p.timestamp >= windowStart);
    if (filtered.length <= 288) return filtered;
    // Downsample: keep 1 point per 5-minute bucket.
    const bucketMs = 5 * 60_000;
    const buckets = new Map<number, FlowPoint>();
    for (const p of filtered) {
      const b = Math.floor(p.timestamp / bucketMs) * bucketMs;
      const ex = buckets.get(b);
      if (!ex || p.timestamp > ex.timestamp) buckets.set(b, p);
    }
    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [flowHistory, windowStart]);
  // Dynamic x-axis labels: 5 evenly-spaced time markers across the 24h window.
  // e.g. at 6 PM: "6 PM, 12 AM, 6 AM, 12 PM, 6 PM"
  const axisLabels = useMemo(() => {
    const now = Date.now();
    const ws = now - 24 * 60 * 60 * 1000;
    const labels: string[] = [];
    for (let i = 0; i <= 4; i++) {
      const ts = ws + (i / 4) * 24 * 60 * 60 * 1000;
      const d = new Date(ts);
      let h = d.getHours();
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      labels.push(`${h} ${ampm}`);
    }
    return labels;
  }, [flowHistory]);
  // Note: isLive is NOT checked — it's a data-freshness flag that flips false
  // when the inverter's hardware clock is 3+ min stale, even if solar is still
  // producing (e.g. 333W). Removing it prevents the status from flickering to
  // "Standby" during normal polling gaps.
  // Solar is "live" when producing any meaningful power (>0W).
  // "Standby" is only shown when the inverter is completely idle (0W, 0A, 0V).
  const solarLive = inverter.isOnline !== false && inverter.solarW > 0;
  const solarAllZero = inverter.isOnline !== false && inverter.solarW === 0 && inverter.solarA === 0 && inverter.solarV === 0;
  // Inverter is considered OFF when:
  //  - it's explicitly offline (isOnline = false), OR
  //  - it's not responding at all (isLive = false), OR
  //  - it reports standby mode ("S"), OR
  //  - all its readings are zero (gridV 0, solar 0, grid 0, load 0)
  // Note: sourceTime staleness is NOT checked client-side. The server already
  // checks staleness at poll time (3-minute threshold) and sets isOnline=false
  // when the inverter is genuinely unresponsive. A client-side check compared
  // the inverter's hardware clock against the phone's clock, which caused false
  // "offline" flickering due to the inverter's 1-2 min update interval and
  // clock skew between the phone and the inverter.
  // Note: isLive is intentionally NOT checked here. isLive is a data-freshness
  // flag (set false when the inverter's sourceTime is 3+ min stale), not an
  // inverter-off flag. The inverter may still be producing solar (e.g. 436W)
  // while its hardware clock lags — killing the solar line in that case causes
  // the "suddenly dim at 436W" bug. The checks below catch genuinely-off states:
  //   isOnline === false  → backend returned an offline snapshot
  //   inverterMode === "S" → inverter reports standby
  //   all readings zero    → inverter is on but producing nothing
  const rawInverterOff = inverter.isOnline === false ||
    inverter.inverterMode === "S" ||
    (inverter.gridV === 0 && inverter.solarW === 0 && inverter.gridW === 0 && inverter.loadW === 0);
  // Debounce online→offline transitions by 20 seconds to suppress transient
  // 2-5s flicker caused by the inverter's 1-2 min update interval. Offline→online
  // transitions are immediate so recovery shows without delay.
  const [inverterOff, setInverterOff] = useState(rawInverterOff);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!rawInverterOff) {
      // Inverter is online — clear any pending offline transition and show online now.
      if (offTimerRef.current) { clearTimeout(offTimerRef.current); offTimerRef.current = null; }
      setInverterOff(false);
    } else if (!offTimerRef.current) {
      // Inverter looks offline — wait 20s before committing, in case the next poll recovers.
      offTimerRef.current = setTimeout(() => { offTimerRef.current = null; setInverterOff(true); }, 20000);
    }
    return () => { if (offTimerRef.current) { clearTimeout(offTimerRef.current); offTimerRef.current = null; } };
  }, [rawInverterOff]);
  // TOMZN fault codes:
  // 2048 = wapda cut off while load was on → show "Offline"
  // 8192 = wapda gone and relay also off → show "Unavailable"
  const tomznFault = tomznLive.faultCode || 0;
  const wapdaCutOff = tomznLive.isOnline && tomznFault === 2048;
  const wapdaUnavailable = tomznLive.isOnline && tomznFault === 8192;
  // Relay off without fault = standby state
  const wapdaStandby = tomznLive.isOnline && !tomznLive.switchOn && tomznFault !== 2048 && tomznFault !== 8192;
  // Grid is unavailable when TOMZN device is offline, wapda cut off, or unavailable.
  const gridOffline = !tomznLive.isOnline || wapdaCutOff || wapdaUnavailable;

  // Scene theme is provided app-wide by SceneThemeProvider.
  const { heroScene, sheetColors, sheetGradient, cardTheme: sceneCardTheme, manualSceneIndex, cycleScene, isLight: sceneIsLight } = useSceneTheme();

  return <View style={styles.screen}><Image source={heroScene.source} style={{ position: "absolute", top: 0, left: 0, width, height }} resizeMode="stretch" /><LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.4)"]} locations={[0, 0.35, 1]} style={{ position: "absolute", top: 0, left: 0, width, height }} />
    <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: height * 0.50 }} pointerEvents="none">
      <LiveEnergyScene inverter={inverter} weather={weather} offline={isOffline} tomznLive={tomznLive} inverterOff={inverterOff} loadStatus={home.loadStatus} normalDrawKw={home.normalDrawKw} isVisible={isLiveSceneVisible} variant="hero" overlayConfig={heroScene.overlay} lastSyncedAt={lastSyncedAt} onSyncPress={() => { void refreshAll(); }} ups={ups} gridFlow={gridFlow} />
    </View>
    <ScrollView ref={scrollRef} style={{ backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { paddingTop: height * 0.49 }]} showsVerticalScrollIndicator={false} removeClippedSubviews={true} nestedScrollEnabled={true} scrollEventThrottle={16} bounces={true} alwaysBounceVertical={true} onScroll={handleScroll}>
    <View style={{ width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, minHeight: height * 0.65 }}>
      <LinearGradient colors={sheetGradient.colors as [string, string, ...string[]]} locations={sheetGradient.locations as [number, number, ...number[]]} style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 28, borderTopRightRadius: 28 }]} />
      <View style={{ paddingHorizontal: 13, paddingTop: 14, paddingBottom: insets.bottom + 105, gap: 8, alignItems: "center", width: "100%" }}>
    <GlassCard style={styles.statusCard}>
      <View style={styles.statusRow}>
        <View style={styles.statusItem}>
          <Sun size={16} color={sceneCardTheme.textSecondary} />
          <View style={styles.statusItemText}>
            <Text style={[styles.statusLabel, { color: sceneCardTheme.textSecondary }]}>Solar</Text>
            <Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : solarLive ? "#32E56B" : solarAllZero ? "#F8C653" : "#32E56B" }]}>{inverterOff ? "Off" : solarLive ? "Online" : solarAllZero ? "Standby" : "Online"}</Text>
          </View>
        </View>
        <View style={[styles.statusDivider, { backgroundColor: sceneCardTheme.overlayBorder }]} />
        <View style={styles.statusItem}>
          <Cpu size={16} color={sceneCardTheme.textSecondary} />
          <View style={styles.statusItemText}>
            <Text style={[styles.statusLabel, { color: sceneCardTheme.textSecondary }]}>Inverter</Text>
            <Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : inverter.inverterFault === "NO" ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Offline" : inverter.inverterFault === "NO" ? "Healthy" : inverter.inverterFault}</Text>
          </View>
        </View>
        <View style={[styles.statusDivider, { backgroundColor: sceneCardTheme.overlayBorder }]} />
        <View style={styles.statusItem}>
          <RadioTower size={16} color={sceneCardTheme.textSecondary} />
          <View style={styles.statusItemText}>
            <Text style={[styles.statusLabel, { color: sceneCardTheme.textSecondary }]}>Grid</Text>
            <Text style={[styles.statusValue, { color: wapdaCutOff ? "#EF4C4C" : wapdaUnavailable ? "#EF4C4C" : wapdaStandby ? "#F8C653" : tomznLive.isOnline ? (tomznLive.powerW > 0 ? "#548EFF" : "#F8C653") : "#EF4C4C" }]}>{wapdaCutOff ? "Offline" : wapdaUnavailable ? "Unavailable" : wapdaStandby ? "Standby" : tomznLive.isOnline ? (tomznLive.powerW > 0 ? "Available" : "Idle") : "Offline"}</Text>
          </View>
        </View>
        <View style={[styles.statusDivider, { backgroundColor: sceneCardTheme.overlayBorder }]} />
        <View style={styles.statusItem}>
          <Waves size={16} color={sceneCardTheme.textSecondary} />
          <View style={styles.statusItemText}>
            <Text style={[styles.statusLabel, { color: sceneCardTheme.textSecondary }]}>Active Meter</Text>
            <Text style={[styles.statusValue, { color: sceneCardTheme.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{activeMeter === "meter1" ? "Meter 1" : "Meter 2"}</Text>
          </View>
        </View>
      </View>
    </GlassCard>
    {/* LiveEnergyScene moved to hero background */}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, width: '100%' }}>
      <EnergyReceivedCard
        totalEnergy={energyToday.solarKwh + home.todayUsage}
        solarEnergy={energyToday.solarKwh}
        gridEnergy={home.todayUsage}
        isWapda={tomznLive.isOnline && !wapdaCutOff}
        isLight={sceneIsLight}
        cardTheme={sceneCardTheme}
      />
      <EnergyUsedCard
        totalHomeUsage={home.todayUsage}
        liveLoadW={gridOffline ? 0 : (inverterOff ? tomznLive.powerW : inverter.loadW)}
        peakLoadW={peakLoadW}
        vsYesterdayPercent={home.usageChangePercent ?? null}
        voltage={gridOffline ? 0 : (tomznLive.voltageV || inverter.gridV)}
        currentA={gridOffline ? 0 : tomznLive.currentA}
        loadStatus={home.loadStatus || "Normal"}
        normalDrawKw={home.normalDrawKw || 0}
        isLight={sceneIsLight}
        cardTheme={sceneCardTheme}
      />
    </View>
    <GlassCard style={styles.chartCard}><View style={styles.rowHeader}><View><Text style={[styles.cardTitle, { color: sceneCardTheme.textPrimary }]}>Last 24 Hours</Text><View style={styles.legend}>{!solarAllZero && <Text style={[styles.legendItem, { color: "#F5C42E" }]}>● Solar</Text>}<Text style={[styles.legendItem, { color: "#35D86C" }]}>● Home</Text><Text style={[styles.legendItem, { color: "#548EFF" }]}>● Grid</Text><Text style={[styles.legendItem, { color: sceneCardTheme.textSecondary }]}>│ Now</Text></View></View></View><FlowChart points={rolling24hFlow} width={chartWidth} windowStart={windowStart} isLight={sceneIsLight} hideSolar={solarAllZero} /><View style={[styles.axis, { width: chartWidth, paddingLeft: 28, paddingRight: 12 }]}>{axisLabels.map((label, i) => <Text key={i} style={[styles.axisText, { color: sceneCardTheme.textSecondary }]}>{label}</Text>)}</View></GlassCard>
  </View>
  </View>
  </ScrollView>
    <View style={{ position: "absolute", top: insets.top + 8, left: 18, right: 18 }} pointerEvents="box-none"><View style={styles.header}><View style={{ flex: 1 }} /><View style={styles.headerRight}><Pressable onPress={cycleScene} style={({ pressed }) => [styles.sceneSwap, { backgroundColor: "rgba(0,0,0,0.3)", opacity: pressed ? 0.6 : 1 }]}><CloudSun size={18} color="#F4F8FC" strokeWidth={2.4} /><Text style={[styles.sceneSwapLabel, { color: "#F4F8FC" }]}>{manualSceneIndex === null ? "Auto" : SCENE_LABELS[HERO_SCENE_LIST[manualSceneIndex]]}</Text></Pressable></View></View></View></View>;
});
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, content: { backgroundColor: "transparent" }, header: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }, greetingTime: { fontFamily: "Outfit", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, opacity: 0.8 }, greetingGreeting: { fontFamily: "Outfit", fontSize: 28, fontWeight: "600", letterSpacing: -0.5 }, greetingName: { fontFamily: "Outfit", fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: -4 }, headerRight: { flexDirection: "row", alignItems: "center", gap: 8 }, bell: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" }, sceneSwap: { height: 44, borderRadius: 22, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 }, sceneSwapLabel: { fontFamily: "Outfit", fontSize: 12, fontWeight: "700", letterSpacing: 0.2 }, notification: { width: 10, height: 10, backgroundColor: "#32DD69", borderRadius: 5, position: "absolute", right: 11, top: 11, borderWidth: 2 }, statusCard: { width: "100%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }, statusRow: { flexDirection: "row", alignItems: "center", width: "100%" }, statusItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, statusItemText: { alignItems: "flex-start" }, statusDivider: { height: 23, width: StyleSheet.hairlineWidth, marginHorizontal: 6 }, statusLabel: { fontFamily: "Outfit", fontSize: 8 }, statusValue: { fontFamily: "Outfit", fontSize: 9, fontWeight: "700", textAlign: "center" },  metricRow: { width: "100%", flexDirection: "row", gap: 7 }, metric: { flex: 1, minHeight: 103, borderRadius: 14, padding: 9, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)" }, metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricLabel: { color: "#A3B2C3", fontFamily: "Outfit", fontSize: 9, marginTop: 6 }, metricNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 1 }, metricNumber: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 18, fontWeight: "700" }, metricUnit: { color: "#B7C5D4", fontFamily: "Outfit", fontSize: 8 }, metricDetail: { fontFamily: "Outfit", fontSize: 8, marginTop: 5 }, budgetRow: { width: "100%", flexDirection: "row", gap: 8 }, forecast: { flex: 1.18, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12 }, budget: { flex: 0.98, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12, alignItems: "center" }, rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardTitle: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 12, fontWeight: "600" }, confidence: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: "rgba(148,93,255,0.18)" }, confidenceText: { color: "#B69AFF", fontFamily: "Outfit", fontSize: 8 }, expected: { color: "#A2B1C1", fontFamily: "Outfit", fontSize: 9, marginTop: 10 }, bigNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 3 }, bigNumber: { color: "#F4F8FC", fontFamily: "Outfit", fontSize: 34, fontWeight: "700" }, bigUnit: { color: "#D7E1EB", fontFamily: "Outfit", fontSize: 11 }, meterText: { color: "#C5D2DF", fontFamily: "Outfit", fontSize: 8, marginTop: 8 }, meterRight: { color: "#E6EDF5", fontWeight: "700", textAlign: "right" }, track: { height: 4, borderRadius: 3, backgroundColor: "#27364A", overflow: "hidden", marginTop: 3 }, fill: { height: "100%", borderRadius: 3 }, allowance: { color: "#45E079", fontFamily: "Outfit", fontSize: 8, marginTop: 10 }, meterTabs: { flexDirection: "row", borderRadius: 11, backgroundColor: "#1A2737", padding: 2 }, meterTab: { minWidth: 31, alignItems: "center", borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7 }, meterTabActive: { backgroundColor: "#35D86C" }, meterTabText: { color: "#9CADBF", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, meterTabTextActive: { color: "#082112" }, gaugeWrap: { width: 150, height: 112, marginTop: 6, alignItems: "center", justifyContent: "center" }, gaugeContent: { position: "absolute", top: 31, alignItems: "center" }, gaugeStart: { position: "absolute", left: 13, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, gaugeEnd: { position: "absolute", right: 12, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, meterPill: { backgroundColor: "#32D96B", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }, meterPillText: { color: "#06200E", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, gauge: { width: 112, height: 112, borderRadius: 56, borderWidth: 8, borderColor: "#3B4758", borderTopColor: "#47DD73", borderLeftColor: "#47DD73", borderBottomColor: "#47DD73", marginTop: 10, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-36deg" }] }, gaugeInner: { alignItems: "center", transform: [{ rotate: "36deg" }] }, gaugeNumber: { color: "#7BF49C", fontFamily: "Outfit", fontSize: 27, fontWeight: "700" }, gaugeLabel: { color: "#E7EFF7", fontFamily: "Outfit", fontSize: 9 }, gaugeDays: { color: "#D3DEE9", fontFamily: "Outfit", fontSize: 9, marginTop: 8 }, reset: { color: "#9EAFBF", fontFamily: "Outfit", fontSize: 8, marginTop: 6 }, chartCard: { width: "100%", borderRadius: 15, padding: 12 }, legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, legendItem: { fontFamily: "Outfit", fontSize: 8 }, dayPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }, dayText: { fontFamily: "Outfit", fontSize: 9 }, axis: { flexDirection: "row", justifyContent: "space-between", marginTop: -9 }, axisText: { fontFamily: "Outfit", fontSize: 7 }, inverterCard: { width: "100%", minHeight: 82, flexDirection: "row", alignItems: "center", borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 11, gap: 10 }, inverterImage: { width: 54, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#E3E8EC" }, inverterInfo: { flex: 1 }, inverterTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, inverterName: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 13, fontWeight: "600" }, online: { color: "#39DB70", fontFamily: "Outfit", fontSize: 8 }, inverterStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, inverterStat: { color: "#D4E0EB", fontFamily: "Outfit", fontSize: 8, lineHeight: 12 }, chevron: { color: "#C1D0DF", fontSize: 30 },
});
