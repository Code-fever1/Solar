import { GlassCard } from "@/components/GlassCard";
import type { IntelligenceState, IntelligenceSuggestion } from "@/context/energy-types";
import {
    AlertTriangle,
    Brain,
    CheckCircle2,
    CloudOff,
    Lightbulb,
    Sun,
    TrendingDown,
    Zap,
} from "lucide-react-native";
import { memo, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

import type { CardTheme } from "./NewDashboardCards";

// ── Status config ──
const STATUS_CONFIG: Record<
  string,
  { icon: typeof Brain; color: string }
> = {
  healthy: { icon: CheckCircle2, color: "#32E56B" },
  info: { icon: Lightbulb, color: "#548EFF" },
  warning: { icon: AlertTriangle, color: "#F8C653" },
  alert: { icon: CloudOff, color: "#EF4C4C" },
};

const SUGGESTION_ICONS: Record<IntelligenceSuggestion["type"], typeof Brain> = {
  grid: Zap,
  solar: Sun,
  consumption: TrendingDown,
  meter: Lightbulb,
  system: Brain,
};

type Props = {
  intelligence: IntelligenceState | null;
  isLight?: boolean;
  cardTheme: CardTheme;
};

/**
 * EnergyIntelligenceCard — single stable AI insight card.
 *
 * - NEVER returns null — always shows something
 * - Same layout always — no jumping between card types
 * - When healthy: "System Healthy" with green checkmark
 * - When suggestions exist: shows them as lines within the same card
 * - Meter scores always visible at bottom
 * - Subtle fade animation only when headline changes
 *
 * Layout:
 *   ┌───────────────────────────────────────────┐
 *   │ ✓ System Healthy              70% conf    │
 *   │                                           │
 *   │ Meter 2 scores higher (62 vs 81)...       │
 *   │ Consider switching.                       │
 *   │                                           │
 *   │ M1: 62  M2: 81  +19 pts   Consider M2    │
 *   └───────────────────────────────────────────┘
 */
export const EnergyIntelligenceCard = memo(function EnergyIntelligenceCard({
  intelligence,
  isLight = false,
  cardTheme,
}: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const lastHeadlineRef = useRef<string>("");

  // ── Cache last valid intelligence so we never show "Loading" after first data ──
  const lastValidRef = useRef<IntelligenceState | null>(null);
  const isLoadingRef = useRef(true);
  if (intelligence && intelligence.headline) {
    lastValidRef.current = intelligence;
    isLoadingRef.current = false;
  }

  // ── Build display content ──
  const display = useMemo(() => {
    // Use current intelligence, or fall back to last valid (never blank)
    const src = intelligence && intelligence.headline ? intelligence : lastValidRef.current;

    if (!src) {
      // Truly first load — no data ever received yet
      return {
        headline: "Loading Intelligence...",
        overallStatus: "info" as const,
        suggestions: [] as IntelligenceSuggestion[],
        confidencePct: 0,
        meterRec: null as IntelligenceState["meterRecommendation"],
        showMeterScores: false,
        isStale: false,
      };
    }

    const overallStatus = src.overallStatus || "healthy";
    const headline = src.headline || "System Healthy";
    const suggestions = src.suggestions || [];
    const confidencePct = Math.round((src.confidence || 0) * 100);
    const meterRec = src.meterRecommendation;
    // Only show meter scores when recommending a SWITCH to the other meter.
    // If already on the better meter, hide scores entirely — the corner badge
    // already shows which meter is active.
    const showMeterScores = !!meterRec && meterRec.recommendation !== meterRec.activeMeter;
    // If we're showing cached data (intelligence prop is null but we have last valid)
    const isStale = !intelligence || !intelligence.headline;

    return { headline, overallStatus, suggestions, confidencePct, meterRec, showMeterScores, isStale };
  }, [
    intelligence?.headline,
    intelligence?.overallStatus,
    intelligence?.confidence,
    intelligence?.suggestions,
    intelligence?.meterRecommendation,
  ]);

  // ── Fade animation on headline change ──
  useEffect(() => {
    const key = display.headline;
    if (lastHeadlineRef.current === key) return;
    lastHeadlineRef.current = key;
    opacity.value = 0;
    translateY.value = 6;
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [display.headline, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value as number,
    transform: [{ translateY: translateY.value as number }],
  }));

  const config = STATUS_CONFIG[display.overallStatus] || STATUS_CONFIG.healthy;
  const Icon = config.icon;
  const meterRec = display.meterRec;

  // Determine meter action label
  let meterActionLabel = "";
  if (meterRec) {
    const recName = meterRec.recommendation === "meter1" ? "M1" : "M2";
    if (meterRec.action?.startsWith("consider_switch")) {
      meterActionLabel = `Consider ${recName}`;
    } else if (meterRec.action?.startsWith("keep")) {
      meterActionLabel = `Keep ${recName}`;
    }
  }

  return (
    <GlassCard style={[styles.card, { borderColor: `${config.color}22` }]}>
      <Animated.View style={[styles.content, animStyle]}>
        {/* Header: icon + headline + confidence */}
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Icon size={14} color={config.color} />
            <Text
              style={[styles.headline, { color: cardTheme.textPrimary }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {display.headline}
            </Text>
          </View>
          <View style={[styles.confidencePill, { backgroundColor: `${config.color}15` }]}>
            <Text style={[styles.confidenceText, { color: config.color }]}>
              {display.isStale ? "updating..." : `${display.confidencePct}%`}
            </Text>
          </View>
        </View>

        {/* Suggestions — each as a line */}
        {display.suggestions.length > 0 ? (
          <View style={styles.suggestionsContainer}>
            {display.suggestions.slice(0, 3).map((s, idx) => {
              const SuggIcon = SUGGESTION_ICONS[s.type] || Lightbulb;
              const suggColor = s.severity === "high" ? "#EF4C4C"
                : s.severity === "medium" ? "#F8C653"
                : s.severity === "low" ? "#548EFF"
                : config.color;
              return (
                <View key={idx} style={styles.suggestionRow}>
                  <SuggIcon size={10} color={suggColor} />
                  <Text
                    style={[styles.suggestionText, { color: cardTheme.textSecondary }]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {s.text}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          // When no suggestions and healthy, show a simple "All systems normal" line
          display.overallStatus === "healthy" ? (
            <Text style={[styles.suggestionText, { color: cardTheme.textSecondary }]}>
              All systems operating normally.
            </Text>
          ) : null
        )}

        {/* Meter scores — always at bottom */}
        {display.showMeterScores && meterRec ? (
          <View style={styles.bottomRow}>
            <View style={styles.meterRow}>
              <View
                style={[
                  styles.meterChip,
                  {
                    backgroundColor:
                      meterRec.recommendation === "meter1" ? `${config.color}18` : cardTheme.trackBg,
                    borderColor:
                      meterRec.recommendation === "meter1" ? `${config.color}40` : "transparent",
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
                      meterRec.recommendation === "meter2" ? `${config.color}18` : cardTheme.trackBg,
                    borderColor:
                      meterRec.recommendation === "meter2" ? `${config.color}40` : "transparent",
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
            {meterActionLabel ? (
              <Text style={[styles.actionText, { color: config.color }]} numberOfLines={1}>
                {meterActionLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
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
    gap: 6,
    flex: 1,
  },
  headline: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: -0.2,
    flex: 1,
  },
  confidencePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  confidenceText: {
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "600",
  },
  suggestionsContainer: {
    gap: 3,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  suggestionText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "400",
    lineHeight: 13,
    flex: 1,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  meterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  actionText: {
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "600",
  },
});
