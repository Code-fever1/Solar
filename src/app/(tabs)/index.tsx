import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { BackgroundEngine } from "@/components/BackgroundEngine";
import { GlassPanel } from "@/components/GlassPanel";
import { EnergyCore } from "@/components/EnergyCore";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
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

  // Derive "mock" instant values for the EnergyCore from the current meter states
  // Normally this would come from a live inverter feed.
  const activeState = activeMeter === 'meter1' ? m1State : m2State;
  const loadKw = activeState.expectedRateKwH > 0 ? activeState.expectedRateKwH : 0;
  
  // Simulated day/night solar logic based on expected load
  const currentHour = new Date().getHours();
  const isDaytime = currentHour > 6 && currentHour < 18;
  const solarKw = isDaytime ? (loadKw > 0.5 ? loadKw - 0.5 : loadKw) : 0; 
  const gridKw = Math.max(0, loadKw - solarKw);

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
            <Text style={styles.greeting}>Good Evening</Text>
            <Text style={styles.time}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>WAPDA ACTIVE</Text>
          </View>
        </Animated.View>

        {/* Hero Section: Energy Core */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <GlassPanel style={styles.heroPanel}>
            <EnergyCore solarKw={solarKw} gridKw={gridKw} loadKw={loadKw} />
          </GlassPanel>
        </Animated.View>

        {/* AI Assistant Section */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <AIAssistantPanel />
        </Animated.View>

        {/* Meter Section */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.metersSection}>
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
              reading={m2State.reading} 
              expectedRateKwH={m2State.expectedRateKwH} 
              isActive={activeMeter === 'meter2'} 
            />
            <MechanicalMeter 
              reading={m1State.reading} 
              expectedRateKwH={m1State.expectedRateKwH} 
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
    paddingVertical: 8,
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
