import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { useEnergy } from "@/context/EnergyContext";
import { withAlpha } from "@/utils/ColorInterpolation";

export function UsageSummaryCard() {
  const { home } = useEnergy();
  const dailyData = (home.dailyUsage || []).map((item, index, all) => ({
    day: item.label,
    val: item.usage,
    active: index === all.length - 1,
  }));
  const maxVal = Math.max(1, ...dailyData.map((item) => item.val));
  const periodDay            = home.periodDay            || 0;
  const periodNight          = home.periodNight          || 0;
  const periodMorningEvening = home.periodMorningEvening || 0;
  const periodTotal = periodDay + periodNight + periodMorningEvening || 1;
  const dayPct  = Math.round((periodDay            / periodTotal) * 100);
  const nightPct = Math.round((periodNight          / periodTotal) * 100);
  const mePct   = Math.round((periodMorningEvening / periodTotal) * 100);
  const trendPercent = home.usageTrendPercent;
  const trendColor = trendPercent == null ? "#8A94A6" : trendPercent > 0 ? "#EF4444" : trendPercent < 0 ? "#10B981" : "#F8FAFC";
  const trendText = trendPercent == null
    ? "Trend learning"
    : `${trendPercent > 0 ? "↑" : trendPercent < 0 ? "↓" : "•"}${Math.abs(trendPercent).toFixed(1)}%`;

  const periods = [
    { label: "Day",       time: "9AM–6PM",        pct: dayPct,   color: "#F59E0B", icon: "☀️" },
    { label: "Transition",time: "5–9AM & 6–10PM", pct: mePct,   color: "#10B981", icon: "🌅" },
    { label: "Night",     time: "10PM–5AM",        pct: nightPct, color: "#60A5FA", icon: "🌙" },
  ];

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>USAGE SUMMARY</Text>
        <View style={styles.filterBtn}>
          <Text style={styles.filterText}>{home.confidencePercent}% confidence</Text>
        </View>
      </View>

      {/* Main Content Split into 2 columns */}
      <View style={styles.contentRow}>
        {/* Left Column: Daily Usage */}
        <View style={styles.leftCol}>
          <Text style={styles.sectionSubTitle}>Daily Usage (units)</Text>
          <View style={styles.avgRow}>
            <View style={styles.avgMetric}>
              <Text style={styles.avgValue}>{home.averageDaily.toFixed(2)}</Text>
              <Text style={styles.avgUnit}>avg / day</Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: withAlpha(trendColor, 0.14) }]}>
              <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
            </View>
          </View>

          {/* 7 Days Bar Chart */}
          <View style={styles.barChartContainer}>
            {dailyData.map((item, index) => {
              const heightPercent = (item.val / maxVal) * 100;
              return (
                <View key={index} style={styles.barCol}>
                  <Text style={styles.barValText}>{item.val}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: `${heightPercent}%` },
                        item.active ? styles.barFillActive : styles.barFillNormal,
                      ]}
                    />
                  </View>
                  <Text style={[styles.barDayText, item.active && styles.barDayTextActive]}>
                    {item.day}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Vertical Divider */}
        <View style={styles.divider} />

        {/* Right Column: Time-of-Day Breakdown */}
        <View style={styles.rightCol}>
          <Text style={styles.sectionSubTitle}>Usage Windows</Text>
          <View style={styles.timeGroup}>
            {periods.map((p) => (
              <View key={p.label} style={styles.periodRow}>
                <View style={styles.periodLabelRow}>
                  <Text style={styles.periodIcon}>{p.icon}</Text>
                  <Text style={[styles.periodName, { color: p.color }]} numberOfLines={1}>{p.label}</Text>
                  <Text style={styles.periodTime} numberOfLines={1}>{p.time}</Text>
                  <Text style={[styles.periodPct, { color: p.color }]}>{p.pct}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressBar, { width: `${p.pct}%`, backgroundColor: p.color }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0F141C",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  title: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  filterText: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 11,
  },
  contentRow: {
    flexDirection: "row",
    gap: 12,
  },
  leftCol: {
    flex: 1.1,
    gap: 8,
  },
  rightCol: {
    flex: 1,
    gap: 8,
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: 4,
  },
  sectionSubTitle: {
    color: "#6B7280",
    fontFamily: "Outfit",
    fontSize: 10,
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  avgMetric: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  avgValue: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 20,
    fontWeight: "700",
  },
  avgUnit: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 10,
  },
  trendBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendText: {
    color: "#10B981",
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "700",
  },
  barChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 75,
    marginTop: 4,
  },
  barCol: {
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  barValText: {
    color: "#6B7280",
    fontSize: 8,
    fontFamily: "Outfit",
  },
  barTrack: {
    width: 8,
    height: 48,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
  },
  barFillNormal: {
    backgroundColor: "#1E293B",
  },
  barFillActive: {
    backgroundColor: "#3B82F6",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  barDayText: {
    color: "#6B7280",
    fontSize: 9,
    fontFamily: "Outfit",
  },
  barDayTextActive: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  timeGroup: {
    gap: 10,
    marginTop: 8,
  },
  periodRow: {
    gap: 5,
  },
  periodLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  periodIcon: {
    fontSize: 13,
  },
  periodName: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 0,
  },
  periodTime: {
    color: "#4B5563",
    fontFamily: "Outfit",
    fontSize: 10,
    flex: 1,
    flexShrink: 1,
  },
  periodPct: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 0,
  },
  progressTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 3,
  },
});
