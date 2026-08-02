import { Colors } from "@/constants/Colors";
import type { HomeState, MeterId, MeterState } from "@/context/energy-types";
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { CircularProgress } from "./CircularProgress";
import { IntelligentRing } from "./IntelligentRing";
import { GlassPanel } from "./GlassPanel";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React from "react";

interface RemainingUnitsHeroProps {
  home: HomeState;
  m1State: MeterState;
  m2State: MeterState;
  activeMeter: MeterId;
}

const LIGHT_GREEN = "#7DDE6B";
const WARNING_YELLOW = "#FFD60A";
const DANGER_ORANGE = "#FF9F0A";
const NEUTRAL_TRACK = "#DDEEE4";

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getUsageSpeedConfig = (
  state: MeterState,
  theme: any
) => {
  // The reading/billing date is the 28th of the current month at 12 PM
  const now = new Date();
  const readingDate = new Date(now.getFullYear(), now.getMonth(), 28, 12, 0, 0);
  // If we're already past the 28th, target next month's 28th
  if (now.getTime() > readingDate.getTime()) {
    readingDate.setMonth(readingDate.getMonth() + 1);
  }
  const readingTs = readingDate.getTime();

  // How many days between the projected slab date and the reading date?
  // Positive = units last PAST the 28th (good), Negative = units run out BEFORE (bad)
  const diffDays = (state.projectedSlabDate - readingTs) / (1000 * 60 * 60 * 24);

  if (diffDays >= 5) {
    // Units will last 5+ days past the 28th — excellent
    return { color: theme.success, text: "EXCELLENT", Icon: ShieldCheck, diffDays };
  }
  if (diffDays >= 1) {
    // Units will last 1–5 days past the 28th — good
    return { color: theme.success, text: "GOOD", Icon: ShieldCheck, diffDays };
  }
  if (diffDays >= 0) {
    // Units will run out right exactly on the 28th
    return { color: theme.success, text: "NORMAL", Icon: ShieldCheck, diffDays };
  }
  if (diffDays >= -2) {
    // Units will run out slightly before the 28th — avg/regular
    return { color: theme.text, text: "AVG", Icon: ShieldCheck, diffDays };
  }
  if (diffDays >= -7) {
    // Units will run out 2–7 days before the 28th — fast
    return { color: theme.solar, text: "FAST", Icon: AlertTriangle, diffDays };
  }
  // Units will run out 7+ days before the 28th — critical
  return { color: theme.critical, text: "CRITICAL", Icon: ShieldAlert, diffDays };
};

const getConfidenceColor = (confidencePercent: number, theme: any) => {
  if (confidencePercent >= 90) return theme.success;
  if (confidencePercent >= 80) return theme.success;
  if (confidencePercent >= 65) return theme.solar;
  if (confidencePercent >= 50) return theme.critical;
  return theme.critical;
};

