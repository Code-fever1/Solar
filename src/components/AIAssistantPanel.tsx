import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GlassPanel } from './GlassPanel';
import { Colors } from '@/constants/Colors';
import { Sparkles } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { MeterState } from '@/context/energy-types';

interface AIAssistantPanelProps {
  activeState: MeterState;
}

export const AIAssistantPanel = ({ activeState }: AIAssistantPanelProps) => {
  const isSafe = activeState.projectedMonthly <= 200;
  const riskColor = isSafe ? Colors.dark.success : Colors.dark.critical;

  return (
    <GlassPanel style={styles.container} intensity={25} glowColor="rgba(0, 229, 255, 0.2)">
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Sparkles color={Colors.dark.load} size={14} />
        </View>
        <Text style={styles.title}>Prediction Engine</Text>
      </View>
      
      <View style={styles.content}>
        <Animated.Text entering={FadeIn} exiting={FadeOut} style={styles.reasoningText}>
          {activeState.explanation || "Analyzing meter pattern..."}
        </Animated.Text>
        
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>CONFIDENCE</Text>
            <Text style={styles.metricValue}>{activeState.confidencePercent.toFixed(0)}%</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>ACTIVE MODEL</Text>
            <Text style={styles.metricValue}>Adaptive Ensemble</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>RISK LEVEL</Text>
            <Text style={[styles.metricValue, { color: riskColor }]}>{isSafe ? 'Low' : 'High'}</Text>
          </View>
        </View>
      </View>
    </GlassPanel>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  title: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    gap: 12,
  },
  reasoningText: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 13,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  metricLabel: {
    color: Colors.dark.textMuted,
    fontFamily: 'Outfit',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricValue: {
    color: Colors.dark.loadSoft,
    fontFamily: 'Share Tech Mono',
    fontSize: 16,
  }
});
