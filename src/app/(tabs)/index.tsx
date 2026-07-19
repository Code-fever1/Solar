import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { BackgroundEngine } from "@/components/BackgroundEngine";
import { GlassPanel } from "@/components/GlassPanel";
import { RemainingUnitsHero } from "@/components/RemainingUnitsHero";
import { UsageStatisticsRow } from "@/components/UsageStatisticsRow";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { EnergyCore } from "@/components/EnergyCore";
import { MechanicalMeter } from "@/components/MechanicalMeter";
import { SmartMeter } from "@/components/SmartMeter";
import { BaselineOverrideModal } from "@/components/BaselineOverrideModal";
import { GlowButton } from "@/components/GlowButton";

import { Colors } from "@/constants/Colors";
import { useEnergy } from "@/context/EnergyContext";
import type { MeterId } from "@/context/energy-types";
import { getStartOfBillingCycle } from "@/utils/calculations";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { activeMeter, meters, setManualBaseline } = useEnergy();
  
  const [baselineModalVisible, setBaselineModalVisible] = useState(false);
  const [baselineMeterId, setBaselineMeterId] = useState<MeterId | null>(null);

  const m1State = meters.meter1;
  const m2State = meters.meter2;

  // Derive instant values for the EnergyCore directly from the Prediction Algorithm's output
  const activeState = activeMeter === 'meter1' ? m1State : m2State;
  
  // The prediction algorithm calculates exactly how fast the WAPDA meter is expected to be moving right now.
  const gridKw = Math.max(0, activeState.expectedDrawNow || 0);
  
  // Since we don't have live inverter telemetry hooked up to the frontend yet,
  // we simulate a generic house load by adding a rough solar estimate during the day.
  const currentHour = new Date().getHours();
  const isDaytime = currentHour > 6 && currentHour < 18;
  const solarKw = isDaytime ? 1.2 : 0; 
  const loadKw = gridKw + solarKw;

  const greeting =
    currentHour >= 5 && currentHour < 12 ? 'Good Morning' :
    currentHour >= 12 && currentHour < 17 ? 'Good Afternoon' :
    currentHour >= 17 && currentHour < 21 ? 'Good Evening' :
    'Good Night';

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
        {/* Top Section */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.topSection}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.time}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>WAPDA ACTIVE</Text>
          </View>
        </Animated.View>

        {/* Priority 1: Monthly WAPDA Status */}
        <RemainingUnitsHero m1State={m1State} m2State={m2State} activeMeter={activeMeter} />

        {/* Priority 2: Usage Statistics */}
        <UsageStatisticsRow activeState={activeState} />

        {/* Priority 3: AI Assistant Section */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <AIAssistantPanel activeState={activeState} />
        </Animated.View>

        {/* Priority 4: Power Flow (Visual Only) */}
        <Animated.View entering={FadeInDown.delay(400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Real-time Flow</Text>
          </View>
          <GlassPanel style={styles.secondaryPanel}>
            <EnergyCore solarKw={solarKw} gridKw={gridKw} loadKw={loadKw} />
          </GlassPanel>
        </Animated.View>

        {/* Priority 5: Meter Section */}
        <Animated.View entering={FadeInDown.delay(500)} style={styles.metersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Physical Meters</Text>
            <GlowButton 
              label="Edit Baseline" 
              variant="secondary" 
              style={styles.smallBtn} 
              textStyle={{ fontSize: 10 }}
              onPress={() => { setBaselineMeterId(activeMeter); setBaselineModalVisible(true); }}
            />
          </View>

          <View style={styles.metersList}>
            <SmartMeter 
              state={m2State} 
              isActive={activeMeter === 'meter2'} 
            />
            <MechanicalMeter 
              state={m1State} 
              isActive={activeMeter === 'meter1'} 
            />
          </View>
        </Animated.View>

        {baselineMeterId && (
          <BaselineOverrideModal
            visible={baselineModalVisible}
            meter={meters[baselineMeterId]}
            currentBaseline={
              baselineMeterId === "meter1" 
                ? m1State.reading - (m1State.targetUnits - m1State.remainingUnits)
                : m2State.reading - (m2State.targetUnits - m2State.remainingUnits)
            }
            onClose={() => {
              setBaselineModalVisible(false);
              setBaselineMeterId(null);
            }}
            onSave={async (meterId, num) => {
              await setManualBaseline(meterId, num, getStartOfBillingCycle(Date.now()));
              setBaselineModalVisible(false);
              setBaselineMeterId(null);
            }}
          />
        )}
      </ScrollView>
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
    gap: 24,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '600',
  },
  time: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.2)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.success,
    shadowColor: Colors.dark.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusText: {
    color: Colors.dark.success,
    fontFamily: 'Outfit',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroPanel: {
    height: 280,
    overflow: 'hidden',
    padding: 0,
  },
  secondaryPanel: {
    height: 180,
    overflow: 'hidden',
    padding: 0,
  },
  metersSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  metersList: {
    gap: 16,
  }
});
