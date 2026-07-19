import { CalendarRange, Edit3, Trash2, Download } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";

import { AnalyticsChart } from "@/components/AnalyticsChart";
import { GlassPanel } from "@/components/GlassPanel";
import { BackgroundEngine } from "@/components/BackgroundEngine";
import { GlowButton } from "@/components/GlowButton";
import { LogReadingModal } from "@/components/LogReadingModal";
import { Colors } from "@/constants/Colors";
import type { ManualLog } from "@/context/EnergyContext";
import { useEnergy } from "@/context/EnergyContext";
import { exportCsv, exportExcel, exportPdf } from "@/utils/export";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const {
    history,
    period,
    setPeriod,
    summary,
    manualLogs,
    editManualLog,
    deleteManualLog,
  } = useEnergy();
  const [modalOpen, setModalOpen] = useState(false);
  const [editLogItem, setEditLogItem] = useState<ManualLog | null>(null);

  const sortedLogs = useMemo(() => {
    return [...manualLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [manualLogs]);

  const getMeterLabel = (meterId: string) => {
    return meterId === "meter1" ? "Meter 1 (Analog)" : "Meter 2 (Digital)";
  };

  const handleEditPress = (log: ManualLog) => {
    setEditLogItem(log);
    setModalOpen(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this meter log entry? This will update all stats and graph data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteManualLog(id),
        },
      ],
    );
  };

  return (
    <View style={styles.screen}>
      <BackgroundEngine />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(100)} style={styles.hero}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>
            Financial-grade grid import charting.
          </Text>
        </Animated.View>

        {/* Period Selector */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.segmentRow}>
          {(["day", "week", "month", "year"] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setPeriod(value)}
              style={[styles.segment, period === value && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  period === value && styles.segmentTextActive,
                ]}
              >
                {value.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </Animated.View>

        {/* Graph Card */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <GlassPanel style={styles.chartPanel}>
            <AnalyticsChart data={history} />
          </GlassPanel>
        </Animated.View>

        {/* Metrics Row */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.metricRow}>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricLabel}>BEST DAY</Text>
            <Text style={styles.metricValue}>{summary.bestDay}</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricLabel}>WORST DAY</Text>
            <Text style={styles.metricValue}>{summary.worstDay}</Text>
          </GlassPanel>
        </Animated.View>

        {/* Exports */}
        <Animated.View entering={FadeInDown.delay(500)}>
          <GlassPanel style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Download color={Colors.dark.textSecondary} size={16} />
              <Text style={styles.sectionTitle}>Export Reports</Text>
            </View>
            <View style={styles.reportButtons}>
              <GlowButton label="CSV" variant="secondary" style={styles.reportBtn} onPress={() => exportCsv(history, period)} />
              <GlowButton label="PDF" variant="secondary" style={styles.reportBtn} onPress={() => exportPdf(history, period)} />
              <GlowButton label="Excel" variant="secondary" style={styles.reportBtn} onPress={() => exportExcel(history, period)} />
            </View>
          </GlassPanel>
        </Animated.View>

        {/* Central Logs Registry */}
        <Animated.View entering={FadeInDown.delay(600)}>
          <GlassPanel style={styles.logsCard}>
            <View style={styles.logsHeader}>
              <CalendarRange color={Colors.dark.text} size={16} />
              <Text style={styles.sectionTitle}>Manual Logs Registry</Text>
            </View>
            <View style={styles.timeline}>
              {sortedLogs.map((entry, index) => (
                <View key={entry.id} style={styles.timelineItem}>
                  {/* Timeline Dot */}
                  <View style={styles.timelineDot} />
                  {/* Timeline Line */}
                  {index !== sortedLogs.length - 1 && <View style={styles.timelineLine} />}
                  
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeaderRow}>
                      <Text style={styles.timelineTitle}>
                        {entry.reading.toFixed(1)} kWh
                      </Text>
                      <View style={styles.actionButtonsRow}>
                        <Pressable onPress={() => handleEditPress(entry)} style={styles.iconBtn}>
                          <Edit3 color={Colors.dark.textSecondary} size={14} />
                        </Pressable>
                        <Pressable onPress={() => handleDeletePress(entry.id)} style={styles.iconBtn}>
                          <Trash2 color={Colors.dark.critical} size={14} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.timelineTime}>
                      <Text style={styles.boldText}>
                        {getMeterLabel(entry.meterId)}
                      </Text>{" "}
                      • {new Date(entry.timestamp).toLocaleDateString()}{" "}
                      {new Date(entry.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    {entry.notes ? (
                      <Text style={styles.timelineNotes}>
                        Note: {entry.notes}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
              {sortedLogs.length === 0 && (
                <Text style={styles.emptyLogsText}>
                  No readings have been logged yet.
                </Text>
              )}
            </View>
          </GlassPanel>
        </Animated.View>
      </ScrollView>

      {/* Log Reading Modal */}
      <LogReadingModal
        visible={modalOpen}
        editLog={editLogItem}
        onClose={() => {
          setModalOpen(false);
          setEditLogItem(null);
        }}
        onSave={async (mId, val, ts, note) => {
          if (editLogItem) {
            await editManualLog(editLogItem.id, val, ts, note);
          }
          setModalOpen(false);
          setEditLogItem(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  hero: {
    gap: 4,
    marginBottom: 8,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  segmentActive: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  segmentText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: Colors.dark.text,
  },
  chartPanel: {
    padding: 12,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    gap: 4,
  },
  metricLabel: {
    color: Colors.dark.textMuted,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  metricValue: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 20,
  },
  reportCard: {
    padding: 16,
    gap: 16,
  },
  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  reportButtons: {
    flexDirection: "row",
    gap: 12,
  },
  reportBtn: {
    flex: 1,
    paddingVertical: 10,
  },
  logsCard: {
    padding: 16,
    gap: 16,
  },
  logsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeline: {
    paddingTop: 8,
  },
  timelineItem: {
    paddingVertical: 12,
    position: 'relative',
    paddingLeft: 24,
  },
  timelineDot: {
    position: 'absolute',
    left: 4,
    top: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.load,
    shadowColor: Colors.dark.loadGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  timelineLine: {
    position: 'absolute',
    left: 7.5,
    top: 28,
    bottom: -10,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  timelineContent: {
    gap: 4,
  },
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineTitle: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 15,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  timelineTime: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
  },
  boldText: {
    color: Colors.dark.text,
    fontWeight: "600",
  },
  timelineNotes: {
    color: Colors.dark.solar,
    fontFamily: "Outfit",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  emptyLogsText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
});
