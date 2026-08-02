import React, { useEffect, memo } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Canvas, Rect, LinearGradient, vec, Circle, Paint, RadialGradient } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

const { width, height } = Dimensions.get('window');

const GRID_SPACING = 60;
const H_COUNT = Math.ceil(height / GRID_SPACING) + 2;
const V_COUNT = Math.ceil(width / GRID_SPACING) + 1;
const gridLineStyles: { top?: number; left?: number; isH: boolean }[] = [];
for (let i = 0; i < H_COUNT; i++) {
  gridLineStyles.push({ top: i * GRID_SPACING - GRID_SPACING, isH: true });
}
for (let i = 0; i < V_COUNT; i++) {
  gridLineStyles.push({ left: i * GRID_SPACING, isH: false });
}

const AnimatedGrid = memo(({ isLight }: { isLight: boolean }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(GRID_SPACING, { duration: 5000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const lineStyle = isLight ? styles.gridLineLight : styles.gridLineDark;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.gridContainer, { opacity: isLight ? 0.25 : 0.35 }, animatedStyle]} pointerEvents="none">
      {gridLineStyles.map((s, i) =>
        s.isH ? (
          <View key={`h-${i}`} style={[lineStyle, styles.gridLineHorizontal, { top: s.top }]} />
        ) : (
          <View key={`v-${i}`} style={[lineStyle, styles.gridLineVertical, { left: s.left }]} />
        )
      )}
    </Animated.View>
  );
});

const StaticOrbs = memo(({ isLight }: { isLight: boolean }) => {
  if (Platform.OS === 'web') {
    return (
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isLight ? 'rgba(241,245,249,0.8)' : 'rgba(5,5,5,0.5)' }]} />
      </View>
    );
  }

  const orb1Color = isLight ? 'rgba(2, 132, 199, 0.12)' : 'rgba(0,229,255,0.10)';
  const orb2Color = isLight ? 'rgba(147, 51, 234, 0.10)' : 'rgba(191,90,242,0.08)';
  const vignetteStart = isLight ? 'rgba(241,245,249,0.1)' : 'rgba(5,5,5,0.25)';
  const vignetteEnd = isLight ? 'rgba(241,245,249,0.6)' : 'rgba(5,5,5,0.92)';

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={width * 0.75} cy={height * 0.25} r={width * 0.55}>
        <Paint>
          <RadialGradient
            c={vec(width * 0.75, height * 0.25)}
            r={width * 0.55}
            colors={[orb1Color, 'rgba(0,0,0,0)']}
          />
        </Paint>
      </Circle>

      <Circle cx={width * 0.2} cy={height * 0.72} r={width * 0.5}>
        <Paint>
          <RadialGradient
            c={vec(width * 0.2, height * 0.72)}
            r={width * 0.5}
            colors={[orb2Color, 'rgba(0,0,0,0)']}
          />
        </Paint>
      </Circle>

      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(width / 2, 0)}
          end={vec(width / 2, height)}
          colors={[vignetteStart, 'rgba(0,0,0,0)', vignetteEnd]}
        />
      </Rect>
    </Canvas>
  );
});

export const BackgroundEngine = memo(() => {
  const scheme = useColorScheme();
  const isLight = scheme === 'light';
  const theme = isLight ? Colors.light : Colors.dark;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} pointerEvents="none">
      <View style={[styles.baseDark, { backgroundColor: theme.background }]} />
      <StaticOrbs isLight={isLight} />
      <AnimatedGrid isLight={isLight} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: -1,
  },
  baseDark: {
    ...StyleSheet.absoluteFill,
  },
  gridContainer: {
    opacity: 0.35,
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
  },
  gridLineVertical: {
    position: 'absolute',
    height: '100%',
    width: 1,
  },
  gridLineDark: {
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  gridLineLight: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
});
