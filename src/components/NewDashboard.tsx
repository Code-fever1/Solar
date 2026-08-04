import { Bell, Bolt, SunMedium, TowerControl, Waves } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { useEnergy } from "@/context/EnergyContext";
import { useUiMode } from "@/context/UiModeContext";
import { LiveEnergyScene } from "./LiveEnergyScene";
import { EnergyReceivedCard, EnergyUsedCard, ForecastBudgetCard } from "./NewDashboardCards";

type FlowPoint = { solarKw: number; gridKw: number; loadKw: number };

function value(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.0";
}



function FlowChart({ points, width }: { points: FlowPoint[]; width: number }) {
  const height = 116;
  const graphWidth = Math.max(1, width - 24);
  const paths = useMemo(() => {
    const values = points.length > 1 ? points : Array.from({ length: 24 }, () => ({ solarKw: 0, loadKw: 0, gridKw: 0 }));
    const max = Math.max(1, ...values.flatMap((point) => [point.solarKw, point.loadKw, point.gridKw]));
    const make = (key: keyof FlowPoint) => values.map((point, index) => {
      const x = 12 + index / Math.max(1, values.length - 1) * graphWidth;
      const y = 96 - point[key] / max * 76;
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    // Find peak load point
    const peakIdx = values.reduce((maxIdx, p, i, arr) => p.loadKw > arr[maxIdx].loadKw ? i : maxIdx, 0);
    const peakX = 12 + peakIdx / Math.max(1, values.length - 1) * graphWidth;
    const peakY = 96 - values[peakIdx].loadKw / max * 76;
    // Current time marker — based on actual time of day
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const currentX = 12 + (currentHour / 24) * graphWidth;
    return { solar: make("solarKw"), home: make("loadKw"), grid: make("gridKw"), peakX, peakY, currentX };
  }, [graphWidth, points]);
  return <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
    <Line x1="12" y1="20" x2={width - 12} y2="20" stroke="rgba(142,167,196,0.08)" />
    <Line x1="12" y1="58" x2={width - 12} y2="58" stroke="rgba(142,167,196,0.08)" />
    <Line x1="12" y1="96" x2={width - 12} y2="96" stroke="rgba(142,167,196,0.08)" />
    {/* Current time marker — vertical dashed line */}
    <Line x1={paths.currentX} y1="16" x2={paths.currentX} y2="96" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="2 3" />
    <Circle cx={paths.currentX} cy="14" r="2.5" fill="#F4F8FC" />
    {/* Energy flow lines */}
    <Path d={paths.solar} stroke="#F9C641" strokeWidth={1.4} fill="none" />
    <Path d={paths.home} stroke="#2DDB6C" strokeWidth={1.3} fill="none" />
    <Path d={paths.grid} stroke="#4A85FF" strokeWidth={1.3} fill="none" />
    {/* Peak marker */}
    <Circle cx={paths.peakX} cy={paths.peakY} r="3" fill="#2DDB6C" />
    <Circle cx={paths.peakX} cy={paths.peakY} r="5" fill="#2DDB6C" opacity="0.2" />
  </Svg>;
}

export function NewDashboard() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { toggleMode } = useUiMode();
  const { activeMeter, energyToday, flowHistory, home, inverter, isOffline, meters, weather, tomznLive } = useEnergy();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : hour < 21 ? "Good Evening" : "Good Night";
  const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const meterOne = meters.meter1;
  const meterTwo = meters.meter2;
  const chartWidth = Math.min(width - 32, 520);
  const budgetMeter = activeMeter === "meter1" ? meterOne : meterTwo;
  const solarLive = inverter.isLive && inverter.solarW > 25;
  // Inverter is considered OFF when everything reads zero (gridV 0, solar 0, grid 0, load 0)
  // or when InverterZone reports standby mode ("S").
  const inverterOff = inverter.isLive && (
    inverter.inverterMode === "S" ||
    (inverter.gridV === 0 && inverter.solarW === 0 && inverter.gridW === 0 && inverter.loadW === 0)
  );
  // Relay off with fault code 2048 = cutoff state
  const wapdaCutOff = tomznLive.isOnline && !tomznLive.switchOn && tomznLive.faultCode === 2048;
  // Relay off without fault code = standby state
  const wapdaStandby = tomznLive.isOnline && !tomznLive.switchOn && tomznLive.faultCode !== 2048;

  return <View style={styles.screen}><ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 105 }]} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.greeting}>{greeting}, Alijah</Text><Text style={styles.location}>⌾ Bhakkar · {time}</Text></View><View style={styles.headerRight}><Pressable accessibilityRole="button" onPress={toggleMode} style={styles.switch}><Text style={styles.switchText}>Old UI</Text></Pressable><View style={styles.bell}><Bell size={19} color="#E9F0F8" /><View style={styles.notification} /></View></View></View>
    <View style={styles.statusCard}><View style={styles.statusItem}><SunMedium size={19} color="#F5C42E" /><View><Text style={styles.statusLabel}>Solar</Text><Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : solarLive ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Off" : solarLive ? "Online" : "Standby"}</Text></View></View><View style={styles.statusDivider} /><View style={styles.statusItem}><Bolt size={18} color="#D9E3EE" /><View><Text style={styles.statusLabel}>Inverter</Text><Text style={[styles.statusValue, { color: inverterOff ? "#EF4C4C" : inverter.inverterFault === "NO" ? "#32E56B" : "#F8C653" }]}>{inverterOff ? "Offline" : inverter.inverterFault === "NO" ? "Healthy" : inverter.inverterFault}</Text></View></View><View style={styles.statusDivider} /><View style={styles.statusItem}><TowerControl size={18} color="#D9E3EE" /><View><Text style={styles.statusLabel}>Grid</Text><Text style={[styles.statusValue, { color: wapdaCutOff ? "#EF4C4C" : wapdaStandby ? "#F8C653" : tomznLive.isOnline ? "#548EFF" : "#8497AB" }]}>{wapdaCutOff ? "Cutoff" : wapdaStandby ? "Standby" : tomznLive.isOnline ? "Stable" : "Offline"}</Text></View></View><View style={styles.statusDivider} /><View style={styles.statusItem}><Waves size={18} color="#D9E3EE" /><View><Text style={styles.statusLabel}>Active Meter</Text><Text style={styles.statusValue}>{activeMeter === "meter1" ? "Meter 1 (Analog)" : "Meter 2 (Digital)"}</Text></View></View></View>
    <LiveEnergyScene inverter={inverter} weather={weather} offline={isOffline} tomznLive={tomznLive} inverterOff={inverterOff} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, width: '100%' }}>
      <EnergyReceivedCard
        totalEnergy={energyToday.solarKwh + home.todayUsage}
        solarEnergy={energyToday.solarKwh}
        gridEnergy={home.todayUsage}
        isWapda={tomznLive.isOnline && !wapdaCutOff}
      />
      <EnergyUsedCard
        totalHomeUsage={home.todayUsage}
        liveLoadW={inverterOff ? tomznLive.powerW : inverter.loadW}
        peakLoadW={Math.max(...flowHistory.slice(-288).map(p => p.loadKw * 1000), inverter.loadW)}
        vsYesterdayPercent={home.usageChangePercent ?? null}
        voltage={tomznLive.voltageV || inverter.gridV}
        currentA={tomznLive.currentA}
        loadStatus={home.loadStatus || "Normal"}
        normalDrawKw={home.normalDrawKw || 0}
      />
    </View>
    <ForecastBudgetCard
      expectedUnits={home.projectedMonthly}
      vsLastMonth={home.usageChangePercent ?? null}
      confidence={home.confidencePercent}
      dailyUsage={home.dailyUsage || []}
      budgetLeft={budgetMeter.remainingUnits}
      budgetTarget={budgetMeter.targetUnits}
      daysLeft={budgetMeter.projectedDaysLeft}
      meter1Left={meterOne.remainingUnits}
      meter1Target={meterOne.targetUnits}
      meter2Left={meterTwo.remainingUnits}
      meter2Target={meterTwo.targetUnits}
    />
    <View style={styles.chartCard}><View style={styles.rowHeader}><View><Text style={styles.cardTitle}>Today’s Energy Flow</Text><View style={styles.legend}><Text style={[styles.legendItem, { color: "#F5C42E" }]}>● Solar</Text><Text style={[styles.legendItem, { color: "#35D86C" }]}>● Home</Text><Text style={[styles.legendItem, { color: "#548EFF" }]}>● Grid</Text><Text style={[styles.legendItem, { color: "#F4F8FC" }]}>│ Now</Text></View></View></View><FlowChart points={flowHistory.slice(-72)} width={chartWidth} /><View style={styles.axis}><Text style={styles.axisText}>12 AM</Text><Text style={styles.axisText}>6 AM</Text><Text style={styles.axisText}>12 PM</Text><Text style={styles.axisText}>6 PM</Text><Text style={styles.axisText}>12 AM</Text></View></View>
    <View style={styles.inverterCard}><View style={styles.inverterImage}><Bolt size={25} color={inverterOff ? "#8497AB" : "#F0F6FC"} /></View><View style={styles.inverterInfo}><View style={styles.inverterTitleRow}><Text style={styles.inverterName}>Fronius PV14000</Text><Text style={[styles.online, { color: inverterOff ? "#EF4C4C" : "#32E56B" }]}>{inverterOff ? "● Offline" : "● Online"}</Text></View><View style={styles.inverterStats}><Text style={styles.inverterStat}>{value(inverterOff ? 0 : inverter.loadW / 1000)} kW{`\n`}AC Output</Text><Text style={styles.inverterStat}>{Math.round(inverterOff ? 0 : inverter.temperatureC)}°C{`\n`}Temperature</Text><Text style={styles.inverterStat}>{inverterOff ? "--" : inverter.ratedOutputW ? `${Math.round(inverter.loadW / inverter.ratedOutputW * 100)}%` : "--"}{`\n`}Efficiency</Text></View></View><Text style={styles.chevron}>›</Text></View>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080F19" }, content: { paddingHorizontal: 13, gap: 8, alignItems: "center" }, header: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }, greeting: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 20, fontWeight: "700" }, location: { color: "#AAB7C7", fontFamily: "Outfit", fontSize: 11, marginTop: 2 }, headerRight: { flexDirection: "row", alignItems: "center", gap: 9 }, switch: { borderRadius: 11, borderWidth: 1, borderColor: "rgba(194,215,239,0.28)", backgroundColor: "rgba(20,34,51,0.9)", paddingHorizontal: 8, paddingVertical: 6 }, switchText: { color: "#DCE9F7", fontFamily: "Outfit", fontSize: 10, fontWeight: "700" }, bell: { width: 32, height: 32, justifyContent: "center", alignItems: "center" }, notification: { width: 6, height: 6, backgroundColor: "#32DD69", borderRadius: 3, position: "absolute", right: 3, top: 4 }, statusCard: { width: "100%", height: 47, borderRadius: 16, backgroundColor: "#0F1927", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }, statusItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7 }, statusDivider: { height: 23, width: StyleSheet.hairlineWidth, backgroundColor: "rgba(187,208,234,0.13)", marginHorizontal: 6 }, statusLabel: { color: "#94A5B8", fontFamily: "Outfit", fontSize: 8 }, statusValue: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, metricRow: { width: "100%", flexDirection: "row", gap: 7 }, metric: { flex: 1, minHeight: 103, borderRadius: 14, padding: 9, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)" }, metricIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" }, metricLabel: { color: "#A3B2C3", fontFamily: "Outfit", fontSize: 9, marginTop: 6 }, metricNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 1 }, metricNumber: { color: "#F3F7FC", fontFamily: "Outfit", fontSize: 18, fontWeight: "700" }, metricUnit: { color: "#B7C5D4", fontFamily: "Outfit", fontSize: 8 }, metricDetail: { fontFamily: "Outfit", fontSize: 8, marginTop: 5 }, budgetRow: { width: "100%", flexDirection: "row", gap: 8 }, forecast: { flex: 1.18, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12 }, budget: { flex: 0.98, minHeight: 190, borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12, alignItems: "center" }, rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardTitle: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 12, fontWeight: "600" }, confidence: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: "rgba(148,93,255,0.18)" }, confidenceText: { color: "#B69AFF", fontFamily: "Outfit", fontSize: 8 }, expected: { color: "#A2B1C1", fontFamily: "Outfit", fontSize: 9, marginTop: 10 }, bigNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 3 }, bigNumber: { color: "#F4F8FC", fontFamily: "Outfit", fontSize: 34, fontWeight: "700" }, bigUnit: { color: "#D7E1EB", fontFamily: "Outfit", fontSize: 11 }, meterText: { color: "#C5D2DF", fontFamily: "Outfit", fontSize: 8, marginTop: 8 }, meterRight: { color: "#E6EDF5", fontWeight: "700", textAlign: "right" }, track: { height: 4, borderRadius: 3, backgroundColor: "#27364A", overflow: "hidden", marginTop: 3 }, fill: { height: "100%", borderRadius: 3 }, allowance: { color: "#45E079", fontFamily: "Outfit", fontSize: 8, marginTop: 10 }, meterTabs: { flexDirection: "row", borderRadius: 11, backgroundColor: "#1A2737", padding: 2 }, meterTab: { minWidth: 31, alignItems: "center", borderRadius: 9, paddingVertical: 4, paddingHorizontal: 7 }, meterTabActive: { backgroundColor: "#35D86C" }, meterTabText: { color: "#9CADBF", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, meterTabTextActive: { color: "#082112" }, gaugeWrap: { width: 150, height: 112, marginTop: 6, alignItems: "center", justifyContent: "center" }, gaugeContent: { position: "absolute", top: 31, alignItems: "center" }, gaugeStart: { position: "absolute", left: 13, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, gaugeEnd: { position: "absolute", right: 12, bottom: 6, color: "#C4D1DD", fontFamily: "Outfit", fontSize: 8 }, meterPill: { backgroundColor: "#32D96B", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }, meterPillText: { color: "#06200E", fontFamily: "Outfit", fontSize: 9, fontWeight: "700" }, gauge: { width: 112, height: 112, borderRadius: 56, borderWidth: 8, borderColor: "#3B4758", borderTopColor: "#47DD73", borderLeftColor: "#47DD73", borderBottomColor: "#47DD73", marginTop: 10, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-36deg" }] }, gaugeInner: { alignItems: "center", transform: [{ rotate: "36deg" }] }, gaugeNumber: { color: "#7BF49C", fontFamily: "Outfit", fontSize: 27, fontWeight: "700" }, gaugeLabel: { color: "#E7EFF7", fontFamily: "Outfit", fontSize: 9 }, gaugeDays: { color: "#D3DEE9", fontFamily: "Outfit", fontSize: 9, marginTop: 8 }, reset: { color: "#9EAFBF", fontFamily: "Outfit", fontSize: 8, marginTop: 6 }, chartCard: { width: "100%", borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 12 }, legend: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 5 }, legendItem: { fontFamily: "Outfit", fontSize: 8 }, dayPill: { borderWidth: 1, borderColor: "rgba(178,199,224,0.2)", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }, dayText: { color: "#D7E3F0", fontFamily: "Outfit", fontSize: 9 }, axis: { flexDirection: "row", justifyContent: "space-between", marginTop: -9 }, axisText: { color: "#8497AB", fontFamily: "Outfit", fontSize: 7 }, inverterCard: { width: "100%", minHeight: 82, flexDirection: "row", alignItems: "center", borderRadius: 15, backgroundColor: "#101A29", borderWidth: 1, borderColor: "rgba(176,199,224,0.1)", padding: 11, gap: 10 }, inverterImage: { width: 54, height: 58, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#E3E8EC" }, inverterInfo: { flex: 1 }, inverterTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, inverterName: { color: "#F1F6FC", fontFamily: "Outfit", fontSize: 13, fontWeight: "600" }, online: { color: "#39DB70", fontFamily: "Outfit", fontSize: 8 }, inverterStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 }, inverterStat: { color: "#D4E0EB", fontFamily: "Outfit", fontSize: 8, lineHeight: 12 }, chevron: { color: "#C1D0DF", fontSize: 30 },
});
