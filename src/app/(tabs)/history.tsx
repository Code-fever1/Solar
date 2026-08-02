import { CalendarRange, Edit3, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnalyticsChart } from "@/components/AnalyticsChart";
import { BackgroundEngine } from "@/components/BackgroundEngine";
import { GlassPanel } from "@/components/GlassPanel";
import { LogReadingModal } from "@/components/LogReadingModal";
import { Colors } from "@/constants/Colors";
import type { ManualLog } from "@/context/EnergyContext";
import { useEnergy } from "@/context/EnergyContext";

import { useColorScheme } from "@/hooks/use-color-scheme";
import React from "react";

export default function HistoryScreen() {
  const scheme = useColorScheme();
  const theme = scheme === "light" ? Colors.light : Colors.dark;
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const insets = useSafeAreaInsets();
  const {
    history,
    period,
    setPeriod,
    summary,
    manualLogs,
    editManualLog,
    deleteManualLog,
    meters,
  } = useEnergy();
  const [modalOpen, setModalOpen] = useState(false);
  const [editLogItem, setEditLogItem] = useState<ManualLog | null>(null);
  const [expandedMeters, setExpandedMeters] = useState({
    meter1: false,
    meter2: false,
  });

  const sortedLogs = useMemo(() => {
    return [...manualLogs].sort((a, b) => b.timestamp - a.timestamp);
  }, [manualLogs]);

  const handleEditPress = (log: ManualLog) => {
    setEditLogItem(log);
    setModalOpen(true);
  };

  const handleDeletePress = (id: string) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Are you sure you want to delete this meter log entry? This will update all stats and graph data."
      );
      if (confirmed) {
        deleteManualLog(id);
      }
      return;
    }

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

  const renderLogColumn = (meterId: "meter1" | "meter2", title: string) => {
    const meterLogs = sortedLogs.filter((log) => log.meterId === meterId);
    const isExpanded = expandedMeters[meterId];
    const visibleLogs = isExpanded ? meterLogs : meterLogs.slice(0, 2);

    return (
      <View style={styles.logColumn}>
        <View style={styles.columnHeader}>
          <Text style={styles.columnTitle}>{title}</Text>
          {meterLogs.length > 2 ? (
            <Pressable
              onPress={() =>
                setExpandedMeters((current) => ({
                  ...current,
                  [meterId]: !current[meterId],
                }))
              }
              style={styles.expandButton}
            >
              <Text style={styles.expandButtonText}>
                {isExpanded ? "Show Less" : `Show All (${meterLogs.length})`}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.columnTimeline}>
          {visibleLogs.map((entry, index) => (
            <View key={entry.id} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              {index !== visibleLogs.length - 1 ? (
                <View style={styles.timelineLine} />
              ) : null}
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
                      <Edit3 color={Colors.dark.textSecondary} size={14} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeletePress(entry.id)}
                      style={styles.iconBtn}
                    >
                      <Trash2 color={Colors.dark.critical} size={14} />
                    </Pressable>
                  </View>
                </View>
                <Text style={styles.timelineTime}>
                  {new Date(entry.timestamp).toLocaleDateString()}{" "}
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                {entry.notes ? (
                  <Text style={styles.timelineNotes}>Note: {entry.notes}</Text>
                ) : null}
              </View>
            </View>
          ))}
          {meterLogs.length === 0 ? (
            <Text style={styles.emptyLogsText}>No logs</Text>
          ) : null}
        </View>
      </View>
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
        <Animated.View
          entering={FadeInDown.delay(200)}
          style={styles.segmentRow}
        >
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
        <Animated.View
          entering={FadeInDown.delay(400)}
          style={styles.metricRow}
        >
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricLabel}>BEST DAY</Text>
            <Text style={styles.metricValue}>{summary.bestDay}</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricLabel}>WORST DAY</Text>
            <Text style={styles.metricValue}>{summary.worstDay}</Text>
          </GlassPanel>
        </Animated.View>

        {/* Central Logs Registry - 2 Column Layout */}
        <Animated.View entering={FadeInDown.delay(500)}>
          <GlassPanel style={styles.logsCard}>
            <View style={styles.logsHeader}>
              <CalendarRange color={theme.text} size={16} />
              <Text style={styles.sectionTitle}>Manual Logs Registry</Text>
            </View>
            <View style={styles.logsColumns}>
              {renderLogColumn("meter1", "Meter 1 (Analog)")}
              {renderLogColumn("meter2", "Meter 2 (Digital)")}
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
        onSave={async (_mId, val, ts, note) => {
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

const getStyles = (theme: typeof Colors.light) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.background,
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
    color: theme.text,
    fontFamily: "Outfit",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: theme.textSecondary,
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
    backgroundColor: "rgba(100, 100, 100, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(100, 100, 100, 0.1)",
  },
  segmentActive: {
    backgroundColor: theme.borderStrong,
    borderColor: theme.border,
  },
  segmentText: {
    color: theme.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: theme.text,
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
    color: theme.textMuted,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  metricValue: {
    color: theme.text,
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
    color: theme.text,
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
  logsColumns: {
    flexDirection: "row",
    gap: 16,
  },
  logColumn: {
    flex: 1,
    gap: 8,
  },
  columnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  columnTitle: {
    color: theme.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  expandButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(100, 100, 100, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(100, 100, 100, 0.08)",
  },
  expandButtonText: {
    color: theme.textSecondary,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
  },
  columnTimeline: {
    paddingTop: 8,
  },
  timeline: {
    paddingTop: 8,
  },
  timelineItem: {
    paddingVertical: 12,
    position: "relative",
    paddingLeft: 24,
  },
  timelineDot: {
    position: "absolute",
    left: 4,
    top: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.load,
    shadowColor: theme.loadGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  timelineLine: {
    position: "absolute",
    left: 7.5,
    top: 28,
    bottom: -10,
    width: 1,
    backgroundColor: "rgba(150, 150, 150, 0.2)",
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
    color: theme.text,
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
    color: theme.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
  },
  boldText: {
    color: theme.text,
    fontWeight: "600",
  },
  timelineNotes: {
    color: theme.solar,
    fontFamily: "Outfit",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
  emptyLogsText: {
    color: theme.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
});
