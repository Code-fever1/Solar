import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useEnergy } from "@/context/EnergyContext";
import { RefreshCw, Cpu } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export function TomznCard() {
  const { tomznLive, home, refreshTomzn } = useEnergy();
  const [refreshing, setRefreshing] = useState(false);

  const rotation = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    rotation.value = withSequence(
      withTiming(360, { duration: 600 }),
      withTiming(0, { duration: 0 })
    );
    setRefreshing(true);
    try {
      await refreshTomzn();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshTomzn, rotation]);

  const voltage = tomznLive.voltageV > 0 ? `${tomznLive.voltageV.toFixed(0)} V` : "-- V";
  const current = tomznLive.currentA > 0 ? `${tomznLive.currentA.toFixed(1)} A` : "-- A";
  const power = tomznLive.powerW > 0 ? tomznLive.powerDisplay : "-- W";
  const todayUnits = `${home.todayUsage.toFixed(2)} units`;
  const fetchedAt = tomznLive.fetchedAt
    ? new Date(tomznLive.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Waiting for meter";

  const hourlyUsage = home.hourlyUsage || [];
  const maximumHourlyUsage = Math.max(0.001, ...hourlyUsage.map((hour) => hour.usage));

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Cpu size={16} color="#3B82F6" />
          </View>
          <Text style={styles.title}>Tomzn</Text>
          <View style={[
            styles.liveBadge,
            !tomznLive.isOnline && styles.offlineBadge,
          ]}>
            <View style={[styles.liveDot, !tomznLive.isOnline && styles.offlineDot]} />
            <Text style={[styles.liveText, !tomznLive.isOnline && styles.offlineText]}>
              {!tomznLive.isOnline ? "GRID OFF" : tomznLive.isLive ? "LIVE" : "STALE"}
            </Text>
          </View>
        </View>

        <Pressable onPress={handleRefresh} disabled={refreshing} style={styles.refreshBtn}>
          <Animated.View style={spinStyle}>
            <RefreshCw size={14} color="#8A94A6" />
          </Animated.View>
        </Pressable>
      </View>

      {/* Sub header info */}
      <View style={styles.subHeader}>
        <Text style={styles.subText}>Last Fetch: {fetchedAt}</Text>
        <Text style={styles.subTextRight}>
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{todayUnits}</Text> Today (Import)
        </Text>
      </View>

      {/* Server-calculated 24-hour TOMZN usage */}
      <View style={styles.chartRow}>
        {hourlyUsage.map((hour, i) => {
          const height = Math.max(2, (hour.usage / maximumHourlyUsage) * 100);
          const isHighlighted = i === hourlyUsage.length - 1;
          return (
            <View
              key={i}
              style={[
                styles.bar,
                { height: `${height}%` },
                isHighlighted ? styles.barHighlighted : styles.barNormal,
              ]}
            />
          );
        })}
      </View>

      {/* 3 Stat Tiles at Bottom */}
      <View style={styles.statsRow}>
        <View style={[styles.statTile, !tomznLive.isOnline && styles.statTileOffline]}>
          <Text style={styles.statLabel}>Voltage</Text>
          <Text style={[styles.statValue, !tomznLive.isOnline && styles.statValueOffline]}>{voltage}</Text>
        </View>
        <View style={[styles.statTile, !tomznLive.isOnline && styles.statTileOffline]}>
          <Text style={styles.statLabel}>Current</Text>
          <Text style={[styles.statValue, !tomznLive.isOnline && styles.statValueOffline]}>{current}</Text>
        </View>
        <View style={[styles.statTile, !tomznLive.isOnline && styles.statTileOffline]}>
          <Text style={styles.statLabel}>Power</Text>
          <Text style={[styles.statValue, !tomznLive.isOnline && styles.statValueOffline]}>{power}</Text>
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
    gap: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  offlineBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#3B82F6",
  },
  offlineDot: {
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: "#3B82F6",
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "700",
  },
  offlineText: {
    color: "#EF4444",
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  subHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subText: {
    color: "#6B7280",
    fontFamily: "Outfit",
    fontSize: 11,
  },
  subTextRight: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 11,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 50,
    paddingVertical: 4,
  },
  bar: {
    width: 6,
    borderRadius: 3,
  },
  barNormal: {
    backgroundColor: "#1E293B",
  },
  barHighlighted: {
    backgroundColor: "#3B82F6",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statTile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  statTileOffline: {
    opacity: 0.4,
    borderColor: "rgba(239, 68, 68, 0.12)",
  },
  statValueOffline: {
    color: "#6B7280",
  },
  statLabel: {
    color: "#6B7280",
    fontFamily: "Outfit",
    fontSize: 10,
    marginBottom: 2,
  },
  statValue: {
    color: "#FFFFFF",
    fontFamily: "Share Tech Mono",
    fontSize: 14,
    fontWeight: "700",
  },
});
