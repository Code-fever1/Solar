import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, G, Circle, Text as SvgText } from "react-native-svg";
import { Activity } from "lucide-react-native";

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
  const todayUsage = dailyData.length > 0 ? dailyData[dailyData.length - 1].val.toFixed(2) : "0.00";
  
  const periodDay            = home.periodDay            || 0;
  const periodNight          = home.periodNight          || 0;
  const periodMorningEvening = home.periodMorningEvening || 0;
  const periodTotal = periodDay + periodNight + periodMorningEvening || 1;
  const dayPct  = Math.round((periodDay            / periodTotal) * 100);
  const nightPct = Math.round((periodNight          / periodTotal) * 100);
  const mePct   = Math.round((periodMorningEvening / periodTotal) * 100);
  // --- Trend: % change, recent 3 days vs earlier days of the week (server-side split algo) ---
  const trendPct = home.usageTrendPercent;
  const trendColor =
    trendPct == null ? "#8A94A6"
    : trendPct > 0   ? "#EF4444"
    : trendPct < 0   ? "#10B981"
    :                  "#F8FAFC";
  const trendText =
    trendPct == null
      ? "Trend learning"
      : trendPct > 0
        ? `↑ ${Math.abs(trendPct).toFixed(1)}%`
        : trendPct < 0
          ? `↓ ${Math.abs(trendPct).toFixed(1)}%`
          : "• On avg";

  // --- Bar colours: white = avg, RGB-lerp INTO white from each side ---
  // Today = always blue. Other bars merge toward white as they approach avg.
  const nonZeroBars = dailyData.filter((d) => d.val > 0);
  const avgBarVal   = nonZeroBars.length
    ? nonZeroBars.reduce((s, d) => s + d.val, 0) / nonZeroBars.length
    : 1;

  // RGB lerp helper
  const lerpRgb = (
    [r1, g1, b1]: [number, number, number],
    [r2, g2, b2]: [number, number, number],
    t: number
  ): string => {
    const t_ = Math.max(0, Math.min(1, t));
    return `rgb(${Math.round(r1 + (r2 - r1) * t_)},${Math.round(g1 + (g2 - g1) * t_)},${Math.round(b1 + (b2 - b1) * t_)})`;
  };

  const WHITE: [number, number, number] = [230, 234, 240]; // soft white on dark bg
  const RED:   [number, number, number] = [239, 68,  68];
  const GREEN: [number, number, number] = [16,  185, 129];

  const getBarColor = (val: number, isActive: boolean): string => {
    // Today always blue
    if (isActive) return '#3B82F6';
    if (val === 0) return 'rgba(255,255,255,0.04)';

    const delta = val / avgBarVal - 1;   // 0 = exactly avg
    const t = Math.min(1, Math.abs(delta) * 3); // full intensity at ~33% off avg

    if (Math.abs(delta) < 0.05) return `rgba(230,234,240,0.80)`; // white
    // Blend from WHITE toward RED or GREEN — the closer to avg, the whiter
    return delta > 0
      ? lerpRgb(WHITE, RED,   t)  // above avg → redder
      : lerpRgb(WHITE, GREEN, t); // below avg → greener
  };

  const periods = [
    { label: "Day",       time: "9AM–6PM",        pct: dayPct,   color: "#F59E0B", icon: "☀️" },
    { label: "Transition",time: "5–9AM & 6–10PM", pct: mePct,   color: "#10B981", icon: "🌅" },
    { label: "Night",     time: "10PM–5AM",        pct: nightPct, color: "#60A5FA", icon: "🌙" },
  ];

  // Premium SVG Donut Chart calculations with exact SVG Path sector arcs
  const cx = 50;
  const cy = 50;
  const R = 45;
  const size = 100;

  let currentAngle = -Math.PI / 2; // Start at top (12 o'clock)

  const pieSlices = periods.map((p) => {
    const sliceAngle = (p.pct / 100) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);

    const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
    const pathD = p.pct >= 99.9
      ? `M ${cx - R} ${cy} A ${R} ${R} 0 1 0 ${cx + R} ${cy} A ${R} ${R} 0 1 0 ${cx - R} ${cy} Z`
      : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

    currentAngle += sliceAngle;

    return {
      ...p,
      pathD,
    };
  });

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.titleIconBox}>
            <Activity size={14} color="#A78BFA" />
          </View>
          <Text style={styles.title}>USAGE SUMMARY</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{home.confidencePercent}% confidence</Text>
        </View>
      </View>

      {/* Main Content Split into 2 columns */}
      <View style={styles.contentRow}>
        {/* Left Column: Daily Usage */}
        <View style={styles.leftCol}>
          <Text style={styles.sectionTitle}>AVG DAILY USAGE</Text>
          <View style={styles.avgRow}>
            <Text style={styles.avgValue}>{home.averageDaily.toFixed(2)}</Text>
            <Text style={styles.avgUnit}>units / day</Text>
            <View style={styles.spacer} />
            <View style={[styles.trendBadge, { backgroundColor: withAlpha(trendColor, 0.15) }]}>
              <Text style={[styles.trendText, { color: trendColor }]}>{trendText}</Text>
            </View>
          </View>

          {/* 7 Days Bar Chart */}
          <View style={styles.barChartContainer}>
            {dailyData.map((item, index) => {
              const heightPercent = (item.val / maxVal) * 100;
              const barColor  = getBarColor(item.val, item.active);
              return (
                <View key={index} style={styles.barCol}>
                  <Text style={styles.barValText}>{item.val}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${heightPercent}%`, backgroundColor: barColor }]} />
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
          <Text style={styles.sectionTitle}>USAGE WINDOWS</Text>
          <View style={styles.pieSectionRow}>
            <View style={styles.pieChartWrapper}>
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G>
                  {pieSlices.map((slice) => (
                    <Path
                      key={slice.label}
                      d={slice.pathD}
                      fill={slice.color}
                      stroke="#0F141C"
                      strokeWidth={3.5}
                      strokeLinejoin="round"
                    />
                  ))}
                  <Circle cx={cx} cy={cy} r={R * 0.65} fill="#0F141C" />
                </G>
              </Svg>
            </View>
            <View style={styles.pieLegendGroup}>
              {periods.map((p) => (
                <View key={p.label} style={styles.pieLegendItem}>
                  <View style={styles.legendTextRow}>
                    <Text style={styles.legendIcon}>{p.icon}</Text>
                    <Text style={[styles.legendName, { color: p.color }]}>{p.label}</Text>
                    <Text style={styles.legendTime}>{p.time}</Text>
                    <Text style={[styles.legendPct, { color: p.color }]}>{p.pct}%</Text>
                  </View>
                  <View style={styles.legendProgressBar}>
                    <View style={[styles.legendProgressFill, { width: `${p.pct}%`, backgroundColor: p.color }]} />
                  </View>
                </View>
              ))}
            </View>
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
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  titleIconBox: {
    backgroundColor: "rgba(167, 139, 250, 0.1)",
    padding: 6,
    borderRadius: 8,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  confidenceText: {
    color: "#10B981",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
  },
  contentRow: {
    flexDirection: "column",
    gap: 24,
  },
  leftCol: {
  },
  rightCol: {
  },
  divider: {
    height: 1,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionTitle: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  avgRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 20,
  },
  avgValue: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 32,
    fontWeight: "700",
  },
  avgUnit: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 12,
  },
  spacer: {
    flex: 1,
  },
  trendBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  trendText: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
  },
  barChartContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 90,
  },
  barCol: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  barValText: {
    color: "#8A94A6",
    fontSize: 10,
    fontFamily: "Outfit",
  },
  barTrack: {
    width: 10,
    height: 60,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: {
    width: "100%",
    borderRadius: 5,
  },
  barDayText: {
    color: "#6B7280",
    fontSize: 10,
    fontFamily: "Outfit",
  },
  barDayTextActive: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  pieSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flex: 1,
  },
  pieChartWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  pieLegendGroup: {
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  pieLegendItem: {
    gap: 6,
  },
  legendTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendIcon: {
    fontSize: 12,
  },
  legendName: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
  },
  legendTime: {
    color: "#6B7280",
    fontFamily: "Outfit",
    fontSize: 9,
  },
  legendPct: {
    marginLeft: "auto",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
  },
  legendProgressBar: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 3,
    overflow: "hidden",
  },
  legendProgressFill: {
    height: "100%",
    borderRadius: 3,
  },
});