const MeterStatusRow = ({
  state,
  home,
  isActive,
}: {
  state: MeterState;
  home: HomeState;
  isActive: boolean;
}) => {
  const scheme = useColorScheme();
  const theme = scheme === 'light' ? Colors.light : Colors.dark;
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const monthlyUsage = state.cycleUsage ?? Math.max(0, state.targetUnits - state.remainingUnits);

  const expectedDate = new Date(state.projectedSlabDate);
  const dateString = expectedDate.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const startDateString = state.startsAfterDate
    ? new Date(state.startsAfterDate).toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <View style={[styles.meterRow, isActive && styles.activeMeterRow]}>
      <View style={styles.meterHeader}>
        <Text
          style={[styles.meterName, isActive && { color: theme.text }]}
        >
          {state.label}{" "}
          <Text
            style={[
              styles.queueBadge,
              {
                color:
                  state.queueStatus === "ACTIVE"
                    ? theme.info
                    : theme.textMuted,
              },
            ]}
          >
            ({state.queueStatus})
          </Text>
        </Text>
      </View>

      <View style={styles.progressContainer}>
        <IntelligentRing
          healthScore={state.healthScore ?? 80}
          remainingUnits={state.remainingUnits}
          targetUnits={state.targetUnits}
          size={120}
          healthColor={state.healthColor}
          remainingColor={state.remainingColor}
          centerMainText={(state.targetUnits - monthlyUsage).toFixed(0)}
          centerSubText="UNIT LEFT"
          showScoreBadge={false}
        />
        <View style={styles.progressLabels}>
          <View style={styles.metaRow}>
            <View style={[styles.metaColumn, { paddingRight: 60 }]}>
              <Text style={[styles.usedUnitsText, { color: state.remainingColor || theme.text }]}>
                {monthlyUsage.toFixed(0)} Units Used
              </Text>
              {startDateString ? (
                <Text style={styles.supportingText}>
                  Start On: {startDateString}
                </Text>
              ) : null}
              {monthlyUsage >= state.targetUnits ? (
                <Text style={[styles.supportingText, { color: theme.critical, fontFamily: 'Outfit-Medium' }]}>
                  OVERUSE DETECTED
                </Text>
              ) : (
                <Text style={styles.supportingText}>
                  Estimate Date: {dateString}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export const RemainingUnitsHero = ({
  home,
  m1State,
  m2State,
  activeMeter,
}: RemainingUnitsHeroProps) => {
  const scheme = useColorScheme();
  const theme = scheme === 'light' ? Colors.light : Colors.dark;
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const activeState = activeMeter === "meter1" ? m1State : m2State;
  
  const combinedDaysLeft = m1State.projectedDaysLeft + m2State.projectedDaysLeft;
  const combinedProjectedSlabDate = Date.now() + (combinedDaysLeft * 24 * 60 * 60 * 1000);
  // Keep getUsageSpeedConfig only for diffDays (used in days display)
  const combinedSpeed = getUsageSpeedConfig(
    { projectedSlabDate: combinedProjectedSlabDate } as MeterState,
    theme
  );

  // MONTHLY STATUS tag — driven by COMBINED health across both meters (400 total units)
  const combinedRemaining = m1State.remainingUnits + m2State.remainingUnits;
  const combinedTarget = 400;
  const combinedProjectedMonthly = m1State.projectedMonthly + m2State.projectedMonthly;
  const combinedCurrentDaily = m1State.currentDaily + m2State.currentDaily;
  const combinedTargetDaily = m1State.targetDaily + m2State.targetDaily;

  // Pace: how fast are you consuming vs what you should be
  const combinedPaceRatio = combinedTargetDaily > 0 ? combinedCurrentDaily / combinedTargetDaily : 0;
  let paceModifier = 0;
  if (combinedPaceRatio < 1.0) {
    paceModifier = (1.0 - combinedPaceRatio) * 20;
  } else {
    paceModifier = -(combinedPaceRatio - 1.0) * 45 * 1.5;
  }

  // Monthly projection vs 400 target
  const monthlyRatio = combinedProjectedMonthly / combinedTarget;
  let monthlyMod = 0;
  if (monthlyRatio < 1.0) {
    monthlyMod = (1.0 - monthlyRatio) * 20;
  } else {
    monthlyMod = -(monthlyRatio - 1.0) * 25 * 2.0;
  }

  // Remaining units buffer
  const remainingFraction = combinedRemaining / combinedTarget;
  const bufferMod = (remainingFraction - 0.5) * 20; // >50% left = bonus, <50% = penalty

  // Safety: combined days past expected date
  const safetyMod = combinedSpeed.diffDays >= 0
    ? Math.min(10, combinedSpeed.diffDays * 1.5)
    : Math.max(-25, combinedSpeed.diffDays * 4);

  const combinedHealth = Math.round(
    Math.min(100, Math.max(0, 50 + paceModifier + monthlyMod + bufferMod + safetyMod))
  );

  const getHealthTag = (score: number, t: any) => {
    if (score >= 75) return { color: t.success, text: "EXCELLENT", Icon: ShieldCheck };
    if (score >= 60) return { color: t.success, text: "GOOD", Icon: ShieldCheck };
    if (score >= 50) return { color: t.success, text: "NORMAL", Icon: ShieldCheck };
    if (score >= 35) return { color: t.text, text: "AVG", Icon: ShieldCheck };
    if (score >= 15) return { color: t.solar, text: "FAST", Icon: AlertTriangle };
    return { color: t.critical, text: "CRITICAL", Icon: ShieldAlert };
  };
  const healthTag = getHealthTag(combinedHealth, theme);

  const meterConfidence = activeState.predictionConfidence ?? home.confidencePercent;
  const confidenceColor = getConfidenceColor(meterConfidence, theme);
  const predConfidence = meterConfidence.toFixed(0) + "%";
  const SpeedIcon = healthTag.Icon;

  return (
    <Animated.View entering={FadeInUp.delay(100).springify()}>
      <GlassPanel style={styles.container}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Shield color={theme.textSecondary} size={18} />
            <Text style={styles.title}>MONTHLY STATUS</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: withAlpha(healthTag.color, 0.14),
                borderColor: withAlpha(healthTag.color, 0.34),
              },
            ]}
          >
            <SpeedIcon color={healthTag.color} size={14} />
            <Text style={[styles.statusText, { color: healthTag.color }]}>
              {healthTag.text}
            </Text>
            <View style={styles.badgeDivider} />
            <View
              style={[
                styles.confidenceCoin,
                {
                  backgroundColor: confidenceColor,
                  shadowColor: confidenceColor,
                },
              ]}
            />
            <Text
              style={[styles.confidenceBadgeText, { color: confidenceColor }]}
            >
              
               {predConfidence}
            </Text>
            
          </View>
          
        </View>

        <View style={[styles.list, { position: 'relative' }]}>
          <MeterStatusRow
            state={m2State}
            home={home}
            isActive={activeMeter === "meter2"}
          />
          <View style={styles.divider} />
          <MeterStatusRow
            state={m1State}
            home={home}
            isActive={activeMeter === "meter1"}
          />

          <View style={[styles.daysContainer, {
            position: 'absolute',
            right: 0,
            top: '50%',
            marginTop: 10,
            transform: [{ translateY: -24 }],
            paddingLeft: 16,
            borderLeftWidth: 1,
            borderLeftColor: theme.border,
            paddingVertical: 12,
            paddingRight: 8,
          }]}>
            <Text style={styles.daysValue}>
              {combinedSpeed.diffDays > 0 ? `+${Math.floor(combinedSpeed.diffDays)}` : combinedDaysLeft}
            </Text>
            <Text style={styles.daysLabel}>Days</Text>
          </View>
        </View>
      </GlassPanel>
    </Animated.View>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Outfit-Medium",
    fontSize: 14,
    letterSpacing: 1,
    color: theme.textSecondary,
  },
  list: {
    gap: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.borderStrong,
    marginRight: 80,
  },
  meterRow: {
    gap: 12,
    opacity: 0.6,
  },
  activeMeterRow: {
    opacity: 1,
  },
  meterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  meterName: {
    flex: 1,
    fontFamily: "Inter-Medium",
    fontSize: 16,
    color: theme.textSecondary,
  },
  queueBadge: {
    fontFamily: "Share Tech Mono",
    fontSize: 12,
    marginLeft: 6,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontFamily: "Share Tech Mono",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  badgeDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    marginHorizontal: 4,
  },
  confidenceCoin: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  confidenceBadgeText: {
    fontFamily: "Inter-Medium",
    fontSize: 10,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 4,
  },
  progressLabels: {
    flex: 1,
    justifyContent: "center",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaColumn: {
    flex: 1,
    gap: 4,
  },
  usageText: {
    fontFamily: "Share Tech Mono",
    fontSize: 11,
    opacity: 0.8,
    color: theme.textSecondary,
  },
  usedUnitsText: {
    fontFamily: "Outfit-Medium",
    fontSize: 13,
    marginBottom: 4,
  },
  supportingText: {
    fontFamily: "Inter-Medium",
    fontSize: 10,
    color: theme.textMuted,
  },
  daysContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 16,
    borderLeftWidth: 1,
    borderLeftColor: theme.border,
  },
  daysValue: {
    fontFamily: "Outfit-Light",
    fontSize: 32,
    lineHeight: 32,
    color: theme.text,
  },
  daysLabel: {
    fontFamily: "Inter-Medium",
    fontSize: 12,
    color: theme.textSecondary,
  },
});
