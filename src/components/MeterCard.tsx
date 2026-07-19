import { Calendar, ShieldAlert, ShieldCheck } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import type { MeterState } from "@/context/EnergyContext";
import { GlassCard } from "./GlassCard";

type MeterCardProps = {
  meter: MeterState;
  isActive?: boolean;
};

export function MeterCard({ meter, isActive = false }: MeterCardProps) {
  const isAnalog = meter.id === "meter1";

  // Animation values for mechanical disk rotation and digital LED pulse
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.2)).current;

  // 1. Analog Spinning Disk Animation loop
  useEffect(() => {
    if (!isActive || !isAnalog) {
      spinAnim.setValue(0);
      return;
    }

    const rateKw = meter.averageDaily / 24 || 0.25;
    const spinDuration = Math.max(600, Math.min(6000, 6000 / (rateKw * 2)));

    spinAnim.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: spinDuration,
          useNativeDriver: true,
        }),
        Animated.timing(spinAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [isActive, isAnalog, meter.averageDaily, spinAnim]);

  // 2. Digital Calibration LED pulse loop
  useEffect(() => {
    if (!isActive || isAnalog) {
      pulseAnim.setValue(0.2);
      return;
    }

    // 2400 imp/kWh calculation:
    // If averageDaily rate is P kW, pulse interval is:
    // T = 3600000 / (P * 2400) milliseconds per pulse
    const rateKw = meter.averageDaily / 24 || 0.25;
    const pulseInterval = Math.max(
      150,
      Math.min(4000, 3600000 / (rateKw * 2400)),
    );

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 80, // Flash duration
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.1,
          duration: Math.max(70, pulseInterval - 80),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [isActive, isAnalog, meter.averageDaily, pulseAnim]);

  const formatLastLogged = (ts?: number) => {
    if (!ts) return "Never logged";
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just logged";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // Convert reading to digits array for analog wheels display (5 integers, 1 decimal)
  const getAnalogDigits = (val: number): string[] => {
    const intPart = Math.floor(val);
    const decPart = Math.floor((val - intPart) * 10) % 10;
    const paddedInt = intPart.toString().padStart(5, "0");
    return [...paddedInt.split(""), decPart.toString()];
  };

  // Convert reading to exact digital string (6 integers, 2 decimals)
  const getDigitalString = (val: number): string => {
    const intPart = Math.floor(val);
    const decPart = Math.floor((val - intPart) * 100) % 100;
    const paddedInt = intPart.toString().padStart(6, "0");
    const paddedDec = decPart.toString().padStart(2, "0");
    return `${paddedInt}.${paddedDec}`;
  };

  // Interpolate index mark position for spinning disk animation
  const translateX = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-160, 160], // Slides fully out of the window to simulate rotation
  });

  const consumed = meter.targetUnits - meter.remainingUnits;

  return (
    <GlassCard
      style={[styles.card, isActive ? styles.activeCard : styles.standbyCard]}
    >
      {/* Casing Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.statusDot,
              isActive ? styles.dotActive : styles.dotInactive,
            ]}
          />
          <Text style={styles.title}>{meter.label}</Text>
        </View>
        <Text style={[styles.meta, isActive && styles.metaActive]}>
          {isActive ? "ACTIVE SUPPLY" : "STANDBY"}
        </Text>
      </View>

      {/* Hardware Display Area */}
      {isAnalog ? (
        /* ANALOG ELECTRO-MECHANICAL METER VIEW */
        <View style={styles.hardwareDisplayAnalog}>
          {/* Digits drums roller box */}
          <View style={styles.analogDrumsBox}>
            {getAnalogDigits(meter.reading).map((digit, idx) => {
              const isDecimal = idx === 5;
              return (
                <View
                  key={`drum-${idx}`}
                  style={[styles.drum, isDecimal && styles.drumDecimal]}
                >
                  <Text
                    style={[
                      styles.drumText,
                      isDecimal && styles.drumTextDecimal,
                    ]}
                  >
                    {digit}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.analogUnit}>kWh</Text>
          </View>

          {/* Rotating Induction Aluminum Disk */}
          <View style={styles.diskArea}>
            <View style={styles.diskWindow}>
              <View style={styles.diskDisk}>
                <Animated.View
                  style={[styles.diskMark, { transform: [{ translateX }] }]}
                />
              </View>
            </View>
            <Text style={styles.diskLabel}>
              1200 r/kWh • induction disk rotating
            </Text>
          </View>
        </View>
      ) : (
        /* DIGITAL MONOSPACE LCD VIEW */
        <View style={styles.hardwareDisplayDigital}>
          <View style={styles.lcdScreen}>
            <View style={styles.lcdMain}>
              <Text style={styles.lcdValue}>
                {getDigitalString(meter.reading)}
              </Text>
              <Text style={styles.lcdUnit}>kWh</Text>
            </View>

            {/* Flashing imp calibration light — below reading */}
            <View style={styles.impLedRow}>
              <Animated.View style={[styles.impLed, { opacity: pulseAnim }]} />
              <Text style={styles.impLedText}>2400 imp/kWh</Text>
            </View>

            <View style={styles.lcdFooter}>
              <Text style={styles.lcdIndicator}>[CLASS 1.0]</Text>
              <Text style={styles.lcdIndicator}>⚡ ACTIVE MODE</Text>
            </View>
          </View>
        </View>
      )}

      {/* Grid Usage Statistics */}
      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Today's Draw</Text>
          <Text style={styles.statValue}>
            {meter.todayUsage.toFixed(2)}{" "}
            <Text style={styles.unitText}>kWh</Text>
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Avg/Day (48h)</Text>
          <Text style={styles.statValue}>
            {meter.recentDailyAvg.toFixed(2)}{" "}
            <Text style={styles.unitText}>kWh</Text>
          </Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statLabel}>Slab Projected</Text>
          <Text style={styles.statValue}>
            {consumed.toFixed(2)} <Text style={styles.unitText}>/ 200</Text>
          </Text>
        </View>
      </View>

      {/* Expected Draw Now — time-slot learned pattern */}
      {(() => {
        const hr = new Date().getHours();
        const isSolar = hr >= 7 && hr < 18;
        const hasData = meter.expectedDrawNow > 0;
        return (
          <View style={[styles.expectedNowRow, isSolar && styles.expectedNowSolar]}>
            <Text style={styles.expectedNowIcon}>{isSolar ? '☀️' : '⚡'}</Text>
            <Text style={styles.expectedNowLabel}>
              {isSolar ? 'Solar Hours' : 'Grid Hours'} · Expected Now:
            </Text>
            <Text style={styles.expectedNowValue}>
              {!isActive ? '0.000 kWh/h (Standby)' : hasData ? `${meter.expectedDrawNow.toFixed(3)} kWh/h` : 'Learning…'}
            </Text>
          </View>
        );
      })()}

      {/* AI Ensemble Prediction Insights */}
      {meter.explanation && (
        <View style={styles.aiPredictionBlock}>
          <View style={styles.aiHeaderRow}>
            <Text style={styles.aiTitle}>Ensemble AI Insight</Text>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>{meter.confidencePercent}% Confidence</Text>
            </View>
          </View>
          
          <Text style={styles.aiExplanation}>{meter.explanation}</Text>
          
          <View style={styles.aiMetricsRow}>
            <View style={styles.aiMetric}>
              <Text style={styles.aiMetricLabel}>Min Range</Text>
              <Text style={styles.aiMetricValue}>{meter.minLikelyReading.toFixed(1)}</Text>
            </View>
            <View style={styles.aiMetric}>
              <Text style={styles.aiMetricLabel}>Trend</Text>
              <Text style={styles.aiMetricValue}>
                {meter.trend === 'increasing' ? '↗ Increasing' : meter.trend === 'decreasing' ? '↘ Decreasing' : '→ Stable'}
              </Text>
            </View>
            <View style={styles.aiMetric}>
              <Text style={styles.aiMetricLabel}>Max Range</Text>
              <Text style={styles.aiMetricValue}>{meter.maxLikelyReading.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Card Footer Status */}
      <View style={styles.footer}>
        <View style={styles.badge}>
          <Calendar color={Colors.dark.textSecondary} size={11} />
          <Text style={styles.badgeText}>
            {formatLastLogged(meter.lastLoggedAt)}
          </Text>
        </View>

        <View
          style={[
            styles.badge,
            consumed >= 200 && styles.badgeDanger,
            consumed >= 170 && consumed < 200 && styles.badgeWarning,
          ]}
        >
          {consumed >= 170 ? (
            <ShieldAlert
              color={consumed >= 170 ? "#000" : Colors.dark.critical}
              size={11}
            />
          ) : (
            <ShieldCheck color={Colors.dark.success} size={11} />
          )}
          <Text
            style={[
              styles.badgeText,
              consumed >= 200 && styles.badgeDangerText,
              consumed >= 170 && consumed < 200 && styles.badgeWarningText,
              consumed < 170 && { color: Colors.dark.success },
            ]}
          >
            {consumed >= 200
              ? "Slab Over"
              : consumed >= 170
                ? "Slab Warn"
                : "Slab Safe"}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 12,
    backgroundColor: "rgba(21, 24, 33, 0.6)",
  },
  activeCard: {
    borderColor: "rgba(82, 196, 26, 0.4)",
    backgroundColor: "rgba(20, 30, 20, 0.5)",
    borderWidth: 1.5,
    shadowColor: "#52C41A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  standbyCard: {
    opacity: 0.5,
    borderColor: "rgba(255,255,255,0.04)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: "#52C41A",
  },
  dotInactive: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 13.5,
  },
  meta: {
    color: Colors.dark.textSecondary,
    fontFamily: "Share Tech Mono",
    fontSize: 10,
    fontWeight: "700",
  },
  metaActive: {
    color: "#52C41A",
  },
  hardwareDisplayAnalog: {
    backgroundColor: "#20242E",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#303645",
    padding: 12,
    alignItems: "center",
    gap: 10,
  },
  analogDrumsBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1116",
    borderRadius: 4,
    padding: 4,
    gap: 2.5,
  },
  drum: {
    width: 22,
    height: 32,
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "#CCC",
  },
  drumDecimal: {
    backgroundColor: "#E02020",
    borderColor: "#A01010",
  },
  drumText: {
    color: "#000",
    fontFamily: "Share Tech Mono",
    fontSize: 20,
    fontWeight: "800",
  },
  drumTextDecimal: {
    color: "#FFF",
  },
  analogUnit: {
    color: "#FFF",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
    paddingRight: 2,
  },
  diskArea: {
    alignItems: "center",
    gap: 4,
    width: "100%",
  },
  diskWindow: {
    width: "75%",
    height: 12,
    backgroundColor: "#101217",
    borderWidth: 1,
    borderColor: "#3E465A",
    overflow: "hidden",
    justifyContent: "center",
  },
  diskDisk: {
    width: "100%",
    height: 4,
    backgroundColor: "#7A8499",
    position: "relative",
    justifyContent: "center",
  },
  diskMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF2A2A",
    position: "absolute",
    alignSelf: "center",
  },
  diskLabel: {
    color: "rgba(255,255,255,0.25)",
    fontFamily: "Outfit",
    fontSize: 8.5,
    fontWeight: "600",
  },
  hardwareDisplayDigital: {
    backgroundColor: "#12141A",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#262A36",
    padding: 1,
  },
  lcdScreen: {
    backgroundColor: "rgba(82, 196, 26, 0.05)",
    borderRadius: 7,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(82, 196, 26, 0.12)",
  },
  impLedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
  },
  impLed: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  impLedText: {
    color: '#52C41A',
    fontFamily: 'Share Tech Mono',
    fontSize: 9,
    fontWeight: '700',
  },
  lcdMain: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  lcdValue: {
    color: "#52C41A",
    fontFamily: "Share Tech Mono",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  lcdUnit: {
    color: "#52C41A",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 4,
  },
  lcdFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(82, 196, 26, 0.15)",
    paddingTop: 4,
  },
  lcdIndicator: {
    color: "#52C41A",
    fontFamily: "Share Tech Mono",
    fontSize: 8,
    opacity: 0.7,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  statBlock: {
    flex: 1,
    gap: 1,
  },
  statLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 10.5,
  },
  statValue: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 15,
    fontWeight: "700",
  },
  unitText: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
  },
  expectedNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  expectedNowSolar: {
    backgroundColor: 'rgba(255, 200, 30, 0.06)',
    borderColor: 'rgba(255, 200, 30, 0.15)',
  },
  expectedNowIcon: {
    fontSize: 11,
  },
  expectedNowLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 10.5,
    fontWeight: '600',
    flex: 1,
  },
  expectedNowValue: {
    color: Colors.dark.text,
    fontFamily: 'Share Tech Mono',
    fontSize: 11.5,
    fontWeight: '700',
  },
  aiPredictionBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  aiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  aiTitle: {
    fontFamily: 'Outfit',
    fontSize: 11,
    fontWeight: '700',
    color: Colors.dark.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confidenceBadge: {
    backgroundColor: 'rgba(0, 200, 100, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    fontFamily: 'Share Tech Mono',
    fontSize: 10,
    color: '#00C864',
    fontWeight: '700',
  },
  aiExplanation: {
    fontFamily: 'Outfit',
    fontSize: 11,
    color: Colors.dark.textSecondary,
    lineHeight: 15,
    marginBottom: 8,
  },
  aiMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 8,
  },
  aiMetric: {
    alignItems: 'center',
    flex: 1,
  },
  aiMetricLabel: {
    fontFamily: 'Outfit',
    fontSize: 9,
    color: Colors.dark.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  aiMetricValue: {
    fontFamily: 'Share Tech Mono',
    fontSize: 12,
    color: Colors.dark.text,
    fontWeight: '700',
  },
  footer: {
    flexDirection: "row",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  badgeWarning: {
    backgroundColor: Colors.dark.warning,
  },
  badgeWarningText: {
    color: "#000",
    fontWeight: "700",
  },
  badgeDanger: {
    backgroundColor: Colors.dark.critical,
  },
  badgeDangerText: {
    color: "#fff",
    fontWeight: "700",
  },
  badgeText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 10.5,
  },
});
