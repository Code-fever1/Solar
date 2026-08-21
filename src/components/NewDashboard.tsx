import { LinearGradient } from "expo-linear-gradient";
import { Cpu, RadioTower, Sun, Waves } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ScrollView as ScrollViewType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { GlassCard } from "@/components/GlassCard";
import { useEnergy } from "@/context/EnergyContext";
import { useIdle } from "@/context/IdleContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { LiveEnergyScene } from "./LiveEnergyScene";
import { EnergyReceivedCard, EnergyUsedCard } from "./NewDashboardCards";


type FlowPoint = { timestamp: number; solarKw: number | null; gridKw: number | null; loadKw: number | null };
type SeriesKey = "solarKw" | "gridKw" | "loadKw";

const FLOW_BUCKET_MS = 5 * 60_000;
const FLOW_WINDOW_MS = 24 * 60 * 60 * 1000;
const INSPECTOR_W = 86;

function regularizeFlow(points: FlowPoint[], windowStart: number, now: number): FlowPoint[] {
  const firstBucket = Math.floor(windowStart / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
  const lastBucket = Math.floor(now / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
  const byBucket = new Map<number, FlowPoint>();
  for (const p of points) {
    const b = Math.floor(p.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
    const ex = byBucket.get(b);
    if (!ex || p.timestamp > ex.timestamp) byBucket.set(b, { ...p, timestamp: b });
  }
  const out: FlowPoint[] = [];
  for (let t = firstBucket; t <= lastBucket; t += FLOW_BUCKET_MS) {
    out.push(byBucket.get(t) ?? { timestamp: t, solarKw: null, gridKw: null, loadKw: null });
  }
  return out;
}

function seriesPath(values: FlowPoint[], key: SeriesKey, xOf: (ts: number) => number, yOf: (v: number) => number): string {
  let d = "";
  let drawing = false;
  for (const p of values) {
    const v = p[key];
    if (v == null) { drawing = false; continue; }
    const x = xOf(p.timestamp).toFixed(1);
    const y = yOf(v).toFixed(1);
    d += drawing ? ` L${x},${y}` : ` M${x},${y}`;
    drawing = true;
  }
  return d;
}

function formatKw(v: number | null): string {
  if (v == null) return "—";
  return v >= 1 ? `${v.toFixed(2)}` : `${(v * 1000).toFixed(0)}`;
}
function formatKwUnit(v: number | null): string {
  if (v == null) return "";
  return v >= 1 ? "kW" : "W";
}

const FlowChart = memo(function FlowChart({
  points, width, windowStart, isLight, cardTheme,
}: {
  points: FlowPoint[]; width: number; windowStart: number; isLight: boolean;
  cardTheme: { textPrimary: string; textSecondary: string; textMuted: string; overlayBg: string; overlayBorder: string };
}) {
  // ── Phase 1: Render counter (no behavior change) ──
  const _renderCount = useRef(0);
  _renderCount.current += 1;
  const height = 148;
  const plotW = Math.max(1, width - INSPECTOR_W);
  const graphWidth = Math.max(1, plotW - 36);
  const chartLeft = 26;
  const plotTop = 18;
  const plotBottom = 108;
  const plotH = plotBottom - plotTop;
  const touchOrigin = useRef({ x: 0, y: 0 });
  const [selectedTs, setSelectedTs] = useState<number | null>(null);

  const { values, max, paths, yLabels, hasSolar, hasGrid, selected, selectedX } = useMemo(() => {
    const now = Date.now();
    const vals = regularizeFlow(points, windowStart, now);
    const mx = Math.max(
      0.4,
      ...vals.flatMap((p) => [p.solarKw, p.loadKw, p.gridKw].filter((v): v is number => v != null && v > 0)),
    );
    const hourOf = (ts: number) => (ts - windowStart) / 3_600_000;
    const xOf = (ts: number) => chartLeft + (hourOf(ts) / 24) * graphWidth;
    const yOf = (v: number) => plotBottom - (v / mx) * plotH;
    let peakIdx = -1;
    let peakLoad = -1;
    for (let i = 0; i < vals.length; i += 1) {
      const load = vals[i].loadKw;
      if (load != null && load > peakLoad) { peakLoad = load; peakIdx = i; }
    }
    const peak = peakIdx >= 0 ? vals[peakIdx] : null;
    const solarD = seriesPath(vals, "solarKw", xOf, yOf);
    const homeD = seriesPath(vals, "loadKw", xOf, yOf);
    const gridD = seriesPath(vals, "gridKw", xOf, yOf);
    const sel = (selectedTs != null ? vals.find((p) => p.timestamp === selectedTs) : null)
      ?? vals.reduce<FlowPoint | null>((acc, p) => (p.timestamp > (acc?.timestamp || 0) && (p.solarKw != null || p.gridKw != null || p.loadKw != null) ? p : acc), null)
      ?? vals[vals.length - 1];
    const niceMax = Math.ceil(mx * 10) / 10;
    return {
      values: vals,
      max: mx,
      hasSolar: solarD.length > 0,
      hasGrid: gridD.length > 0,
      selected: sel,
      selectedX: sel ? xOf(sel.timestamp) : xOf(now),
      paths: {
        solar: solarD,
        home: homeD,
        grid: gridD,
        peakX: peak ? xOf(peak.timestamp) : 0,
        peakY: peak && peak.loadKw != null ? yOf(peak.loadKw) : 0,
        hasPeak: peak != null && peak.loadKw != null,
        currentX: xOf(now),
      },
      yLabels: [
        { kw: niceMax, y: plotTop },
        { kw: niceMax / 2, y: plotTop + plotH / 2 },
        { kw: 0, y: plotBottom },
      ],
    };
  }, [points, windowStart, graphWidth, selectedTs]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (_renderCount.current > 0) console.log(`[PerfFE] FlowChart renders: ${_renderCount.current}/10s`);
      _renderCount.current = 0;
    }, 10_000);
    return () => clearInterval(iv);
  }, []);

  const selectAtX = (x: number) => {
    const hour = ((x - chartLeft) / graphWidth) * 24;
    if (hour < -0.2 || hour > 24.2) return;
    let nearest = values[0];
    let minDist = Infinity;
    for (const p of values) {
      const dist = Math.abs((p.timestamp - windowStart) / 3_600_000 - hour);
      if (dist < minDist) { minDist = dist; nearest = p; }
    }
    if (nearest) setSelectedTs(nearest.timestamp);
  };

  const gridStroke = isLight ? "rgba(15,23,42,0.10)" : "rgba(142,167,196,0.08)";
  const axisTextFill = isLight ? "#475569" : "#8A9BAE";
  const markerStroke = isLight ? "rgba(15,23,42,0.22)" : "rgba(255,255,255,0.14)";
  const markerFill = isLight ? "#1A2332" : "#E8EEF4";
  const pickStroke = isLight ? "rgba(26,35,50,0.45)" : "rgba(232,238,244,0.38)";
  const selectedTime = selected
    ? new Date(selected.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "—";

  const rows: Array<{ key: string; label: string; color: string; value: number | null; hidden?: boolean }> = [
    { key: "solar", label: "Solar", color: "#F5C42E", value: selected?.solarKw ?? null, hidden: !hasSolar && selected?.solarKw == null },
    { key: "home", label: "Home", color: "#35D86C", value: selected?.loadKw ?? null },
    { key: "grid", label: "Grid", color: "#548EFF", value: selected?.gridKw ?? null },
  ];

  return (
    <View style={fcStyles.wrap}>
      <View
        style={{ width: plotW, height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(e) => {
          const dx = Math.abs(e.nativeEvent.locationX - touchOrigin.current.x);
          const dy = Math.abs(e.nativeEvent.locationY - touchOrigin.current.y);
          return dx > 8 && dx > dy;
        }}
        onResponderGrant={(e) => {
          touchOrigin.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
          selectAtX(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => selectAtX(e.nativeEvent.locationX)}
      >
        <Svg width={plotW} height={height} viewBox={`0 0 ${plotW} ${height}`}>
          {yLabels.map((yl, i) => (
            <G key={`y-${i}`}>
              <Line x1={chartLeft} y1={yl.y} x2={plotW - 8} y2={yl.y} stroke={gridStroke} />
              <SvgText x={1} y={yl.y + 3} fill={axisTextFill} fontSize="7" fontFamily="Outfit">{yl.kw.toFixed(1)}</SvgText>
            </G>
          ))}
          <Line x1={paths.currentX} y1={plotTop} x2={paths.currentX} y2={plotBottom} stroke={markerStroke} strokeWidth="1" strokeDasharray="2 3" />
          <Circle cx={paths.currentX} cy={plotTop - 3} r="2.2" fill={markerFill} />
          {paths.solar ? <Path d={paths.solar} stroke="#F5C42E" strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {paths.home ? <Path d={paths.home} stroke="#2DDB6C" strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {paths.grid ? <Path d={paths.grid} stroke="#4A85FF" strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {paths.hasPeak ? (
            <>
              <Circle cx={paths.peakX} cy={paths.peakY} r="5" fill="#2DDB6C" opacity="0.18" />
              <Circle cx={paths.peakX} cy={paths.peakY} r="2.6" fill="#2DDB6C" />
            </>
          ) : null}
          {selected ? (
            <>
              <Line x1={selectedX} y1={plotTop} x2={selectedX} y2={plotBottom} stroke={pickStroke} strokeWidth="1" />
              {selected.solarKw != null ? <Circle cx={selectedX} cy={plotBottom - (selected.solarKw / max) * plotH} r="2.8" fill="#F5C42E" /> : null}
              {selected.loadKw != null ? <Circle cx={selectedX} cy={plotBottom - (selected.loadKw / max) * plotH} r="2.8" fill="#2DDB6C" /> : null}
              {selected.gridKw != null ? <Circle cx={selectedX} cy={plotBottom - (selected.gridKw / max) * plotH} r="2.8" fill="#4A85FF" /> : null}
            </>
          ) : null}
        </Svg>
      </View>
      <View style={[fcStyles.inspector, { backgroundColor: cardTheme.overlayBg, borderColor: cardTheme.overlayBorder }]}>
        <Text style={[fcStyles.inspectorTime, { color: cardTheme.textPrimary }]}>{selectedTime}</Text>
        <Text style={[fcStyles.inspectorHint, { color: cardTheme.textMuted }]}>5 min</Text>
        {rows.filter((row) => !row.hidden).map((row) => {
          const offline = row.value == null;
          return (
            <View key={row.key} style={fcStyles.inspectorRow}>
              <View style={[fcStyles.inspectorDot, { backgroundColor: offline ? cardTheme.textMuted : row.color }]} />
              <View style={fcStyles.inspectorCopy}>
                <Text style={[fcStyles.inspectorLabel, { color: cardTheme.textMuted }]}>{row.label}</Text>
                <Text style={[fcStyles.inspectorValue, { color: offline ? cardTheme.textMuted : cardTheme.textPrimary }]}>
                  {offline ? "Off" : formatKw(row.value)}
                  <Text style={[fcStyles.inspectorUnit, { color: cardTheme.textMuted }]}>{offline ? "" : ` ${formatKwUnit(row.value)}`}</Text>
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const fcStyles = StyleSheet.create({
  wrap: { width: "100%", flexDirection: "row", alignItems: "stretch", marginTop: 8 },
  inspector: {
    width: INSPECTOR_W,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "flex-start",
    gap: 7,
  },
  inspectorTime: { fontFamily: "Outfit", fontSize: 12, fontWeight: "700", letterSpacing: -0.2 },
  inspectorHint: { fontFamily: "Outfit", fontSize: 8, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", marginTop: -4 },
  inspectorRow: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  inspectorDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 4 },
  inspectorCopy: { flex: 1 },
  inspectorLabel: { fontFamily: "Outfit", fontSize: 8, fontWeight: "600", letterSpacing: 0.2 },
  inspectorValue: { fontFamily: "Outfit", fontSize: 12, fontWeight: "700", marginTop: 1, letterSpacing: -0.2 },
  inspectorUnit: { fontFamily: "Outfit", fontSize: 8, fontWeight: "600" },
});

export const NewDashboard = memo(function NewDashboard({ isTabFocused = true }: { isTabFocused?: boolean }) {
  // ── Phase 1: Render counter (no behavior change) ──
  const _renderCount = useRef(0);
  _renderCount.current += 1;
  useEffect(() => {
    const iv = setInterval(() => {
      if (_renderCount.current > 0) console.log(`[PerfFE] NewDashboard renders: ${_renderCount.current}/10s`);
      _renderCount.current = 0;
    }, 10_000);
    return () => clearInterval(iv);
  }, []);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { isIdle, resetIdleTimer } = useIdle();
  const [isLiveSceneVisible, setIsLiveSceneVisible] = useState(true);
  const scrollRef = useRef<ScrollViewType>(null);
  const liveSceneLayout = useRef({ y: 0, height: 0 });
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    resetIdleTimer();
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
  const { activeMeter, energyToday, flowHistory, home, inverter, isOffline, meters, weather, tomznLive, ups, gridFlow, refreshAll, refreshTomznForce, refreshInverterForce } = useEnergy();
  const meterOne = meters.meter1;
  const meterTwo = meters.meter2;
  const chartWidth = Math.min(width - 32, 520);
  const peakLoadW = useMemo(
    () => Math.max(0, ...flowHistory.slice(-288).map((p) => (p.loadKw ?? 0) * 1000), inverter.loadW || 0),
    [flowHistory, inverter.loadW],
  );
  // Rolling 24-hour window for the flow graph. Current time is always at the
  // right edge; the x-axis shifts dynamically with the time of day.
  const windowStart = useMemo(() => Date.now() - FLOW_WINDOW_MS, [flowHistory]);
  const rolling24hFlow = useMemo(
    () => flowHistory.filter((p) => p.timestamp >= windowStart),
    [flowHistory, windowStart],
  );
  const graphHasSolar = useMemo(() => rolling24hFlow.some((p) => (p.solarKw ?? 0) > 0.01), [rolling24hFlow]);
  const graphHasGrid = useMemo(() => rolling24hFlow.some((p) => p.gridKw != null), [rolling24hFlow]);
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
  //   inverterMode === "offline" → backend confirmed the inverter is unreachable
  // All-zero readings alone are not enough — a single poll timeout used to
  // zero the snapshot and flash Offline / UPS over Solar Only.
  const rawInverterOff = inverter.isOnline === false ||
    inverter.inverterMode === "S" ||
    inverter.inverterMode === "offline";
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
  const { heroScene, sheetColors, sheetGradient, cardTheme: sceneCardTheme, isLight: sceneIsLight } = useSceneTheme();

  return <View style={styles.screen}><Image source={heroScene.source} style={{ position: "absolute", top: 0, left: 0, width, height }} resizeMode="stretch" /><LinearGradient colors={["rgba(0,0,0,0.25)", "rgba(0,0,0,0.1)", "rgba(0,0,0,0.4)"]} locations={[0, 0.35, 1]} style={{ position: "absolute", top: 0, left: 0, width, height }} />
    <View style={{ position: "absolute", top: 0, left: 0, width: "100%", height: height * 0.50 }} pointerEvents="none">
      <LiveEnergyScene inverter={inverter} weather={weather} offline={isOffline} tomznLive={tomznLive} inverterOff={inverterOff} loadStatus={home.loadStatus} normalDrawKw={home.normalDrawKw} isVisible={isLiveSceneVisible && isTabFocused} variant="hero" overlayConfig={heroScene.overlay} ups={ups} gridFlow={gridFlow} />
    </View>
    <ScrollView ref={scrollRef} style={{ backgroundColor: "transparent" }} contentContainerStyle={[styles.content, { paddingTop: height * 0.49 }]} showsVerticalScrollIndicator={false} removeClippedSubviews={true} nestedScrollEnabled={true} scrollEventThrottle={isIdle ? 48 : 16} bounces={true} alwaysBounceVertical={true} onScroll={handleScroll}>
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
            <Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : inverter.isOnline === false ? "#F8C653" : inverter.inverterFault === "NO" ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Offline" : inverter.isOnline === false ? "Connecting..." : inverter.inverterFault === "NO" ? "Healthy" : inverter.inverterFault}</Text>
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
    <GlassCard style={styles.chartCard}>
      <View style={styles.rowHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: sceneCardTheme.textPrimary }]}>Last 24 Hours</Text>
          <View style={styles.legend}>
            {graphHasSolar && <Text style={[styles.legendItem, { color: "#F5C42E" }]}>● Solar</Text>}
            <Text style={[styles.legendItem, { color: "#35D86C" }]}>● Home</Text>
            {graphHasGrid && <Text style={[styles.legendItem, { color: "#548EFF" }]}>● Grid</Text>}
            <Text style={[styles.legendItem, { color: sceneCardTheme.textSecondary }]}>│ Now</Text>
          </View>
        </View>
      </View>
      <FlowChart
        points={rolling24hFlow}
        width={chartWidth}
        windowStart={windowStart}
        isLight={sceneIsLight}
        cardTheme={sceneCardTheme}
      />
      <View style={[styles.axis, { width: chartWidth - INSPECTOR_W, paddingLeft: 26, paddingRight: 8 }]}>
        {axisLabels.map((label, i) => (
          <Text key={i} style={[styles.axisText, { color: sceneCardTheme.textSecondary }]}>{label}</Text>
        ))}
      </View>
    </GlassCard>
  </View>
  </View>
  </ScrollView>
    </View>;
});
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" }, content: { backgroundColor: "transparent" }, header: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }, greetingTime: { fontFamily: "Outfit", fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4, opacity: 0.8 }, greetingGreeting: { fontFamily: "Outfit", fontSize: 28, fontWeight: "600", letterSpacing: -0.5 }, greetingName: { fontFamily: "Outfit", fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: -4 }, bell: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" }, notification: { width: 10, height: 10, backgroundColor: "#32DD69", borderRadius: 5, position: "absolute", right: 11, top: 11, borderWidth: 2 }, statusCard: { width: "100%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }, statusRow: { flexDirection: "row", alignItems: "center", width: "100%" }, statusItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, statusItemText: { alignItems: "flex-start" }, statusDivider: { height: 23, width: StyleSheet.hairlineWidth, marginHorizontal: 6 }, statusLabel: { fontFamily: "Outfit", fontSize: 8 }, statusValue: { fontFamily: "Outfit", fontSize: 9, fontWeight: "700", textAlign: "center" },  metricRow: { width: "100%", flexDirection: "row", gap: 7 }, metric: { flex: 1, minHeight: 103, borderRadius: 14, padding: 9, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)" }, metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricLabel: { color: "#A3B2C3", fontFamily: "Outfit", fontSize: 9, marginTop: 6 }, metricNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 1 }, metricNumber: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 18, fontWeight: "700" }, metricUnit: { color: "#B7C5D4", fontFamily: "Outfit", fontSize: 8 }, metricDetail: { fontFamily: "Outfit", fontSize: 8, marginTop: 5 }, budgetRow: { width: "100%", flexDirection: "row", gap: 8 }, forecast: { flex: 1.18, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12 }, budget: { flex: 0.98, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12, alignItems: "center" }, rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardTitle: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 12, fontWeight: "600" }, confidence: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: "rgba(148,93,255,0.18)" }, confidenceText: { color: "#B69AFF", fontFamily: "Outfit", fontSize: 8 }, expected: { color: "#A2B1C1", fontFamily: "Outfit", fontSize: 9, marginTop: 10 }, bigNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 3 }, bigNumber: { color: "#F4F8FC", fontFamily: "Outfit", fontSize: 34, fontWeight: "700" }, bigUnit: { color: "#D7E1EB", fontFamily: "Outfit", fontSize: 11 }, meterText: { color: "#C5D2DF", fontFamily: "Outfit", fontSize: 8, marginTop: 8 }, meterRight: { color: "#E6EDF5", fontWeight: "700", textAlign: "right" }, track: { height: 4, borderRadius: 3, backgroundColor: "#27364A", overflow: "hidden", marginTop: 3 }, fill: { height: "100%", borderRadius: 3 }, allowance: { color: "#45E079", fontFamily: "Outfit", fontSize: 8, marginTop: 10 }, meterTabs: { flexDirection: "row", borderRadius: 11, backgroundColor: "#1A2737", padding: 2 }, meterTab: { minWidth: 31, alignItems: "center", borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7 }, meterTabActive: { backgroundColor: "#35D86C" }, meterTabText: { color: "#9CADBF", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, meterTabTextActive: { color: "#082112" }, gaugeWrap: { width: 150, height: 112, marginTop: 6, alignItems: "center", justifyContent: "center" }, gaugeContent: { position: "absolute", top: 31, alignItems: "center" }, gaugeStart: { position: "absolute", left: 13, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, gaugeEnd: { position: "absolute", right: 12, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, meterPill: { backgroundColor: "#32D96B", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }, meterPillText: { color: "#06200E", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, gauge: { width: 112, height: 112, borderRadius: 56, borderWidth: 8, borderColor: "#3B4758", borderTopColor: "#47DD73", borderLeftColor: "#47DD73", borderBottomColor: "#47DD73", marginTop: 10, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-36deg" }] }, gaugeInner: { alignItems: "center", transform: [{ rotate: "36deg" }] }, gaugeNumber: { color: "#7BF49C", fontFamily: "Outfit", fontSize: 27, fontWeight: "700" }, gaugeLabel: { color: "#E7EFF7", fontFamily: "Outfit", fontSize: 9 }, gaugeDays: { color: "#D3DEE9", fontFamily: "Outfit", fontSize: 9, marginTop: 8 }, reset: { color: "#9EAFBF", fontFamily: "Outfit", fontSize: 8, marginTop: 6 }, chartCard: { width: "100%", borderRadius: 15, padding: 12 }, legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, legendItem: { fontFamily: "Outfit", fontSize: 8 }, dayPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }, dayText: { fontFamily: "Outfit", fontSize: 9 }, axis: { flexDirection: "row", justifyContent: "space-between", marginTop: -9 }, axisText: { fontFamily: "Outfit", fontSize: 7 }, inverterCard: { width: "100%", minHeight: 82, flexDirection: "row", alignItems: "center", borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 11, gap: 10 }, inverterImage: { width: 54, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#E3E8EC" }, inverterInfo: { flex: 1 }, inverterTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, inverterName: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 13, fontWeight: "600" }, online: { color: "#39DB70", fontFamily: "Outfit", fontSize: 8 }, inverterStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, inverterStat: { color: "#D4E0EB", fontFamily: "Outfit", fontSize: 8, lineHeight: 12 }, chevron: { color: "#C1D0DF", fontSize: 30 },
});
