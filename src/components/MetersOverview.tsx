import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useEnergy } from "@/context/EnergyContext";
import { CircularProgress } from "./CircularProgress";
import { ChevronRight, Shield } from "lucide-react-native";
import { withAlpha } from "@/utils/ColorInterpolation";

export function MetersOverview() {
  const { meters, activeMeter, home, tomznLive } = useEnergy();
  const m1 = meters.meter1;
  const m2 = meters.meter2;

  const m1Active = activeMeter === "meter1";
  const m2Active = activeMeter === "meter2";

  const formatDate = (timestamp?: number) => timestamp && timestamp > 0
    ? new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" })
    : "Not enough data";
  const paceStatus = home.paceStatus || "ON PACE";
  const paceColor = {
    CRITICAL: "#EF4444",
    AVERAGE: "#FACC15",
    "ON PACE": "#F8FAFC",
    GOOD: "#86EFAC",
    EXCELLENT: "#16A34A",
  }[paceStatus];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Shield size={14} color="#8A94A6" />
          <Text style={styles.title}>METERS OVERVIEW</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: withAlpha(paceColor, 0.12), borderColor: withAlpha(paceColor, 0.28) }]}>
          <View style={[styles.greenDot, { backgroundColor: paceColor }]} />
          <Text style={[styles.headerBadgeText, { color: paceColor }]}>{paceStatus} • {home.confidencePercent}%</Text>
          <ChevronRight size={12} color={paceColor} />
        </View>
      </View>

      {/* Side by side Meter Cards */}
      <View style={styles.cardsRow}>
        {/* Meter 1 (Analog) */}
        <View style={[styles.meterCard, m1Active && styles.meterCardActive]}>
          <View style={styles.cardHeader}>
            <Text style={styles.meterName}>Meter 1{"\n"}(Analog)</Text>
            <View style={[styles.statusBadge, {
              backgroundColor: m1Active
                ? (tomznLive.isOnline ? "rgba(16, 185, 129, 0.15)" : "rgba(251, 191, 36, 0.15)")
                : "rgba(255,255,255,0.06)"
            }]}>
              <Text style={[styles.statusText, {
                color: m1Active
                  ? (tomznLive.isOnline ? "#10B981" : "#FBBF24")
                  : "#6B7280"
              }]}>
                {m1Active ? (tomznLive.isOnline ? "ACTIVE" : "GRID OFF") : "STANDBY"}
              </Text>
            </View>
          </View>

          <View style={styles.circleContainer}>
            <CircularProgress
              usage={Math.max(0, m1.targetUnits - m1.remainingUnits)}
              target={m1.targetUnits}
              size={110}
              strokeWidth={8}
              outerScore={m1Active ? m1.consumptionSpeedScore : 65}
              centerLabel="UNITS LEFT"
            />
          </View>

          <View style={styles.statsContainer}>
            <Text style={styles.usedTodayText}>
              <Text style={{ color: "#10B981", fontWeight: "700" }}>{m1.todayUsage.toFixed(2)} Units</Text> Used Today
            </Text>
            <Text style={styles.subDetail}>
              {m1Active ? `→ ${formatDate(m1.projectedSlabDate)}` : `${m1.startsAfterDate ? formatDate(m1.startsAfterDate) : "TBD"} → ${formatDate(m1.projectedSlabDate)}`}
            </Text>
          </View>
          <Text style={[styles.totalUsedText, { color: "#10B981" }]}>{m1.cycleUsage?.toFixed(2) || "0.00"} Units Total Used</Text>

        </View>


        {/* Meter 2 (Digital) */}
        <View style={[styles.meterCard, m2Active && styles.meterCardActiveBlue]}>
          <View style={styles.cardHeader}>
            <Text style={styles.meterName}>Meter 2{"\n"}(Digital)</Text>
            <View style={[styles.statusBadge, {
              backgroundColor: m2Active
                ? (tomznLive.isOnline ? "rgba(59, 130, 246, 0.15)" : "rgba(251, 191, 36, 0.15)")
                : "rgba(255,255,255,0.06)"
            }]}>
              <Text style={[styles.statusText, {
                color: m2Active
                  ? (tomznLive.isOnline ? "#3B82F6" : "#FBBF24")
                  : "#6B7280"
              }]}>
                {m2Active ? (tomznLive.isOnline ? "ACTIVE" : "GRID OFF") : "NEXT"}
              </Text>
            </View>
          </View>

          <View style={styles.circleContainer}>
            <CircularProgress
              usage={Math.max(0, m2.targetUnits - m2.remainingUnits)}
              target={m2.targetUnits}
              size={110}
              strokeWidth={8}
              outerScore={m2Active ? m2.consumptionSpeedScore : 65}
              centerLabel="UNITS LEFT"
            />
          </View>

          <View style={styles.statsContainer}>
            <Text style={styles.usedTodayText}>
              <Text style={{ color: "#3B82F6", fontWeight: "700" }}>{m2.todayUsage.toFixed(2)} Units</Text> Used Today
            </Text>
            <Text style={styles.subDetail}>
              {m2Active ? `→ ${formatDate(m2.projectedSlabDate)}` : `${m2.startsAfterDate ? formatDate(m2.startsAfterDate) : "TBD"} → ${formatDate(m2.projectedSlabDate)}`}
            </Text>
          </View>
          <Text style={[styles.totalUsedText, { color: "#3B82F6" }]}>{m2.cycleUsage?.toFixed(2) || "0.00"} Units Total Used</Text>

        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  headerBadgeText: {
    color: "#10B981",
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
  },
  cardsRow: {
    flexDirection: "row",
    gap: 12,
    position: "relative",
    alignItems: "stretch",
  },
  meterCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
    justifyContent: "space-between",
    minHeight: 238,
  },
  meterCardActive: {
    borderColor: "rgba(16, 185, 129, 0.25)",
    backgroundColor: "rgba(16, 185, 129, 0.03)",
  },
  meterCardActiveBlue: {
    borderColor: "rgba(59, 130, 246, 0.25)",
    backgroundColor: "rgba(59, 130, 246, 0.03)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  meterName: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  circleContainer: {
    alignItems: "center",
    marginVertical: 4,
  },
  statsContainer: {
    alignItems: "center",
    marginVertical: 8,
    gap: 2,
  },
  usedTodayText: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 11,
    marginBottom: 2,
  },
  totalUsedText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 2,
  },
  subDetail: {
    color: "#6B7280",
    fontFamily: "Outfit",
    fontSize: 10,
  },
  swapBtn: {
    position: "absolute",
    left: "50%",
    top: "42%",
    transform: [{ translateX: -14 }, { translateY: -14 }],
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
});
