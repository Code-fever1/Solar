import { Colors } from "@/constants/Colors";
import type { HomeState, MeterState } from "@/context/energy-types";
import { getRelativeTime } from "@/utils/calculations";
import type { MeterProfile } from "@/utils/MeterLearningEngine";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { GlassPanel } from "./GlassPanel";

interface SmartMeterProps {
  state: MeterState;
  home: HomeState;
  isActive: boolean;
  activeProfile?: MeterProfile;
}

export const SmartMeter: React.FC<SmartMeterProps> = ({
  state,
  home,
  isActive,
  activeProfile,
}) => {
  const scheme = useColorScheme();
  const isLight = scheme === "light";
  const theme = isLight ? Colors.light : Colors.dark;

  const { reading } = state;
  const expectedRateKwH = isActive ? home.expectedDrawNow : 0;
  const ledOpacity = useSharedValue(0.2);

  useEffect(() => {
    if (isActive && expectedRateKwH > 0) {
      const pulseSpeed = Math.max(180, 1400 - expectedRateKwH * 180);
      ledOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 60, easing: Easing.linear }),
          withTiming(0.2, {
            duration: pulseSpeed,
            easing: Easing.out(Easing.quad),
          }),
        ),
        -1,
        false
      );
    } else {
      ledOpacity.value = withTiming(0.2);
    }
  }, [isActive, expectedRateKwH]);

  const animatedLed = useAnimatedStyle(() => ({
    opacity: ledOpacity.value,
  }));

  const offset =
    state.lastLoggedReading !== undefined
      ? state.reading - state.lastLoggedReading
      : 0;
  const showOffset = isActive && offset > 0.05;

  const formattedDigits = reading.toFixed(1).padStart(7, "0");

  const getTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'No Logs';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 60) return `${Math.max(0, diffMins)}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <GlassPanel
      style={[
        styles.meterContainer,
        isActive ? styles.activeContainer : styles.inactiveContainer,
      ]}
      intensity={isActive ? 45 : 15}
      glowColor={isActive ? "rgba(0, 229, 255, 0.2)" : "transparent"}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
        <Text style={{ color: theme.textSecondary, fontFamily: 'Outfit', fontWeight: '700', fontSize: 14 }}>METER 2 (DIGITAL)</Text>
        <View style={{ 
          backgroundColor: isActive ? theme.success : 'rgba(150, 150, 150, 0.2)', 
          paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
          borderWidth: 1, borderColor: isActive ? theme.success : 'rgba(150,150,150,0.3)'
        }}>
          <Text style={{ 
            color: isActive ? '#000' : theme.textSecondary, 
            fontFamily: 'Outfit', fontWeight: '900', fontSize: 12, letterSpacing: 2 
          }}>
            {isActive ? 'LIVE ACTIVE' : 'STANDBY'}
          </Text>
        </View>
      </View>
      {/* Outer Clear Hardware Enclosure Frame */}
      <View
        style={[
          styles.faceplate,
          isLight ? styles.faceplateLight : styles.faceplateDark,
        ]}
      >
        {/* Top Header Section */}
        <View style={styles.topHeader}>
          <Text style={[styles.headerTitle, { color: theme.textSecondary }]}>
            SINGLE PHASE STATIC ENERGY METER
          </Text>
        </View>

        {/* Sub Header Specs Row */}
        <View style={styles.specSubHeader}>
          <View style={styles.pelLogoBox}>
            <View style={styles.ovalLogo}>
              <Text style={styles.ovalLogoText}>PEL</Text>
            </View>
            <Text style={[styles.specMiniText, { color: theme.textMuted }]}>
              2024
            </Text>
          </View>

          <View style={styles.accBox}>
            <Text style={[styles.specMiniText, { color: theme.textMuted }]}>
              Acc. Cl. 1.0 ⚡
            </Text>
            <View
              style={[
                styles.liveTag,
                {
                  backgroundColor: isActive
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(107, 114, 128, 0.15)",
                },
              ]}
            >
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: isActive ? "#10B981" : "#6B7280" },
                ]}
              />
              <Text
                style={[
                  styles.liveTagText,
                  { color: isActive ? "#10B981" : "#6B7280" },
                ]}
              >
                {isActive ? "LIVE LINE 2" : "STANDBY"}
              </Text>
            </View>
          </View>
        </View>

        {/* Digital LCD Window (PEL Style) */}
        <View style={styles.lcdFrame}>
          <View
            style={[
              styles.lcdScreen,
              isLight ? styles.lcdLight : styles.lcdDark,
            ]}
          >
            {/* Top LCD Status Line */}
            <View style={styles.lcdTopRow}>
              <Text style={styles.lcdTag}>TOTAL IMPORT (kWh)</Text>
              <Text style={styles.lcdTag}>TARIFF T1</Text>
            </View>

            {/* Main LCD Digits Display */}
            <View style={styles.lcdMainRow}>
              {showOffset && (
                <View style={styles.offsetBadge}>
                  <Text style={styles.offsetText}>+ {offset.toFixed(1)}</Text>
                </View>
              )}
              <Text style={styles.lcdDigits}>{formattedDigits}</Text>
              <Text style={styles.lcdUnit}>kWh</Text>
            </View>

            {/* Spec Bar underneath LCD digits */}
            <View style={styles.lcdSpecBar}>
              <Text style={styles.lcdSpecText}>
                240V  10(40)A  50Hz  TYPE PE1-7
              </Text>
            </View>
          </View>

          {/* 3 Red Hardware LED Indicators below LCD */}
          <View style={styles.ledIndicatorRow}>
            <View style={styles.ledItem}>
              <View style={styles.ledSocket}>
                <Animated.View style={[styles.ledBulb, animatedLed]} />
              </View>
              <Text style={[styles.ledLabelText, { color: theme.textMuted }]}>
                2400imp/kWh
              </Text>
            </View>

            <View style={styles.ledItem}>
              <View style={styles.ledSocket}>
                <View style={[styles.ledBulb, styles.ledOff]} />
              </View>
              <Text style={[styles.ledLabelText, { color: theme.textMuted }]}>
                Fault
              </Text>
            </View>

            <View style={styles.ledItem}>
              <View style={styles.ledSocket}>
                <View
                  style={[
                    styles.ledBulb,
                    { backgroundColor: isActive ? "#10B981" : "#6B7280" },
                  ]}
                />
              </View>
              <Text style={[styles.ledLabelText, { color: theme.textMuted }]}>
                Power
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 }}>
        <Text style={{ color: theme.textSecondary, fontFamily: 'Outfit', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
          {state.predictionConfidence?.toFixed(0) ?? 85}%
        </Text>
        <Text style={{ color: theme.textSecondary, fontFamily: 'Outfit', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
          {getTimeAgo(state.lastLoggedAt)}
        </Text>
      </View>
    </GlassPanel>
  );
};

const styles = StyleSheet.create({
  meterContainer: {
    padding: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  activeContainer: {
    borderColor: "rgba(0, 229, 255, 0.3)",
  },
  inactiveContainer: {
    borderColor: "rgba(255, 255, 255, 0.06)",
    opacity: 0.88,
  },
  faceplate: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 12,
  },
  faceplateLight: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  faceplateDark: {
    backgroundColor: "#0F172A",
    borderColor: "#334155",
  },
  topHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.2)",
    paddingBottom: 6,
  },
  headerTitle: {
    fontFamily: "Share Tech Mono",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  specSubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pelLogoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ovalLogo: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#0284C7",
    backgroundColor: "rgba(2, 132, 199, 0.1)",
  },
  ovalLogoText: {
    color: "#0284C7",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  specMiniText: {
    fontFamily: "Share Tech Mono",
    fontSize: 9,
  },
  accBox: {
    alignItems: "flex-end",
    gap: 2,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  liveTagText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8.5,
    fontWeight: "700",
  },
  lcdFrame: {
    gap: 8,
    marginVertical: 2,
  },
  lcdScreen: {
    borderRadius: 8,
    padding: 10,
    borderWidth: 2,
    borderColor: "#334155",
    gap: 6,
  },
  lcdLight: {
    backgroundColor: "#FFFCE8", // Cream color
  },
  lcdDark: {
    backgroundColor: "#FFFCE8", // Cream color
  },
  lcdTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lcdTag: {
    color: "rgba(0, 0, 0, 0.7)",
    fontFamily: "Share Tech Mono",
    fontSize: 9,
    fontWeight: "700",
  },
  lcdMainRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 6,
  },
  lcdDigits: {
    color: "#05160E",
    fontFamily: "Share Tech Mono",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 2,
  },
  lcdUnit: {
    color: "#05160E",
    fontFamily: "Share Tech Mono",
    fontSize: 12,
    fontWeight: "700",
  },
  lcdSpecBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.15)",
    paddingTop: 4,
    alignItems: "center",
  },
  lcdSpecText: {
    color: "rgba(0, 0, 0, 0.75)",
    fontFamily: "Share Tech Mono",
    fontSize: 8.5,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  offsetBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginRight: "auto",
  },
  offsetText: {
    color: "#05160E",
    fontFamily: "Share Tech Mono",
    fontSize: 11,
    fontWeight: "700",
  },
  ledIndicatorRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingTop: 2,
  },
  ledItem: {
    alignItems: "center",
    gap: 3,
  },
  ledSocket: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#475569",
  },
  ledBulb: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  ledOff: {
    backgroundColor: "#475569",
    shadowOpacity: 0,
  },
  ledLabelText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8,
  },
  serialRow: {
    alignItems: "center",
    paddingVertical: 2,
  },
  serialLabel: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
  },
  serialNumber: {
    fontFamily: "Share Tech Mono",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  infoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  mfgBox: {
    flex: 1,
    gap: 1,
  },
  mfgTitle: {
    fontFamily: "Outfit",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  mfgSub: {
    fontFamily: "Outfit",
    fontSize: 8.5,
    fontWeight: "600",
  },
  mfgNorm: {
    fontFamily: "Share Tech Mono",
    fontSize: 7.5,
  },
  itemsBox: {
    flex: 1,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    gap: 1,
  },
  itemsTitle: {
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  itemText: {
    fontFamily: "Share Tech Mono",
    fontSize: 7.5,
  },
  terminalChamber: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    gap: 6,
  },
  terminalLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  terminalLabel: {
    fontFamily: "Share Tech Mono",
    fontSize: 8,
    fontWeight: "700",
  },
  screwRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  terminalScrew: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#64748B",
    borderWidth: 1.5,
    borderColor: "#334155",
    justifyContent: "center",
    alignItems: "center",
  },
  screwSlot: {
    width: 12,
    height: 2,
    backgroundColor: "#1E293B",
  },
  footerRow: {
    alignItems: "center",
    marginTop: 2,
  },
  footerText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8.5,
  },
});
