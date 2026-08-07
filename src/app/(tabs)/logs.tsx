import { GlassCard } from "@/components/GlassCard";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { Activity, ArrowUpRight, Clock, Trash2 } from "lucide-react-native";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SceneBackground } from "@/components/SceneBackground";

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function formatReading(reading: number): string {
  return reading.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useSceneTheme();
  const { manualLogs, deleteManualLog, meters } = useEnergy();

  const recentLogs = [...manualLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

  // Delta between current live reading and the last logged manual reading per meter.
  const lastLogged1 = manualLogs.filter(l => l.meterId === 'meter1').sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastLogged2 = manualLogs.filter(l => l.meterId === 'meter2').sort((a, b) => b.timestamp - a.timestamp)[0];
  const delta1 = lastLogged1 ? meters.meter1.reading - lastLogged1.reading : 0;
  const delta2 = lastLogged2 ? meters.meter2.reading - lastLogged2.reading : 0;

  const handleDelete = (logId: string, logMeter: string, logReading: number) => {
    Alert.alert(
      "Delete this reading?",
      `This will remove the ${logMeter} reading of ${logReading.toFixed(1)} units and restore the system to what it was before this entry.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteManualLog(logId);
            } catch {
              Alert.alert("Error", "Could not delete the reading. Check the server connection.");
            }
          },
        },
      ],
    );
  };

  return (
    <TabSlideWrapper index={3}>
    <View style={styles.screen}>
      <SceneBackground />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — centered */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Readings Log</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Manual meter readings history & calibration logs</Text>
        </View>

        {/* Summary stats — glass morphism cards */}
        <View style={styles.statsRow}>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.text }]}>Total Logs</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{manualLogs.length}</Text>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.text }]}>Meter 1</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{formatReading(meters.meter1.reading)}</Text>
            <View style={styles.statBottomRow}>
              <Text style={[styles.statUnit, { color: theme.textSecondary }]}>units</Text>
              {delta1 > 0.05 && (
                <View style={[styles.deltaTag, { backgroundColor: 'rgba(50,229,107,0.12)' }]}>
                  <Text style={[styles.deltaTagText, { color: '#32E56B' }]}>+{delta1.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </GlassCard>
          <GlassCard style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.text }]}>Meter 2</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{formatReading(meters.meter2.reading)}</Text>
            <View style={styles.statBottomRow}>
              <Text style={[styles.statUnit, { color: theme.textSecondary }]}>units</Text>
              {delta2 > 0.05 && (
                <View style={[styles.deltaTag, { backgroundColor: 'rgba(84,142,255,0.12)' }]}>
                  <Text style={[styles.deltaTagText, { color: '#548EFF' }]}>+{delta2.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </GlassCard>
        </View>

        {/* Recent Readings */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Activity size={14} color="#8862ED" />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Readings</Text>
          </View>
          <Text style={[styles.sectionCount, { color: theme.textSecondary }]}>{recentLogs.length} of {manualLogs.length}</Text>
        </View>

        {recentLogs.length > 0 ? (
          <GlassCard style={styles.logCard}>
            {recentLogs.map((log, idx) => {
              const prevLog = recentLogs[idx + 1];
              const delta = prevLog ? log.reading - prevLog.reading : 0;
              const isMeter1 = log.meterId === 'meter1';
              const meterColor = isMeter1 ? '#32E56B' : '#548EFF';
              const meterLabel = isMeter1 ? 'Meter 1' : 'Meter 2';
              return (
                <View key={log.id} style={[styles.logRow, { borderBottomColor: theme.border }, idx === recentLogs.length - 1 && { borderBottomWidth: 0 }]}>
                  {/* Left: timestamp + meter badge */}
                  <View style={styles.logLeft}>
                    <View style={[styles.meterBadge, { backgroundColor: isMeter1 ? 'rgba(50,229,107,0.12)' : 'rgba(84,142,255,0.12)', borderColor: `${meterColor}40` }]}>
                      <Text style={[styles.meterBadgeText, { color: meterColor }]}>{isMeter1 ? 'M1' : 'M2'}</Text>
                    </View>
                    <View style={styles.logInfo}>
                      <Text style={[styles.logMeter, { color: theme.text }]}>{meterLabel}</Text>
                      <Text style={[styles.logTime, { color: theme.textSecondary }]}>{formatDateTime(log.timestamp)}</Text>
                    </View>
                  </View>

                  {/* Middle: reading + delta */}
                  <View style={styles.logMiddle}>
                    <Text style={[styles.logReading, { color: theme.text }]}>{formatReading(log.reading)}</Text>
                    <Text style={[styles.logUnit, { color: theme.textSecondary }]}>units</Text>
                    {delta > 0 && (
                      <View style={styles.deltaChip}>
                        <ArrowUpRight size={8} color={meterColor} />
                        <Text style={[styles.deltaText, { color: meterColor }]}>+{delta.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>

                  {/* Right: notes + delete */}
                  <View style={styles.logRight}>
                    {log.notes ? <Text style={[styles.logNote, { color: theme.textSecondary }]} numberOfLines={1}>{log.notes}</Text> : null}
                    <Pressable
                      style={styles.deleteBtn}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      onPress={() => handleDelete(log.id, meterLabel, log.reading)}
                    >
                      <Trash2 size={15} color="#FF5252" />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </GlassCard>
        ) : (
          <GlassCard style={styles.emptyCard}>
            <View style={styles.emptyState}>
              <Clock size={28} color={theme.textSecondary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No readings yet</Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Manual readings logged from Settings will appear here.</Text>
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Outfit',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Outfit',
    marginTop: 3,
    textAlign: 'center',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    padding: 10,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 16,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginTop: 3,
  },
  statUnit: {
    fontSize: 10,
    fontFamily: 'Outfit',
  },
  statBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  deltaTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  deltaTagText: {
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Outfit',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 10,
    fontFamily: 'Outfit',
  },

  // Log card
  logCard: {
    padding: 0,
  },

  // Log row
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1.5,
  },
  meterBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  meterBadgeText: {
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  logInfo: {
    gap: 1,
  },
  logMeter: {
    fontSize: 12,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  logTime: {
    fontSize: 10,
    fontFamily: 'Outfit',
  },

  // Middle
  logMiddle: {
    alignItems: 'center',
    flex: 1,
  },
  logReading: {
    fontSize: 15,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  logUnit: {
    fontSize: 10,
    fontFamily: 'Outfit',
  },
  deltaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 3,
  },
  deltaText: {
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },

  // Right
  logRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  logNote: {
    fontSize: 10,
    fontFamily: 'Outfit',
    maxWidth: 60,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,82,82,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.30)',
  },

  // Empty state
  emptyCard: {
    padding: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 11,
    fontFamily: 'Outfit',
    textAlign: 'center',
  },
});
