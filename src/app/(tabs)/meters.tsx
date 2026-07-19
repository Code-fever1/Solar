import { Plus } from "lucide-react-native";
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

import { ChangeoverSwitch } from "@/components/ChangeoverSwitch";
import { GlassCard } from "@/components/GlassCard";
import { LogReadingModal } from "@/components/LogReadingModal";
import { MeterCard } from "@/components/MeterCard";
import { Colors } from "@/constants/Colors";
import type { ManualLog, MeterId } from "@/context/EnergyContext";
import { useEnergy } from "@/context/EnergyContext";

export default function MetersScreen() {
  const insets = useSafeAreaInsets();
  const {
    meters,
    manualLogs,
    addManualLog,
    editManualLog,
    deleteManualLog,
    activeMeter,
    swapChangeover,
  } = useEnergy();
  const [modalOpen, setModalOpen] = useState(false);
  const [editLogItem, setEditLogItem] = useState<ManualLog | null>(null);

  const activeMeterState = meters[activeMeter];

  const latestActiveLog = useMemo(() => {
    const activeLogs = manualLogs.filter((l) => l.meterId === activeMeter);
    if (activeLogs.length === 0) return null;
    return [...activeLogs].sort((a, b) => b.timestamp - a.timestamp)[0];
  }, [manualLogs, activeMeter]);

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
          <Text style={styles.title}>Meters Control</Text>
          <Text style={styles.subtitle}>
            Toggle active lines and modify manual reading units.
          </Text>
        </View>

        {/* Changeover Switch Active Selection Casing */}
        <GlassCard style={styles.controlCard}>
          <Text style={styles.controlLabel}>Select Active Supply Line</Text>
          <ChangeoverSwitch
            activeMeter={activeMeter}
            onToggle={() => swapChangeover()}
          />
        </GlassCard>

        {/* Dual Modification Controls Row */}
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => {
              setEditLogItem(null);
              setModalOpen(true);
            }}
            style={styles.primaryLogBtn}
          >
            <Plus color="#0A1018" size={14} />
            <Text style={styles.primaryLogBtnText}>Log Reading</Text>
          </Pressable>
          {latestActiveLog ? (
            <Pressable
              onPress={() => {
                setEditLogItem(latestActiveLog);
                setModalOpen(true);
              }}
              style={styles.secondaryLogBtn}
            >
              <Text style={styles.secondaryLogBtnText}>Edit Last</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Show only the currently selected meter */}
        <GlassCard style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Selected Meter</Text>
            <Text style={styles.selectedMeterLabel}>
              {activeMeter === "meter1"
                ? "Meter 1 (Analog)"
                : "Meter 2 (Digital)"}
            </Text>
          </View>
          <MeterCard meter={activeMeterState} isActive />
        </GlassCard>
      </ScrollView>

      {/* Log Reading Modal */}
      <LogReadingModal
        visible={modalOpen}
        initialMeterId={activeMeter}
        editLog={editLogItem}
        onClose={() => {
          setModalOpen(false);
          setEditLogItem(null);
        }}
        onSave={async (mId, val, ts, note) => {
          if (editLogItem) {
            await editManualLog(editLogItem.id, val, ts, note);
          } else {
            await addManualLog(mId, val, ts, note);
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
    gap: 16,
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
  controlCard: {
    padding: 14,
    gap: 10,
  },
  controlLabel: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 13.5,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  primaryLogBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.solar,
  },
  primaryLogBtnText: {
    color: "#0E1015",
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryLogBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  secondaryLogBtnText: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 14,
  },
  sectionCard: {
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },
  selectedMeterLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  segmentText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: Colors.dark.text,
  },
  timeline: {
    gap: 8,
  },
  timelineItem: {
    backgroundColor: "rgba(255,255,255,0.01)",
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
  timelineNotes: {
    color: Colors.dark.solar,
    fontFamily: "Outfit",
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 1,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 12,
  },
});
