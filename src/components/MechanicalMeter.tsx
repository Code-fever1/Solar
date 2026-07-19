import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence, withSpring } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { Activity } from 'lucide-react-native';

interface MechanicalMeterProps {
  reading: number;
  expectedRateKwH?: number;
  isActive: boolean;
}

export const MechanicalMeter: React.FC<MechanicalMeterProps> = ({ reading, expectedRateKwH = 0, isActive }) => {
  const diskRotation = useSharedValue(0);
  const needleAngle = useSharedValue(0);

  useEffect(() => {
    // Disk rotates faster if rate is higher.
    const speed = isActive && expectedRateKwH > 0 ? Math.max(500, 3000 - (expectedRateKwH * 500)) : 10000;
    
    diskRotation.value = withRepeat(
      withTiming(360, { duration: speed, easing: Easing.linear }),
      -1,
      false
    );

    // Needle vibration
    if (isActive) {
      needleAngle.value = withRepeat(
        withSequence(
          withSpring(5, { damping: 2, stiffness: 200 }),
          withSpring(-5, { damping: 2, stiffness: 200 }),
          withSpring(0, { damping: 2, stiffness: 200 })
        ),
        -1,
        true
      );
    } else {
      needleAngle.value = withSpring(0);
    }
  }, [isActive, expectedRateKwH]);

  const animatedDisk = useAnimatedStyle(() => ({
    transform: [{ rotate: `${diskRotation.value}deg` }],
  }));

  const animatedNeedle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${needleAngle.value}deg` }],
  }));

  const digits = reading.toFixed(1).split('');

  return (
    <GlassPanel 
      style={[styles.container, !isActive && styles.inactive]} 
      intensity={isActive ? 30 : 10}
      glowColor={isActive ? Colors.dark.meterGlow : 'transparent'}
    >
      <View style={styles.header}>
        <Text style={styles.title}>ANALOG INDUCTION</Text>
        <View style={[styles.statusIndicator, { backgroundColor: isActive ? Colors.dark.meter : Colors.dark.textMuted }]} />
      </View>

      <View style={styles.mechanicalCore}>
        {/* The rotating disk */}
        <View style={styles.diskContainer}>
          <Animated.View style={[styles.disk, animatedDisk]}>
            <View style={styles.diskMark} />
            <View style={[styles.diskMark, { transform: [{ rotate: '90deg' }] }]} />
            <View style={[styles.diskMark, { transform: [{ rotate: '180deg' }] }]} />
            <View style={[styles.diskMark, { transform: [{ rotate: '270deg' }] }]} />
          </Animated.View>
          {/* Glass reflection over disk */}
          <View style={styles.diskGlass} />
        </View>

        {/* The rolling digits */}
        <View style={styles.digitsContainer}>
          {digits.map((char, idx) => {
            const isDecimal = char === '.';
            const isFraction = idx === digits.length - 1;
            return (
              <View key={idx} style={[styles.digitBox, isFraction && styles.fractionBox, isDecimal && styles.decimalBox]}>
                <Text style={[styles.digitText, isFraction && styles.fractionText, isDecimal && styles.decimalText]}>{char}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Meter 1 • WAPDA</Text>
        {isActive && expectedRateKwH > 0 && (
          <View style={styles.rateContainer}>
            <Activity color={Colors.dark.meter} size={12} />
            <Text style={styles.rateText}>+{expectedRateKwH.toFixed(2)} kW/h</Text>
          </View>
        )}
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
  statusIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowColor: Colors.dark.meter,
  },
  mechanicalCore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderTopColor: 'rgba(0,0,0,0.8)',
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  diskContainer: {
    width: 60,
    height: 20,
    backgroundColor: '#111',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 }, // inset simulation
  },
  disk: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#888',
    borderWidth: 2,
    borderColor: '#666',
    position: 'absolute',
    top: -40, // poke through
  },
  diskMark: {
    position: 'absolute',
    width: '100%',
    height: 4,
    backgroundColor: '#000',
    top: '50%',
    marginTop: -2,
  },
  diskGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  digitsContainer: {
    flexDirection: 'row',
    backgroundColor: '#000',
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#222',
  },
  digitBox: {
    width: 24,
    height: 36,
    backgroundColor: '#1A1A1A',
    marginHorizontal: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  fractionBox: {
    backgroundColor: '#401A1A', // red mechanical dial for fraction
  },
  decimalBox: {
    width: 10,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  digitText: {
    color: '#FFF',
    fontFamily: 'Share Tech Mono',
    fontSize: 22,
  },
  fractionText: {
    color: '#FF6B6B',
  },
  decimalText: {
    color: '#888',
    alignSelf: 'flex-end',
    marginBottom: 4,
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
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rateText: {
    color: Colors.dark.meter,
    fontFamily: 'Share Tech Mono',
    fontSize: 12,
  }
});
