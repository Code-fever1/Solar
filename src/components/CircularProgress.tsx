import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Colors } from '@/constants/Colors';
import { getHealthColor, getRemainingUnitsColorSmooth, clamp } from '@/utils/ColorInterpolation';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type CircularProgressProps = {
  usage: number; // monthly units consumed so far
  target?: number;
  size?: number;
  strokeWidth?: number;
  progressColor?: string;
  outlineColor?: string;
  outerScore?: number;
  centerLabel?: string;
  valueColor?: string;
};

export function CircularProgress({
  usage,
  target = 200,
  size = 180,
  strokeWidth = 12,
  progressColor,
  outlineColor,
  outerScore,
  centerLabel = 'UNITS LEFT',
  valueColor,
}: CircularProgressProps) {
  const remaining = Math.max(0, target - usage);
  const percentage = clamp(remaining / (target > 0 ? target : 200), 0, 1);

  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  // Keep the thin pace ring inside the SVG canvas. A larger radius clips the
  // stroke at the top/left/right/bottom and makes the circle look broken.
  const outerRadius = radius + 1;
  // The primary remaining-units bar is inset so the pace outline owns the edge.
  const mainRadius = radius - 5;
  const circumference = 2 * Math.PI * mainRadius;
  const targetDashoffset = circumference * (1 - percentage);

  const animatedDashoffset = useSharedValue(targetDashoffset);

  useEffect(() => {
    animatedDashoffset.value = withTiming(targetDashoffset, {
      duration: 500,
      easing: Easing.inOut(Easing.quad),
    });
  }, [targetDashoffset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedDashoffset.value,
  }));

  const resolvedProgressColor = progressColor ?? getRemainingUnitsColorSmooth(remaining);
  const resolvedOutlineColor = outlineColor ?? (outerScore == null ? resolvedProgressColor : getHealthColor(outerScore));
  const resolvedValueColor = valueColor ?? resolvedProgressColor;

  // Scale fonts dynamically based on component size prop
  const scale = size / 180;
  const remainingFontSize = Math.round(34 * scale);
  const labelFontSize = Math.round(9 * scale);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Outer glow ring */}
        <Circle
          cx={center}
          cy={center}
          r={outerRadius}
          stroke={resolvedOutlineColor}
          strokeWidth={2.5}
          fill="transparent"
          opacity={0.7}
        />
        {/* Underlay track */}
        <Circle
          cx={center}
          cy={center}
          r={mainRadius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress indicator circle */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={mainRadius}
          stroke={resolvedProgressColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          fill="transparent"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {/* Center Text overlay */}
      <View style={styles.contentOverlay}>
        <Text style={[styles.remainingVal, { color: resolvedValueColor, fontSize: remainingFontSize }]}>
          {remaining.toFixed(0)}
        </Text>
        <Text style={[styles.label, { color: '#8A94A6', fontSize: labelFontSize }]}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  svg: {
    transform: [{ scaleX: 1 }],
  },
  contentOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  remainingVal: {
    color: Colors.dark.text,
    fontFamily: 'Share Tech Mono',
    fontWeight: '700',
  },
  label: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
