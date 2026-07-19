import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassCard } from "@/components/GlassCard";
import { Colors } from "@/constants/Colors";
import { useEnergy } from "@/context/EnergyContext";

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { alerts, clearAlerts } = useEnergy();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
      ]}
    >
      <View style={styles.hero}>
        <Text style={styles.title}>Alerts</Text>
        <Text style={styles.subtitle}>
          WAPDA slab warnings and log updates status appear here.
        </Text>
      </View>

      <Text onPress={clearAlerts} style={styles.clearText}>
        Dismiss All Alerts
      </Text>

      <View style={styles.list}>
        {alerts.map((alert) => (
          <GlassCard key={alert.id} style={styles.alertCard}>
            <View
              style={[
                styles.pill,
                alert.severity === "critical" && styles.pillCritical,
                alert.severity === "warning" && styles.pillWarning,
              ]}
            >
              <Text style={styles.pillText}>
                {alert.severity.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.alertTitle}>{alert.title}</Text>
            <Text style={styles.alertBody}>{alert.description}</Text>
            <Text style={styles.alertSource}>Source: {alert.source}</Text>
          </GlassCard>
        ))}
        {alerts.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.alertTitle}>No active alerts</Text>
            <Text style={styles.alertBody}>
              Your manual entries are up to date and slab projections are within
              limits.
            </Text>
          </GlassCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  hero: {
    gap: 4,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12.5,
    lineHeight: 18,
  },
  clearText: {
    color: Colors.dark.solar,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  list: {
    gap: 10,
  },
  alertCard: {
    padding: 12,
    gap: 6,
    borderRadius: 12,
  },
  emptyCard: {
    padding: 12,
    gap: 4,
    borderRadius: 12,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(24, 144, 255, 0.12)",
  },
  pillWarning: {
    backgroundColor: "rgba(250, 173, 20, 0.12)",
  },
  pillCritical: {
    backgroundColor: "rgba(255, 77, 79, 0.12)",
  },
  pillText: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  alertTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },
  alertBody: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    lineHeight: 17,
  },
  alertSource: {
    color: Colors.dark.textSecondary,
    fontFamily: "Share Tech Mono",
    fontSize: 11,
    marginTop: 2,
  },
});
