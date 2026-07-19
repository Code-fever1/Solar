import React from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import Animated, { FadeInUp, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { Colors } from '@/constants/Colors';
import type { MeterState, MeterId } from '@/context/energy-types';
import { ShieldAlert, ShieldCheck, Shield, AlertTriangle } from 'lucide-react-native';

interface RemainingUnitsHeroProps {
  m1State: MeterState;
  m2State: MeterState;
  activeMeter: MeterId;
}

const getStatusConfig = (projectedMonthly: number, remainingUnits: number) => {
  if (remainingUnits <= 0) {
    return { color: Colors.dark.critical, text: 'CRITICAL', Icon: ShieldAlert };
  } else if (projectedMonthly > 200) {
    return { color: '#FF8C00', text: 'HIGH RISK', Icon: AlertTriangle };
  } else if (projectedMonthly > 180) {
    return { color: Colors.dark.warning, text: 'WATCH', Icon: ShieldAlert };
  } else {
    return { color: Colors.dark.success, text: 'SAFE', Icon: ShieldCheck };
  }
};

const MeterStatusRow = ({ state, isActive }: { state: MeterState; isActive: boolean }) => {
  const { width } = useWindowDimensions();
  const config = getStatusConfig(state.projectedMonthly, state.remainingUnits);
  
  // Progress calculation (0 to 1) for the 200 unit slab
  const progress = Math.min(1, Math.max(0, state.todayUsage / 200)); // Wait, todayUsage is daily. It should be monthly usage!
  const monthlyUsage = Math.max(0, state.targetUnits - state.remainingUnits);
  const fillPercentage = Math.min(100, Math.max(0, (monthlyUsage / state.targetUnits) * 100));

  const progressStyle = useAnimatedStyle(() => ({
    width: withTiming(`${fillPercentage}%`, { duration: 1000 })
  }));

  const daysLeft = state.recentDailyAvg > 0 ? Math.floor(state.remainingUnits / state.recentDailyAvg) : 30;
  const expectedDate = new Date();
  expectedDate.setDate(expectedDate.getDate() + daysLeft);
  const dateString = expectedDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

  const Icon = config.Icon;

  return (
    <View style={[styles.meterRow, isActive && styles.activeMeterRow]}>
      <View style={styles.meterHeader}>
        <Text style={[styles.meterName, isActive && { color: Colors.dark.text }]}>
          {state.label} {isActive && <Text style={styles.activeBadge}>(Active)</Text>}
        </Text>
        <View style={styles.statusBadge}>
          <Icon color={config.color} size={14} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.text}</Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBarFill, { backgroundColor: config.color }, progressStyle]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.usageText}>{monthlyUsage.toFixed(1)} used</Text>
          <Text style={styles.remainingText}>{state.remainingUnits.toFixed(1)} Units Left</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Average</Text>
          <Text style={styles.statValue}>{state.recentDailyAvg.toFixed(1)}<Text style={styles.statUnit}>/day</Text></Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Days Left</Text>
          <Text style={styles.statValue}>{daysLeft}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Expected Date</Text>
          <Text style={styles.statValueDate}>{dateString}</Text>
        </View>
      </View>
    </View>
  );
};

export const RemainingUnitsHero = ({ m1State, m2State, activeMeter }: RemainingUnitsHeroProps) => {
  return (
    <Animated.View entering={FadeInUp.delay(100).springify()}>
      <GlassPanel style={styles.container}>
        <View style={styles.header}>
          <Shield color={Colors.dark.textSecondary} size={18} />
          <Text style={styles.title}>MONTHLY WAPDA STATUS</Text>
        </View>
        
        <View style={styles.list}>
          <MeterStatusRow state={m1State} isActive={activeMeter === 'meter1'} />
          <View style={styles.divider} />
          <MeterStatusRow state={m2State} isActive={activeMeter === 'meter2'} />
        </View>
      </GlassPanel>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Outfit-Medium',
    fontSize: 14,
    letterSpacing: 1,
    color: Colors.dark.textSecondary,
  },
  list: {
    gap: 16,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.borderStrong,
  },
  meterRow: {
    gap: 12,
    opacity: 0.6,
  },
  activeMeterRow: {
    opacity: 1,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meterName: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  activeBadge: {
    fontSize: 12,
    color: Colors.dark.info,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.backgroundElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 12,
  },
  progressContainer: {
    gap: 6,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: Colors.dark.backgroundSelected,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageText: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  remainingText: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: Colors.dark.text,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.backgroundElevated,
    padding: 12,
    borderRadius: 12,
  },
  statBox: {
    gap: 4,
  },
  statLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 11,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
    color: Colors.dark.text,
  },
  statUnit: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  statValueDate: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: Colors.dark.text,
  }
});
