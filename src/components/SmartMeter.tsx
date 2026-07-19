import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withDelay } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { Radio } from 'lucide-react-native';

interface SmartMeterProps {
  reading: number;
  expectedRateKwH?: number;
  isActive: boolean;
}

export const SmartMeter: React.FC<SmartMeterProps> = ({ reading, expectedRateKwH = 0, isActive }) => {
  const ledOpacity = useSharedValue(0.2);

  useEffect(() => {
    // Pulse the IMP/kWh LED based on expected rate
    if (isActive && expectedRateKwH > 0) {
      const pulseSpeed = Math.max(200, 1500 - (expectedRateKwH * 200));
      ledOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 50, easing: Easing.linear }),
          withTiming(0.2, { duration: pulseSpeed, easing: Easing.out(Easing.quad) })
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

  return (
    <GlassPanel 
      style={[styles.container, !isActive && styles.inactive]} 
      intensity={isActive ? 30 : 10}
      glowColor={isActive ? Colors.dark.meterGlow : 'transparent'}
    >
      <View style={styles.header}>
        <Text style={styles.title}>SMART DIGITAL</Text>
        <Radio color={isActive ? Colors.dark.meter : Colors.dark.textMuted} size={14} />
      </View>

      <View style={styles.digitalCore}>
        <View style={styles.lcdScreen}>
          {/* LCD background noise / reflection overlay */}
          <View style={styles.lcdReflection} />
          
          <View style={styles.lcdTopRow}>
            <Text style={styles.lcdLabel}>TOTAL IMPORT</Text>
            <Text style={styles.lcdLabel}>T1</Text>
          </View>
          
          <View style={styles.lcdMainRow}>
            <Text style={styles.lcdDigits}>{reading.toFixed(1).padStart(7, '0')}</Text>
            <Text style={styles.lcdUnit}>kWh</Text>
          </View>
        </View>

        <View style={styles.ledStrip}>
          <View style={styles.ledGroup}>
            <Animated.View style={[styles.led, animatedLed, { backgroundColor: Colors.dark.solar }]} />
            <Text style={styles.ledLabel}>3200 imp/kWh</Text>
          </View>
          <View style={styles.ledGroup}>
            <View style={[styles.led, { backgroundColor: isActive ? Colors.dark.success : Colors.dark.textMuted }]} />
            <Text style={styles.ledLabel}>POWER</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Meter 2 • WAPDA</Text>
        <Text style={styles.idText}>S/N: 04519223</Text>
      </View>
    </GlassPanel>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  inactive: {
    opacity: 0.6,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Share Tech Mono',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  digitalCore: {
    gap: 12,
  },
  lcdScreen: {
    backgroundColor: '#9FB89A', // Classic LCD green/grey
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#222',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, // inset simulation doesn't work perfectly in RN, using background helps
    shadowOpacity: 0.5,
    shadowRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  lcdReflection: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    transform: [{ skewX: '-20deg' }, { translateX: -50 }],
    width: '150%',
  },
  lcdTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  lcdLabel: {
    color: 'rgba(0,0,0,0.6)',
    fontFamily: 'Share Tech Mono',
    fontSize: 10,
  },
  lcdMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 8,
  },
  lcdDigits: {
    color: 'rgba(0,0,0,0.85)',
    fontFamily: 'Share Tech Mono',
    fontSize: 32,
    letterSpacing: 2,
  },
  lcdUnit: {
    color: 'rgba(0,0,0,0.85)',
    fontFamily: 'Share Tech Mono',
    fontSize: 12,
  },
  ledStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
  ledGroup: {
    alignItems: 'center',
    gap: 4,
  },
  led: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.dark.textMuted,
    shadowColor: '#FFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  ledLabel: {
    color: Colors.dark.textMuted,
    fontFamily: 'Share Tech Mono',
    fontSize: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    color: Colors.dark.textMuted,
    fontFamily: 'Outfit',
    fontSize: 10,
    fontWeight: '600',
  },
  idText: {
    color: Colors.dark.textMuted,
    fontFamily: 'Share Tech Mono',
    fontSize: 10,
  }
});
