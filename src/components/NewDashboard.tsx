import { Bell, Bolt, SunMedium, TowerControl, Waves } from "lucide-react-native";
import { memo, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";

import { useEnergy } from "@/context/EnergyContext";
import { useTheme } from "@/hooks/use-theme";
import { LiveEnergyScene } from "./LiveEnergyScene";
import { EnergyReceivedCard, EnergyUsedCard, ForecastBudgetCard } from "./NewDashboardCards";

type FlowPoint = { timestamp: number; solarKw: number; gridKw: number; loadKw: number };

const FlowChart = memo(function FlowChart({ points, width, startOfToday, isLight }: { points: FlowPoint[]; width: number; startOfToday: number; isLight: boolean }) {
  const height = 140;
  const graphWidth = Math.max(1, width - 40);
  const chartLeft = 28;
  const [tooltip, setTooltip] = useState<{ x: number; time: string; solarKw: number; gridKw: number; loadKw: number } | null>(null);

  const { values, max, paths, yLabels } = useMemo(() => {
    // Use real data if we have at least 2 points; otherwise generate a 24h empty axis.
    const vals = points.length > 1 ? points : Array.from({ length: 24 }, (_, i) => ({
      timestamp: startOfToday + i * 3_600_000,
      solarKw: 0,
      loadKw: 0,
      gridKw: 0,
    }));
    const mx = Math.max(1, ...vals.flatMap((p) => [p.solarKw, p.loadKw, p.gridKw]));
    const hourOf = (ts: number) => {
      const d = new Date(ts);
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    };
    const make = (key: keyof FlowPoint) => vals.map((p, i) => {
      const x = chartLeft + (hourOf(p.timestamp) / 24) * graphWidth;
      const y = 104 - (p[key] as number) / mx * 76;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const peakIdx = vals.reduce((mi, p, i, arr) => p.loadKw > arr[mi].loadKw ? i : mi, 0);
    const peakX = chartLeft + (hourOf(vals[peakIdx].timestamp) / 24) * graphWidth;
    const peakY = 104 - vals[peakIdx].loadKw / mx * 76;
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const currentX = chartLeft + (currentHour / 24) * graphWidth;
    const niceMax = Math.ceil(mx * 1.1);
    const yL = [
      { kw: niceMax, y: 28 },
      { kw: niceMax / 2, y: 66 },
      { kw: 0, y: 104 },
    ];
    return { values: vals, max: mx, paths: { solar: make("solarKw"), home: make("loadKw"), grid: make("gridKw"), peakX, peakY, currentX }, yLabels: yL };
  }, [graphWidth, points, chartLeft, startOfToday]);

  const findNearestPoint = (x: number) => {
    const hour = ((x - chartLeft) / graphWidth) * 24;
    if (hour < 0 || hour > 24) return null;
    let nearest = values[0];
    let minDist = Infinity;
    for (const p of values) {
      const d = new Date(p.timestamp);
      const ph = d.getHours() + d.getMinutes() / 60;
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
    const hourOf = d.getHours() + d.getMinutes() / 60;
    const tx = chartLeft + (hourOf / 24) * graphWidth;
    setTooltip({ x: tx, time: timeStr, solarKw: pt.solarKw, gridKw: pt.gridKw, loadKw: pt.loadKw });
  };

  const tooltipBg = isLight ? "rgba(255,255,255,0.92)" : "rgba(10,18,28,0.88)";
  const tooltipBorder = isLight ? "rgba(15,23,42,0.12)" : "rgba(176,199,224,0.15)";
  const tooltipTextColor = isLight ? "#0F172A" : "#F4F8FC";
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
            <Line x1={chartLeft} y1={yl.y} x2={width - 12} y2={yl.y} stroke={isLight ? "rgba(15,23,42,0.08)" : "rgba(142,167,196,0.08)"} />
            <SvgText x={2} y={yl.y + 3} fill={isLight ? "#64748B" : "#5A6B7E"} fontSize="7" fontFamily="Outfit">{yl.kw.toFixed(1)}kW</SvgText>
          </G>
        ))}
        {/* Current time marker — vertical dashed line */}
        <Line x1={paths.currentX} y1="24" x2={paths.currentX} y2="104" stroke={isLight ? "rgba(15,23,42,0.15)" : "rgba(255,255,255,0.15)"} strokeWidth="1" strokeDasharray="2 3" />
        <Circle cx={paths.currentX} cy="22" r="2.5" fill={isLight ? "#0F172A" : "#F4F8FC"} />
        {/* Energy flow lines */}
        <Path d={paths.solar} stroke="#F9C641" strokeWidth={1.4} fill="none" />
        <Path d={paths.home} stroke="#2DDB6C" strokeWidth={1.3} fill="none" />
        <Path d={paths.grid} stroke="#4A85FF" strokeWidth={1.3} fill="none" />
        {/* Peak marker */}
        <Circle cx={paths.peakX} cy={paths.peakY} r="3" fill="#2DDB6C" />
        <Circle cx={paths.peakX} cy={paths.peakY} r="5" fill="#2DDB6C" opacity="0.2" />
        {/* Touch tooltip — vertical line + dots */}
        {tooltip && (
          <>
            <Line x1={tooltip.x} y1="24" x2={tooltip.x} y2="104" stroke={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.3)"} strokeWidth="1" />
            <Circle cx={tooltip.x} cy={104 - tooltip.solarKw / max * 76} r="3" fill="#F9C641" />
            <Circle cx={tooltip.x} cy={104 - tooltip.solarKw / max * 76} r="5" fill="#F9C641" opacity="0.3" />
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
          <Text style={[fcStyles.tooltipRow, { color: "#F9C641" }]}>Solar {tooltip.solarKw.toFixed(2)} kW</Text>
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
  const { isLight, ...theme } = useTheme();
  const [isLiveSceneVisible, setIsLiveSceneVisible] = useState(true);
  const liveSceneLayout = useRef({ y: 0, height: 0 });
  const liveSceneVisible = useRef(true);
  const updateLiveSceneVisibility = (offsetY: number) => {
    const layout = liveSceneLayout.current;
    if (layout.height <= 0) return;
    const visible = layout.y + layout.height > offsetY && layout.y < offsetY + height;
    if (visible === liveSceneVisible.current) return;
    liveSceneVisible.current = visible;
    setIsLiveSceneVisible(visible);
  };
  const { activeMeter, energyToday, flowHistory, home, inverter, isOffline, meters, weather, tomznLive } = useEnergy();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : hour < 21 ? "Good Evening" : "Good Night";
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const meterOne = meters.meter1;
  const meterTwo = meters.meter2;
  const chartWidth = Math.min(width - 32, 520);
  const startOfToday = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const budgetMeter = activeMeter === "meter1" ? meterOne : meterTwo;
  const peakLoadW = useMemo(() => Math.max(...flowHistory.slice(-288).map(p => p.loadKw * 1000), inverter.loadW), [flowHistory, inverter.loadW]);
  // Show last 24 hours of flow data (not just today).
  // Show only today's flow data (from start of today), downsampled to max 1 point per 5 min.
  const todayFlow = useMemo(() => {
    const filtered = flowHistory.filter((p) => p.timestamp >= startOfToday);
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
  }, [flowHistory, startOfToday]);
  const solarLive = inverter.isLive && inverter.solarW > 25;
  // Inverter is considered OFF when:
  //  - it's not responding at all (isLive = false), OR
  //  - it reports standby mode ("S"), OR
  //  - all its readings are zero (gridV 0, solar 0, grid 0, load 0)
  const inverterOff = !inverter.isLive ||
    inverter.inverterMode === "S" ||
    (inverter.gridV === 0 && inverter.solarW === 0 && inverter.gridW === 0 && inverter.loadW === 0);
  // TOMZN fault codes:
  // 2048 = wapda cut off while load was on → show "Offline"
  // 8192 = wapda gone and relay also off → show "Unavailable"
  const tomznFault = tomznLive.faultCode || 0;
  const wapdaCutOff = tomznLive.isOnline && tomznFault === 2048;
  const wapdaUnavailable = tomznLive.isOnline && tomznFault === 8192;
  // Relay off without fault = standby state
  const wapdaStandby = tomznLive.isOnline && !tomznLive.switchOn && tomznFault !== 2048 && tomznFault !== 8192;

  return <View style={[styles.screen, { backgroundColor: theme.screenBg }]}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 105 }]} showsVerticalScrollIndicator={false} removeClippedSubviews={true} nestedScrollEnabled={true} scrollEventThrottle={32} onScroll={(event) => updateLiveSceneVisibility(event.nativeEvent.contentOffset.y)}>
    <View style={styles.header}><View><Text style={[styles.greeting, { color: theme.text }]}>{greeting}, Alijah</Text><Text style={[styles.location, { color: theme.textSecondary }]}>{time}</Text></View><View style={styles.headerRight}><View style={styles.bell}><Bell size={19} color={theme.text} /><View style={styles.notification} /></View></View></View>
    <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}><View style={styles.statusItem}><SunMedium size={19} color="#F5C42E" /><View><Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Solar</Text><Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : solarLive ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Off" : solarLive ? "Online" : "Standby"}</Text></View></View><View style={[styles.statusDivider, { backgroundColor: theme.border }]} /><View style={styles.statusItem}><Bolt size={18} color={theme.textSecondary} /><View><Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Inverter</Text><Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : inverter.inverterFault === "NO" ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Offline" : inverter.inverterFault === "NO" ? "Healthy" : inverter.inverterFault}</Text></View></View><View style={[styles.statusDivider, { backgroundColor: theme.border }]} /><View style={styles.statusItem}><TowerControl size={18} color={theme.textSecondary} /><View><Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Grid</Text><Text style={[styles.statusValue, { color: wapdaCutOff ? "#EF4C4C" : wapdaUnavailable ? "#EF4C4C" : wapdaStandby ? "#F8C653" : tomznLive.isOnline ? "#548EFF" : "#8497AB" }]}>{wapdaCutOff ? "Offline" : wapdaUnavailable ? "Unavailable" : wapdaStandby ? "Standby" : tomznLive.isOnline ? "Available" : "Offline"}</Text></View></View><View style={[styles.statusDivider, { backgroundColor: theme.border }]} /><View style={styles.statusItem}><Waves size={18} color={theme.textSecondary} /><View><Text style={[styles.statusLabel, { color: theme.textSecondary }]}>Active Meter</Text><Text style={[styles.statusValue, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">{activeMeter === "meter1" ? "Meter 1" : "Meter 2"}</Text></View></View></View>
    <View style={{ width: "100%" }} onLayout={(event) => {
      const { y, height: sceneHeight } = event.nativeEvent.layout;
      liveSceneLayout.current = { y, height: sceneHeight };
      updateLiveSceneVisibility(0);
    }}>
      <LiveEnergyScene inverter={inverter} weather={weather} offline={isOffline} tomznLive={tomznLive} inverterOff={inverterOff} loadStatus={home.loadStatus} normalDrawKw={home.normalDrawKw} isVisible={isLiveSceneVisible} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, width: '100%' }}>
      <EnergyReceivedCard
        totalEnergy={energyToday.solarKwh + home.todayUsage}
        solarEnergy={energyToday.solarKwh}
        gridEnergy={home.todayUsage}
        isWapda={tomznLive.isOnline && !wapdaCutOff}
        isLight={isLight}
      />
      <EnergyUsedCard
        totalHomeUsage={home.todayUsage}
        liveLoadW={inverterOff ? tomznLive.powerW : inverter.loadW}
        peakLoadW={peakLoadW}
        vsYesterdayPercent={home.usageChangePercent ?? null}
        voltage={tomznLive.voltageV || inverter.gridV}
        currentA={tomznLive.currentA}
        loadStatus={home.loadStatus || "Normal"}
        normalDrawKw={home.normalDrawKw || 0}
        isLight={isLight}
      />
    </View>
    <ForecastBudgetCard
      expectedUnits={home.projectedMonthly}
      vsLastMonth={home.vsLastMonthPercent ?? null}
      lastMonthTotal={home.lastMonthTotal ?? 0}
      confidence={home.confidencePercent}
      dailyUsage={home.dailyUsage || []}
      budgetLeft={budgetMeter.remainingUnits}
      budgetTarget={budgetMeter.targetUnits}
      daysLeft={budgetMeter.projectedDaysLeft}
      combinedDaysLeft={home.combinedDaysLeft ?? 0}
      averageDaily={home.averageDaily}
      meter1Left={meterOne.remainingUnits}
      meter1Target={meterOne.targetUnits}
      meter1Used={meterOne.cycleUsage ?? 0}
      meter1Today={meterOne.todayUsage}
      meter1DaysLeft={meterOne.projectedDaysLeft}
      meter2Left={meterTwo.remainingUnits}
      meter2Target={meterTwo.targetUnits}
      meter2Used={meterTwo.cycleUsage ?? 0}
      meter2Today={meterTwo.todayUsage}
      meter2DaysLeft={meterTwo.projectedDaysLeft}
      isLight={isLight}
    />
    <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}><View style={styles.rowHeader}><View><Text style={[styles.cardTitle, { color: theme.text }]}>Today’s Energy Flow</Text><View style={styles.legend}><Text style={[styles.legendItem, { color: "#F5C42E" }]}>● Solar</Text><Text style={[styles.legendItem, { color: "#35D86C" }]}>● Home</Text><Text style={[styles.legendItem, { color: "#548EFF" }]}>● Grid</Text><Text style={[styles.legendItem, { color: theme.textSecondary }]}>│ Now</Text></View></View></View><FlowChart points={todayFlow} width={chartWidth} startOfToday={startOfToday} isLight={isLight} /><View style={styles.axis}><Text style={[styles.axisText, { color: theme.textMuted }]}>12 AM</Text><Text style={[styles.axisText, { color: theme.textMuted }]}>6 AM</Text><Text style={[styles.axisText, { color: theme.textMuted }]}>12 PM</Text><Text style={[styles.axisText, { color: theme.textMuted }]}>6 PM</Text><Text style={[styles.axisText, { color: theme.textMuted }]}>12 AM</Text></View></View>
  </ScrollView></View>;
});

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { paddingHorizontal: 13, gap: 8, alignItems: "center" }, header: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }, greeting: { fontFamily: "Outfit", fontSize: 20, fontWeight: "700" }, location: { fontFamily: "Outfit", fontSize: 11, marginTop: 2 }, headerRight: { flexDirection: "row", alignItems: "center", gap: 9 }, bell: { width: 32, height: 32, justifyContent: "center", alignItems: "center" }, notification: { width: 6, height: 6, backgroundColor: "#32DD69", borderRadius: 3, position: "absolute", right: 3, top: 4 }, statusCard: { width: "100%", height: 47, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }, statusItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 }, statusDivider: { height: 23, width: StyleSheet.hairlineWidth, marginHorizontal: 6 }, statusLabel: { fontFamily: "Outfit", fontSize: 8 }, statusValue: { fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, metricRow: { width: "100%", flexDirection: "row", gap: 7 }, metric: { flex: 1, minHeight: 103, borderRadius: 14, padding: 9, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)" }, metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricLabel: { color: "#A3B2C3", fontFamily: "Outfit", fontSize: 9, marginTop: 6 }, metricNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 1 }, metricNumber: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 18, fontWeight: "700" }, metricUnit: { color: "#B7C5D4", fontFamily: "Outfit", fontSize: 8 }, metricDetail: { fontFamily: "Outfit", fontSize: 8, marginTop: 5 }, budgetRow: { width: "100%", flexDirection: "row", gap: 8 }, forecast: { flex: 1.18, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12 }, budget: { flex: 0.98, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12, alignItems: "center" }, rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardTitle: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 12, fontWeight: "600" }, confidence: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: "rgba(148,93,255,0.18)" }, confidenceText: { color: "#B69AFF", fontFamily: "Outfit", fontSize: 8 }, expected: { color: "#A2B1C1", fontFamily: "Outfit", fontSize: 9, marginTop: 10 }, bigNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 3 }, bigNumber: { color: "#F4F8FC", fontFamily: "Outfit", fontSize: 34, fontWeight: "700" }, bigUnit: { color: "#D7E1EB", fontFamily: "Outfit", fontSize: 11 }, meterText: { color: "#C5D2DF", fontFamily: "Outfit", fontSize: 8, marginTop: 8 }, meterRight: { color: "#E6EDF5", fontWeight: "700", textAlign: "right" }, track: { height: 4, borderRadius: 3, backgroundColor: "#27364A", overflow: "hidden", marginTop: 3 }, fill: { height: "100%", borderRadius: 3 }, allowance: { color: "#45E079", fontFamily: "Outfit", fontSize: 8, marginTop: 10 }, meterTabs: { flexDirection: "row", borderRadius: 11, backgroundColor: "#1A2737", padding: 2 }, meterTab: { minWidth: 31, alignItems: "center", borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7 }, meterTabActive: { backgroundColor: "#35D86C" }, meterTabText: { color: "#9CADBF", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, meterTabTextActive: { color: "#082112" }, gaugeWrap: { width: 150, height: 112, marginTop: 6, alignItems: "center", justifyContent: "center" }, gaugeContent: { position: "absolute", top: 31, alignItems: "center" }, gaugeStart: { position: "absolute", left: 13, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, gaugeEnd: { position: "absolute", right: 12, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, meterPill: { backgroundColor: "#32D96B", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }, meterPillText: { color: "#06200E", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, gauge: { width: 112, height: 112, borderRadius: 56, borderWidth: 8, borderColor: "#3B4758", borderTopColor: "#47DD73", borderLeftColor: "#47DD73", borderBottomColor: "#47DD73", marginTop: 10, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-36deg" }] }, gaugeInner: { alignItems: "center", transform: [{ rotate: "36deg" }] }, gaugeNumber: { color: "#7BF49C", fontFamily: "Outfit", fontSize: 27, fontWeight: "700" }, gaugeLabel: { color: "#E7EFF7", fontFamily: "Outfit", fontSize: 9 }, gaugeDays: { color: "#D3DEE9", fontFamily: "Outfit", fontSize: 9, marginTop: 8 }, reset: { color: "#9EAFBF", fontFamily: "Outfit", fontSize: 8, marginTop: 6 }, chartCard: { width: "100%", borderRadius: 15, borderWidth: 1, padding: 12 }, legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, legendItem: { fontFamily: "Outfit", fontSize: 8 }, dayPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }, dayText: { fontFamily: "Outfit", fontSize: 9 }, axis: { flexDirection: "row", justifyContent: "space-between", marginTop: -9 }, axisText: { fontFamily: "Outfit", fontSize: 7 }, inverterCard: { width: "100%", minHeight: 82, flexDirection: "row", alignItems: "center", borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 11, gap: 10 }, inverterImage: { width: 54, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#E3E8EC" }, inverterInfo: { flex: 1 }, inverterTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, inverterName: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 13, fontWeight: "600" }, online: { color: "#39DB70", fontFamily: "Outfit", fontSize: 8 }, inverterStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, inverterStat: { color: "#D4E0EB", fontFamily: "Outfit", fontSize: 8, lineHeight: 12 }, chevron: { color: "#C1D0DF", fontSize: 30 },
});
