import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DashboardGrid } from "@/components/DashboardGrid";
import { MetersOverview } from "@/components/MetersOverview";
import { TomznCard } from "@/components/TomznCard";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { MapPin, Zap } from "lucide-react-native";
import { useEnergy } from "@/context/EnergyContext";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { tomznLive, home, activeMeter, isOffline, pendingSyncCount } = useEnergy();

  // Real time string
  const currentTime = new Date();
  const h = currentTime.getHours();
  const m = currentTime.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  const timeString = `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;

  const greeting =
    h >= 5 && h < 12
      ? "Good Morning"
      : h >= 12 && h < 17
        ? "Good Afternoon"
        : h >= 17 && h < 21
        ? "Good Evening"
        : "Good Night";
  const statusColor = (isOffline || !tomznLive.isOnline) ? "#FBBF24" : "#10B981";
  const statusText = (isOffline || !tomznLive.isOnline)
    ? "GRID OFF"
    : (activeMeter === "meter1" ? "METER 1" : "METER 2");

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting}, Alijah 👋</Text>
            <View style={styles.locationRow}>
              <MapPin size={12} color="#8A94A6" />
              <Text style={styles.locationText}>Bhakkar · {timeString}</Text>
            </View>
          </View>

          <View style={[styles.statusPill, { backgroundColor: `${statusColor}1F`, borderColor: `${statusColor}40` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* 4 Cards Grid */}
        <DashboardGrid />

        {/* Meters Overview side-by-side */}
        <MetersOverview />

        {/* Tomzn 10-in-1 Breaker Card */}
        <TomznCard />

        {/* Usage Summary Card */}
        <UsageSummaryCard />

        {/* Great Going Banner */}
        <View style={styles.toastCard}>
          <View style={styles.toastIconBox}>
            <Zap size={14} color="#3B82F6" />
          </View>
          <Text style={styles.toastText}>{home.explanation}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#070A0F", // Deep dark navy black background
  },
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  greeting: {
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  locationText: {
    color: "#8A94A6",
    fontFamily: "Outfit",
    fontSize: 12,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0F141C",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  toastIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  toastText: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
  },
});
