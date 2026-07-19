import { CalendarRange, Edit3, Trash2 } from "lucide-react-native";
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

import { AnalyticsChart } from "@/components/AnalyticsChart";
import { GlassCard } from "@/components/GlassCard";
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
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
      >
        <View style={styles.hero}>
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>
            Grid import rates over time with report export capabilities.
          </Text>
        </View>

        {/* Period Selector */}
        <View style={styles.segmentRow}>
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
        </View>

        {/* Graph Card */}
        <AnalyticsChart data={history} />

        {/* Metrics Row */}
        <View style={styles.metricRow}>
          <GlassCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.bestDay}</Text>
            <Text style={styles.metricLabel}>Profile State</Text>
          </GlassCard>
          <GlassCard style={styles.metricCard}>
            <Text style={styles.metricValue}>{summary.worstDay}</Text>
            <Text style={styles.metricLabel}>Import State</Text>
          </GlassCard>
        </View>

        {/* Exports Card */}
        <GlassCard style={styles.reportCard}>
          <Text style={styles.sectionTitle}>Export Reports</Text>
          <View style={styles.reportButtons}>
            <Pressable
              onPress={() => exportCsv(history, period)}
              style={styles.reportButton}
            >
              <Text style={styles.reportButtonText}>CSV</Text>
            </Pressable>
            <Pressable
              onPress={() => exportPdf(history, period)}
              style={styles.reportButton}
            >
              <Text style={styles.reportButtonText}>PDF</Text>
            </Pressable>
            <Pressable
              onPress={() => exportExcel(history, period)}
              style={styles.reportButton}
            >
              <Text style={styles.reportButtonText}>Excel</Text>
            </Pressable>
          </View>
        </GlassCard>

        {/* Central Logs Registry */}
        <GlassCard style={styles.logsCard}>
          <View style={styles.logsHeader}>
            <CalendarRange color={Colors.dark.text} size={15} />
            <Text style={styles.sectionTitle}>Manual Logs Registry</Text>
          </View>
          <View style={styles.timeline}>
            {sortedLogs.map((entry) => (
              <View key={entry.id} style={styles.timelineItem}>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeaderRow}>
                    <Text style={styles.timelineTitle}>
                      {entry.reading.toFixed(1)} kWh
                    </Text>
                    <View style={styles.actionButtonsRow}>
                      <Pressable
                        onPress={() => handleEditPress(entry)}
                        style={styles.iconBtn}
                      >
                        <Edit3 color={Colors.dark.textSecondary} size={13} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeletePress(entry.id)}
                        style={styles.iconBtn}
                      >
                        <Trash2 color={Colors.dark.critical} size={13} />
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
        </GlassCard>
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
    </>
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
  segmentRow: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  segmentActive: {
    backgroundColor: Colors.dark.solar,
  },
  segmentText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: "#0E1015",
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    gap: 2,
    borderRadius: 12,
  },
  metricValue: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },
  metricLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
  },
  reportCard: {
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },
  reportButtons: {
    flexDirection: "row",
    gap: 8,
  },
  reportButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  reportButtonText: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
  },
  logsCard: {
    padding: 12,
    gap: 8,
  },
  logsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  timeline: {
    gap: 6,
  },
  timelineItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  timelineContent: {
    gap: 2,
  },
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineTitle: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 14,
    fontWeight: "700",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    padding: 2,
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
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 1,
  },
  emptyLogsText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
  },
});
