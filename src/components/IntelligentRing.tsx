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
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getHealthColor,
  getRemainingUnitsColorSmooth,
  getRingThickness,
  getRingGlowColor,
  clamp,
} from '@/utils/ColorInterpolation';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type IntelligentRingProps = {
  healthScore: number;       // 0 to 100
  remainingUnits: number;    // 0 to targetUnits
  targetUnits?: number;      // default 200
  size?: number;             // default 140
  healthColor?: string;
  remainingColor?: string;
  centerMainText?: string;
  centerSubText?: string;
  showScoreBadge?: boolean;
};

export const IntelligentRing: React.FC<IntelligentRingProps> = ({
  healthScore,
  remainingUnits,
  targetUnits = 200,
  size = 140,
  healthColor,
  remainingColor,
  centerMainText,
  centerSubText = 'UNIT LEFT',
  showScoreBadge = false,
}) => {
  const scheme = useColorScheme();
  const isLight = scheme === 'light';
  
  const resolvedHealthColor = healthColor ?? getHealthColor(healthScore);
  const resolvedRemainingColor = remainingColor ?? getRemainingUnitsColorSmooth(remainingUnits);
  const strokeWidth = 10;

  const center = size / 2;
  const radius = (size - strokeWidth - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  
  // Progress is based on remaining units (so arc length reflects units left)
  const unitsProgress = clamp(remainingUnits / (targetUnits > 0 ? targetUnits : 200), 0, 1);
  const targetDashoffset = circumference * (1 - unitsProgress);

  // Animated shared values for smooth transitions
  const animatedDashoffset = useSharedValue(targetDashoffset);
  const healthColorSV = useSharedValue(resolvedHealthColor);
  const remainingColorSV = useSharedValue(resolvedRemainingColor);

  useEffect(() => {
    const config = { duration: 600, easing: Easing.inOut(Easing.quad) };
    animatedDashoffset.value = withTiming(targetDashoffset, config);
    // Colors are strings — withTiming can't interpolate them; assign directly
    healthColorSV.value = resolvedHealthColor;
    remainingColorSV.value = resolvedRemainingColor;
  }, [targetDashoffset, resolvedHealthColor, resolvedRemainingColor]);

  // Inner progress bar arc reflects remaining units count and color
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedDashoffset.value,
    stroke: remainingColorSV.value as string,
  }));

  // Outer surrounding guide ring reflects consumption health / pace
  const outlineAnimatedProps = useAnimatedProps(() => ({
    stroke: healthColorSV.value as string,
  }));

  // Outline props for light mode visibility
  const innerOutlineProps = useAnimatedProps(() => ({
    strokeDashoffset: animatedDashoffset.value,
  }));

  const scale = size / 140;
  const mainFontSize = Math.round(32 * scale);
  const subFontSize = Math.round(9 * scale);

  // Function to darken a color slightly for text in light mode
  const getTextColor = (color: string) => {
    if (!isLight) return color;
    // In light mode, if the color is white or very light yellow, we use a dark fallback
    if (color === '#FFFFFF' || color === '#FFFBEA' || color === '#FEF3C7') {
      return '#0F172A'; // Dark slate
    }
    return color; // Otherwise the shadow helps
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Outer Ring Black Outline (Light Mode) */}
        {isLight && (
          <Circle
            cx={center}
            cy={center}
            r={radius + 6}
            strokeWidth={3.5}
            stroke="rgba(0,0,0,0.15)"
            fill="transparent"
          />
        )}
        {/* Slim outer ring colored by pace / health score */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius + 6}
          strokeWidth={2.5}
          fill="transparent"
          opacity={0.85}
          animatedProps={outlineAnimatedProps}
        />

        {/* Underlay track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={isLight ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)"}
          strokeWidth={strokeWidth}
          fill="transparent"
        />

        {/* Inner Progress Ring Black Outline (Light Mode) */}
        {isLight && (
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={strokeWidth + 2}
            stroke="rgba(0,0,0,0.15)"
            strokeDasharray={circumference}
            animatedProps={innerOutlineProps}
            strokeLinecap="round"
            fill="transparent"
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}

        {/* Inner progress ring colored by remaining units */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          fill="transparent"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      {/* Center Text Overlay (Number & UNIT LEFT only) colored by remaining units */}
      <View style={styles.contentOverlay}>
        <Text
          style={[
            styles.mainVal,
            { 
              color: getTextColor(resolvedRemainingColor), 
              fontSize: mainFontSize,
              textShadowColor: isLight ? 'rgba(0,0,0,0.15)' : 'transparent',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2
            },
          ]}
        >
          {centerMainText ?? remainingUnits.toFixed(0)}
        </Text>
        <Text style={[styles.subLabel, { fontSize: subFontSize, color: isLight ? Colors.light.textSecondary : Colors.dark.textSecondary }]}>
          {centerSubText}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  contentOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  mainVal: {
    fontFamily: 'Share Tech Mono',
    fontWeight: '700',
    lineHeight: 30,
  },
  subLabel: {
    fontFamily: 'Outfit',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeText: {
    fontFamily: 'Share Tech Mono',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
