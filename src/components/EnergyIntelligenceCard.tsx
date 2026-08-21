import { GlassCard } from "@/components/GlassCard";
import type { IntelligenceState } from "@/context/EnergyContext";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CloudOff,
  Lightbulb,
  TrendingDown,
  Zap,
} from "lucide-react-native";
import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { CardTheme } from "./NewDashboardCards";

// ── Status icon + color mapping ──
const STATUS_CONFIG: Record<
  IntelligenceState["status"],
  { icon: typeof Brain; color: string; accent: string }
> = {
  NORMAL: { icon: CheckCircle2, color: "#32E56B", accent: "#32E56B" },
  METER_RECOMMENDATION: { icon: Lightbulb, color: "#F5C42E", accent: "#F5C42E" },
  SOLAR_ANOMALY: { icon: TrendingDown, color: "#F8C653", accent: "#F8C653" },
  HIGH_CONSUMPTION: { icon: Zap, color: "#FF6B6B", accent: "#FF6B6B" },
  LOW_CONSUMPTION: { icon: TrendingDown, color: "#548EFF", accent: "#548EFF" },
  WAPDA_STANDBY: { icon: CheckCircle2, color: "#32E56B", accent: "#32E56B" },
  WAPDA_IMPORTING: { icon: Zap, color: "#548EFF", accent: "#548EFF" },
  WAPDA_CUTOFF: { icon: CloudOff, color: "#EF4C4C", accent: "#EF4C4C" },
  WAPDA_RESTORED: { icon: CheckCircle2, color: "#32E56B", accent: "#32E56B" },
  WAPDA_UNSTABLE: { icon: AlertTriangle, color: "#F8C653", accent: "#F8C653" },
  INSUFFICIENT_DATA: { icon: Brain, color: "#94A5B8", accent: "#94A5B8" },
};

type Props = {
  intelligence: IntelligenceState | null;
  isLight?: boolean;
  cardTheme: CardTheme;
};

/**
 * EnergyIntelligenceCard — compact insight card showing the current
 * energy intelligence state from the backend deterministic engine.
 *
 * Displays:
 *   - Status icon + title
 *   - One-line message
 *   - Confidence percentage
 *   - Meter scores (when a recommendation is active)
 *
 * Animations:
 *   - Subtle fade/slide when insight status changes (300ms)
 *   - No continuous animation — respects adaptive FPS system
 */
export const EnergyIntelligenceCard = memo(function EnergyIntelligenceCard({
  intelligence,
  isLight = false,
  cardTheme,
}: Props) {
  // ── Fade/slide animation on status change ──
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    // Trigger animation whenever status or title changes
    opacity.value = 0;
    translateY.value = 8;
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [intelligence?.status, intelligence?.title, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value as number,
    transform: [{ translateY: translateY.value as number }],
  }));

  if (!intelligence) return null;

  const config = STATUS_CONFIG[intelligence.status] || STATUS_CONFIG.NORMAL;
  const Icon = config.icon;
  const confidencePct = Math.round((intelligence.confidence || 0) * 100);
  const meterRec = intelligence.meterRecommendation;
  const showMeterScores =
    intelligence.status === "METER_RECOMMENDATION" ||
    intelligence.status === "NORMAL" && meterRec;

  return (
    <GlassCard style={[styles.card, { borderColor: `${config.accent}22` }]}>
      <Animated.View style={[styles.content, animStyle]}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Icon size={14} color={config.color} />
            <Text style={[styles.headerLabel, { color: cardTheme.textSecondary }]}>
              ENERGY INTELLIGENCE
            </Text>
          </View>
          <View style={[styles.confidencePill, { backgroundColor: `${config.accent}15` }]}>
            <Text style={[styles.confidenceText, { color: config.color }]}>
              {confidencePct}% confidence
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text
          style={[styles.title, { color: cardTheme.textPrimary }]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {intelligence.title}
        </Text>

        {/* Message */}
        {intelligence.message && (
          <Text
            style={[styles.message, { color: cardTheme.textSecondary }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {intelligence.message}
          </Text>
        )}

        {/* Meter scores (compact, only when relevant) */}
        {showMeterScores && meterRec && (
          <View style={styles.meterRow}>
            <View
              style={[
                styles.meterChip,
                {
                  backgroundColor:
                    meterRec.recommendation === "meter1" ? `${config.accent}18` : cardTheme.trackBg,
                  borderColor:
                    meterRec.recommendation === "meter1" ? `${config.accent}40` : "transparent",
                },
              ]}
            >
              <Text style={[styles.meterChipLabel, { color: cardTheme.textMuted }]}>M1</Text>
              <Text
                style={[
                  styles.meterChipScore,
                  {
                    color:
                      meterRec.recommendation === "meter1" ? config.color : cardTheme.textPrimary,
                  },
                ]}
              >
                {meterRec.meter1Score}
              </Text>
            </View>
            <View
              style={[
                styles.meterChip,
                {
                  backgroundColor:
                    meterRec.recommendation === "meter2" ? `${config.accent}18` : cardTheme.trackBg,
                  borderColor:
                    meterRec.recommendation === "meter2" ? `${config.accent}40` : "transparent",
                },
              ]}
            >
              <Text style={[styles.meterChipLabel, { color: cardTheme.textMuted }]}>M2</Text>
              <Text
                style={[
                  styles.meterChipScore,
                  {
                    color:
                      meterRec.recommendation === "meter2" ? config.color : cardTheme.textPrimary,
                  },
                ]}
              >
                {meterRec.meter2Score}
              </Text>
            </View>
            {meterRec.advantage > 0 && (
              <Text style={[styles.advantageText, { color: cardTheme.textMuted }]}>
                +{meterRec.advantage} pts
              </Text>
            )}
          </View>
        )}
      </Animated.View>
    </GlassCard>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  content: {
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  headerLabel: {
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  confidenceText: {
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "600",
  },
  title: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  message: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "400",
    lineHeight: 14,
  },
  meterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  meterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  meterChipLabel: {
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "600",
  },
  meterChipScore: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
  },
  advantageText: {
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "500",
  },
});
