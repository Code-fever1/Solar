import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Activity, Zap, BarChart2, Calendar } from "lucide-react-native";
import { useEnergy } from "@/context/EnergyContext";
import Animated, { FadeIn } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <View style={styles.sparkPlaceholder} />;
  const width = 48;
  const height = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const path = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / range) * (height - 6);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DashboardGrid() {
  const { live, home } = useEnergy();

  // Card 1 — Today's Usage: full 24h hourly shape
  const hourlyValues = (home.hourlyUsage || []).map((hour) => hour.usage);

  // Card 2 — Current Speed: last 6 hours only (recent trend leading into now)
  const recentHourlyValues = hourlyValues.slice(-6);

  // Card 3 — Average Daily: 7-day bar shape
  const dailyValues = (home.dailyUsage || []).map((day) => day.usage);

  // Card 4 — Expected Monthly: cumulative running total (ascending projection shape)
  const cumulativeValues = dailyValues.reduce<number[]>((acc, val) => {
    acc.push((acc[acc.length - 1] || 0) + val);
    return acc;
  }, []);

  const change = home.usageChangePercent;
  const speedUsesWatts = live.gridKw < 1;
  const speedValue = speedUsesWatts ? Math.round(live.gridKw * 1000).toString() : live.gridKw.toFixed(2);
  const speedUnit = speedUsesWatts ? "W" : "kW";

  const usageChange = change == null
    ? "Yesterday's baseline is not ready"
    : `${change > 0 ? "↑" : change < 0 ? "↓" : "•"} ${Math.abs(change).toFixed(1)}% vs yesterday`;
  const usageChangeColor = change == null || change === 0 ? "#8A94A6" : change > 0 ? "#F59E0B" : "#10B981";

  // Load status: based on historical avg at this hour — no "Live ·" prefix
  const loadStatus = home.loadStatus || "Normal";
  const powerLabel = live.gridKw <= 0
    ? "No draw right now"
    : loadStatus === "High"   ? "↑ High vs avg this hour"
    : loadStatus === "Low"    ? "↓ Low vs avg this hour"
    :                           "On par with avg this hour";
  const powerLabelColor = live.gridKw <= 0
    ? "#6B7280"
    : loadStatus === "High"   ? "#EF4444"
    : loadStatus === "Low"    ? "#10B981"
    :                           "#F8FAFC";

  const observedDays = home.dailyUsage?.filter((day) => day.usage > 0).length || 0;
  const averageLabel = observedDays ? `Measured across ${observedDays} day${observedDays === 1 ? "" : "s"}` : "Collecting TOMZN history";

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <Animated.View entering={FadeIn.delay(0)} style={styles.card}>
          <View style={styles.cardHeader}><View style={[styles.iconBox, { backgroundColor: "rgba(59,130,246,0.15)" }]}><Activity size={14} color="#3B82F6" /></View><Text style={styles.cardTitle}>Today's Usage</Text></View>
          <View style={styles.valueRow}><Text style={styles.value}>{home.todayUsage.toFixed(2)}</Text><Text style={styles.unit}>units</Text></View>
          <View style={styles.footerRow}><Text style={[styles.subText, { color: usageChangeColor }]}>{usageChange}</Text><Sparkline values={hourlyValues} color="#3B82F6" /></View>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(60)} style={styles.card}>
          <View style={styles.cardHeader}><View style={[styles.iconBox, { backgroundColor: "rgba(239,68,68,0.15)" }]}><Zap size={14} color="#EF4444" /></View><Text style={styles.cardTitle}>Current Speed</Text></View>
          <View style={styles.valueRow}><Text style={styles.value}>{speedValue}</Text><Text style={styles.unit}>{speedUnit}</Text></View>
          <View style={styles.footerRow}><Text style={[styles.subText, { color: powerLabelColor }]}>{powerLabel}</Text><Sparkline values={recentHourlyValues} color={powerLabelColor === "#EF4444" ? "#EF4444" : powerLabelColor === "#10B981" ? "#10B981" : "#8A94A6"} /></View>
        </Animated.View>
      </View>
      <View style={styles.row}>
        <Animated.View entering={FadeIn.delay(120)} style={styles.card}>
          <View style={styles.cardHeader}><View style={[styles.iconBox, { backgroundColor: "rgba(139,92,246,0.15)" }]}><BarChart2 size={14} color="#8B5CF6" /></View><Text style={styles.cardTitle}>Average Daily</Text></View>
          <View style={styles.valueRow}><Text style={styles.value}>{home.averageDaily.toFixed(2)}</Text><Text style={styles.unit}>units / day</Text></View>
          <View style={styles.footerRow}><Text style={styles.subTextMuted}>{averageLabel}</Text><Sparkline values={dailyValues} color="#8B5CF6" /></View>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(180)} style={styles.card}>
          <View style={styles.cardHeader}><View style={[styles.iconBox, { backgroundColor: "rgba(245,158,11,0.15)" }]}><Calendar size={14} color="#F59E0B" /></View><Text style={styles.cardTitle}>Expected This Month</Text></View>
          <View style={[styles.valueRow, { marginTop: 14, marginBottom: 0}]}><Text style={[styles.value, { fontSize: 27 }]}>{Math.round(home.projectedMonthly)}</Text><Text style={styles.unit}>units</Text></View>
          <View style={styles.footerRow}><View style={{ flex: 1 }} /><Sparkline values={cumulativeValues} color="#F59E0B" /></View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
  card: { flex: 1, backgroundColor: "#0F141C", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", justifyContent: "space-between" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconBox: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#8A94A6", fontFamily: "Outfit", fontSize: 12, fontWeight: "500" },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginBottom: 10 },
  value: { color: "#FFFFFF", fontFamily: "Outfit", fontSize: 24, fontWeight: "700" },
  unit: { color: "#8A94A6", fontFamily: "Outfit", fontSize: 12 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 4 },
  subText: { flex: 1, fontFamily: "Outfit", fontSize: 10, fontWeight: "600" },
  subTextMuted: { flex: 1, color: "#6B7280", fontFamily: "Outfit", fontSize: 10 },
  sparkPlaceholder: { width: 48, height: 22 },
});
