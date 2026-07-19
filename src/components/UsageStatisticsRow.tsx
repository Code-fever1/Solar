import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { Colors } from '@/constants/Colors';
import type { MeterState } from '@/context/energy-types';
import { Activity, Zap, TrendingUp, CalendarDays } from 'lucide-react-native';

interface UsageStatisticsRowProps {
  activeState: MeterState;
}

export const UsageStatisticsRow = ({ activeState }: UsageStatisticsRowProps) => {
  return (
    <Animated.View entering={FadeInUp.delay(200).springify()}>
      <View style={styles.grid}>
        {/* Today's Usage */}
        <GlassPanel style={styles.card}>
          <View style={styles.iconRow}>
            <Activity color={Colors.dark.info} size={18} />
          </View>
          <Text style={styles.value}>{activeState.todayUsage.toFixed(1)} <Text style={styles.unit}>units</Text></Text>
          <Text style={styles.label}>Today's Usage</Text>
        </GlassPanel>

        {/* Current Meter Speed */}
        <GlassPanel style={styles.card}>
          <View style={styles.iconRow}>
            <Zap color={Colors.dark.grid} size={18} />
          </View>
          <Text style={styles.value}>{activeState.expectedDrawNow.toFixed(1)} <Text style={styles.unit}>kW</Text></Text>
          <Text style={styles.label}>Current Speed</Text>
        </GlassPanel>

        {/* Average Daily */}
        <GlassPanel style={styles.card}>
          <View style={styles.iconRow}>
            <TrendingUp color={Colors.dark.meter} size={18} />
          </View>
          <Text style={styles.value}>{activeState.recentDailyAvg.toFixed(1)} <Text style={styles.unit}>/day</Text></Text>
          <Text style={styles.label}>Average Daily</Text>
        </GlassPanel>

        {/* Expected This Month */}
        <GlassPanel style={styles.card}>
          <View style={styles.iconRow}>
            <CalendarDays color={Colors.dark.solar} size={18} />
          </View>
          <Text style={styles.value}>{activeState.projectedMonthly.toFixed(0)} <Text style={styles.unit}>units</Text></Text>
          <Text style={styles.label}>Expected This Month</Text>
        </GlassPanel>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    gap: 8,
  },
  iconRow: {
    marginBottom: 4,
  },
  value: {
    fontFamily: 'Outfit-Bold',
    fontSize: 22,
    color: Colors.dark.text,
  },
  unit: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontFamily: 'Inter-Medium',
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    color: Colors.dark.textSecondary,
  }
});
