import { Plus } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ChangeoverSwitch } from "@/components/ChangeoverSwitch";
import { GlassPanel } from "@/components/GlassPanel";
import { GlowButton } from "@/components/GlowButton";
import { LogReadingModal } from "@/components/LogReadingModal";
import { MechanicalMeter } from "@/components/MechanicalMeter";
import { SmartMeter } from "@/components/SmartMeter";
import { BackgroundEngine } from "@/components/BackgroundEngine";
import { Colors } from "@/constants/Colors";
import type { ManualLog } from "@/context/EnergyContext";
import { useEnergy } from "@/context/EnergyContext";

export default function MetersScreen() {
  const insets = useSafeAreaInsets();
  const {
    meters,
    home,
    manualLogs,
    addManualLog,
    editManualLog,
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
          <Text style={styles.title}>Supply Control</Text>
          <Text style={styles.subtitle}>
            Active line changeover and physical meter synchronisation.
          </Text>
        </Animated.View>

        {/* Changeover Switch */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <GlassPanel style={styles.controlCard}>
            <Text style={styles.controlLabel}>ACTIVE SUPPLY LINE</Text>
            <ChangeoverSwitch
              activeMeter={activeMeter}
              onToggle={() => swapChangeover()}
            />
          </GlassPanel>
        </Animated.View>

        {/* Logging Actions */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.actionsRow}>
          <GlowButton 
            label="Log Reading" 
            variant="primary" 
            style={styles.primaryLogBtn}
            onPress={() => {
              setEditLogItem(null);
              setModalOpen(true);
            }} 
          />
          {latestActiveLog && (
            <GlowButton 
              label="Edit Last" 
              variant="secondary" 
              style={styles.secondaryLogBtn}
              onPress={() => {
                setEditLogItem(latestActiveLog);
                setModalOpen(true);
              }} 
            />
          )}
        </Animated.View>

        {/* Active Meter Display */}
        <Animated.View entering={FadeInDown.delay(400)}>
          <View style={styles.metersList}>
            <View style={{ opacity: activeMeter === 'meter2' ? 1 : 0.4 }}>
              <SmartMeter 
                state={meters.meter2} 
                home={home} 
                isActive={activeMeter === 'meter2'} 
              />
            </View>
            <View style={{ opacity: activeMeter === 'meter1' ? 1 : 0.4 }}>
              <MechanicalMeter 
                state={meters.meter1} 
                home={home} 
                isActive={activeMeter === 'meter1'} 
              />
            </View>
          </View>
        </Animated.View>
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
    gap: 20,
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
  controlCard: {
    padding: 16,
    gap: 16,
  },
  controlLabel: {
    color: Colors.dark.textMuted,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  metersList: {
    gap: 16,
  },
  primaryLogBtn: {
    flex: 2,
  },
  secondaryLogBtn: {
    flex: 1,
  },
  sectionCard: {
    padding: 16,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
});
