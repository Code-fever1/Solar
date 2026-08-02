import { Colors } from "@/constants/Colors";
import type { HomeState, MeterState } from "@/context/energy-types";
import { getRelativeTime } from "@/utils/calculations";
import type { MeterProfile } from "@/utils/MeterLearningEngine";
import React, { useEffect, useState } from "react";
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

interface MechanicalMeterProps {
  state: MeterState;
  home: HomeState;
  isActive: boolean;
  activeProfile?: MeterProfile;
}

export const MechanicalMeter: React.FC<MechanicalMeterProps> = ({
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
  const [containerWidth, setContainerWidth] = useState(200);
  const diskTranslation = useSharedValue(-30);

  useEffect(() => {
    // Single red stroboscopic mark translates continuously across the horizontal disk slot
    const speed =
      isActive && expectedRateKwH > 0
        ? Math.max(400, 2400 - expectedRateKwH * 350)
        : 9000;

    diskTranslation.value = -30;
    diskTranslation.value = withRepeat(
      withSequence(
        withTiming(containerWidth + 10, { duration: speed, easing: Easing.linear }),
        withTiming(-30, { duration: 0 }),
        withTiming(-30, { duration: speed })
      ),
      -1,
      false
    );
  }, [isActive, expectedRateKwH, containerWidth]);

  const animatedDiskEdge = useAnimatedStyle(() => ({
    transform: [{ translateX: diskTranslation.value }],
  }));

  const offset =
    state.lastLoggedReading !== undefined
      ? state.reading - state.lastLoggedReading
      : 0;
  const showOffset = isActive && offset > 0.05;

  const rawFormatted = reading.toFixed(1).padStart(6, "0"); // e.g. 001573
  const digits = rawFormatted.replace(".", "").split("");
  const integerDigits = digits.slice(0, 5);
  const fractionDigit = digits[5] || "0";

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
      glowColor={isActive ? "rgba(147, 51, 234, 0.2)" : "transparent"}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
        <Text style={{ color: theme.textSecondary, fontFamily: 'Outfit', fontWeight: '700', fontSize: 14 }}>METER 1 (ANALOG)</Text>
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
        {/* Top Header Title */}
        <View style={styles.topHeader}>
          <Text style={[styles.headerTitle, { color: theme.textSecondary }]}>
            KILOWATTHOURS
          </Text>
        </View>

        {/* Tumbler Counter Display Window (Syed Bhais Style) */}
        <View style={styles.counterSection}>
          {showOffset && (
            <View style={styles.offsetBadge}>
              <Text style={styles.offsetText}>+ {offset.toFixed(1)}</Text>
            </View>
          )}

          <View style={styles.tumblerHousing}>
            {/* 5 Integer Roller Wheels (White on Black) */}
            {integerDigits.map((digit, idx) => (
              <View key={`int-${idx}`} style={styles.rollerWheel}>
                <Text style={styles.rollerText}>{digit}</Text>
              </View>
            ))}

            {/* 1 Fractional Tenths Roller Wheel (Red Dial) */}
            <View style={[styles.rollerWheel, styles.fractionRoller]}>
              <Text style={styles.fractionText}>{fractionDigit}</Text>
            </View>
          </View>

          {/* Column Multipliers Row printed below counter */}
          <View style={styles.multipliersRow}>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              100,000
            </Text>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              10,000
            </Text>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              1,000
            </Text>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              100
            </Text>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              10
            </Text>
            <Text style={[styles.multiplierText, { color: theme.textMuted }]}>
              1
            </Text>
          </View>
        </View>

        {/* Center Logo & Sub-Specs Row */}
        <View style={styles.midLogoRow}>
          <View style={styles.sbLogoCircle}>
            <Text style={styles.sbLogoText}>SB</Text>
          </View>

          <View style={styles.specsColumn}>
            <Text style={[styles.specBoldText, { color: theme.text }]}>
              SINGLE PHASE 2 WIRE
            </Text>
            <Text style={[styles.specBoldText, { color: theme.text }]}>
              ENERGY METER TYPE F - 72P
            </Text>
            <Text style={[styles.specNormText, { color: theme.textMuted }]}>
              10/40A 240V 50 Hz 400 Rev/kWh
            </Text>
          </View>

          <View
            style={[
              styles.liveTag,
              {
                backgroundColor: isActive
                  ? "rgba(147, 51, 234, 0.15)"
                  : "rgba(107, 114, 128, 0.15)",
              },
            ]}
          >
            <View
              style={[
                styles.liveDot,
                { backgroundColor: isActive ? "#9333EA" : "#6B7280" },
              ]}
            />
            <Text
              style={[
                styles.liveTagText,
                { color: isActive ? "#9333EA" : "#6B7280" },
              ]}
            >
              {isActive ? "LIVE LINE 1" : "STANDBY"}
            </Text>
          </View>
        </View>

        {/* Horizontal Rotating Aluminum Disk Slot (◄ ═══════ ►) */}
        <View style={styles.diskSlotFrame}>
          <View style={styles.slotArrowRow}>
            <Text style={styles.slotArrow}>◄</Text>

            {/* Horizontal Disk Slit Window */}
            <View
              style={styles.horizontalSlotWindow}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0) {
                  setContainerWidth(w);
                }
              }}
            >
              {/* Metallic Aluminum Disk Surface */}
              <View style={styles.aluminumDiskBase} />
              
              {/* 1 Single Bold Red Calibration Strobe Bar sliding continuously */}
              <Animated.View style={[styles.singleRedStrobeBar, animatedDiskEdge]} />
            </View>

            <Text style={styles.slotArrow}>►</Text>
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
    borderColor: "rgba(147, 51, 234, 0.3)",
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
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  counterSection: {
    alignItems: "center",
    gap: 4,
    marginVertical: 2,
  },
  offsetBadge: {
    backgroundColor: "rgba(147, 51, 234, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  offsetText: {
    color: "#9333EA",
    fontFamily: "Share Tech Mono",
    fontSize: 11,
    fontWeight: "700",
  },
  tumblerHousing: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#09090B",
    padding: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#27272A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  rollerWheel: {
    width: 26,
    height: 36,
    backgroundColor: "#18181B",
    borderRadius: 4,
    marginHorizontal: 1.5,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3F3F46",
  },
  fractionRoller: {
    backgroundColor: "#7F1D1D",
    borderColor: "#EF4444",
  },
  rollerText: {
    color: "#FFFFFF",
    fontFamily: "Share Tech Mono",
    fontSize: 22,
    fontWeight: "700",
  },
  fractionText: {
    color: "#FCA5A5",
    fontFamily: "Share Tech Mono",
    fontSize: 22,
    fontWeight: "700",
  },
  multipliersRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
  },
  multiplierText: {
    fontFamily: "Share Tech Mono",
    fontSize: 7.5,
  },
  midLogoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sbLogoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#9333EA",
    backgroundColor: "rgba(147, 51, 234, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  sbLogoText: {
    color: "#9333EA",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "900",
  },
  specsColumn: {
    alignItems: "center",
    gap: 1,
  },
  specBoldText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  specNormText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8,
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
  diskSlotFrame: {
    alignItems: "center",
    gap: 4,
    marginVertical: 4,
  },
  slotArrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
    justifyContent: "center",
  },
  slotArrow: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  horizontalSlotWindow: {
    flex: 1,
    height: 16,
    backgroundColor: "#181C24",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#334155",
    overflow: "hidden",
    justifyContent: "center",
    position: "relative",
  },
  aluminumDiskBase: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#71717A",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#A1A1AA",
    opacity: 0.85,
  },
  singleRedStrobeBar: {
    position: "absolute",
    width: 24,
    height: "100%",
    backgroundColor: "#DC2626",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#FEF2F2",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  serialNumberText: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
  },
  serialBold: {
    fontFamily: "Share Tech Mono",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  mfgSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  mfgColumn: {
    gap: 1,
  },
  privateTag: {
    fontFamily: "Share Tech Mono",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  mfgLabel: {
    fontFamily: "Outfit",
    fontSize: 7.5,
    fontWeight: "600",
  },
  mfgName: {
    fontFamily: "Outfit",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  accuracyColumn: {
    alignItems: "flex-end",
  },
  accuracyText: {
    fontFamily: "Share Tech Mono",
    fontSize: 8,
    fontWeight: "700",
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
