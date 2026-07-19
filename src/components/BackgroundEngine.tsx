import React, { useEffect, memo } from 'react';
import { StyleSheet, View, Dimensions, Platform } from 'react-native';
import { Canvas, Rect, LinearGradient, vec, Circle, Paint, RadialGradient } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

const { width, height } = Dimensions.get('window');

// Compute grid lines once at module load — never in render
const GRID_SPACING = 60; // increased spacing → fewer lines → less UI thread work
const H_COUNT = Math.ceil(height / GRID_SPACING) + 2;
const V_COUNT = Math.ceil(width / GRID_SPACING) + 1;
const gridLineStyles: { top?: number; left?: number; isH: boolean }[] = [];
for (let i = 0; i < H_COUNT; i++) {
  gridLineStyles.push({ top: i * GRID_SPACING - GRID_SPACING, isH: true });
}
for (let i = 0; i < V_COUNT; i++) {
  gridLineStyles.push({ left: i * GRID_SPACING, isH: false });
}

// Memoized grid so it never re-renders except when translateY changes (Reanimated bypasses JS)
const AnimatedGrid = memo(() => {
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

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.gridContainer, animatedStyle]} pointerEvents="none">
      {gridLineStyles.map((s, i) =>
        s.isH ? (
          <View key={`h-${i}`} style={[styles.gridLineHorizontal, { top: s.top }]} />
        ) : (
          <View key={`v-${i}`} style={[styles.gridLineVertical, { left: s.left }]} />
        )
      )}
    </Animated.View>
  );
});

// Static Skia canvas for orbs — no rotation animation, no heavy blur.
// Uses RadialGradient which is GPU-native and cheap.
const StaticOrbs = memo(() => {
  if (Platform.OS === 'web') {
    // Fallback for Web: Skia requires WASM CanvasKit setup which is missing/unsupported here.
    return (
      <View style={StyleSheet.absoluteFill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
      </View>
    );
  }

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Blue orb — top right */}
      <Circle cx={width * 0.75} cy={height * 0.25} r={width * 0.55}>
        <Paint>
          <RadialGradient
            c={vec(width * 0.75, height * 0.25)}
            r={width * 0.55}
            colors={['rgba(0,229,255,0.10)', 'rgba(0,229,255,0)']}
          />
        </Paint>
      </Circle>

      {/* Purple orb — bottom left */}
      <Circle cx={width * 0.2} cy={height * 0.72} r={width * 0.5}>
        <Paint>
          <RadialGradient
            c={vec(width * 0.2, height * 0.72)}
            r={width * 0.5}
            colors={['rgba(191,90,242,0.08)', 'rgba(191,90,242,0)']}
          />
        </Paint>
      </Circle>

      {/* Vignette — darken top and bottom edges */}
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(width / 2, 0)}
          end={vec(width / 2, height)}
          colors={['rgba(5,5,5,0.25)', 'rgba(5,5,5,0)', 'rgba(5,5,5,0.92)']}
        />
      </Rect>
    </Canvas>
  );
});

export const BackgroundEngine = memo(() => {
  return (
    <View style={styles.container} pointerEvents="none">
      {/* Base dark fill */}
      <View style={styles.baseDark} />
      {/* GPU-rendered static gradient orbs */}
      <StaticOrbs />
      {/* Scrolling grid overlay */}
      <AnimatedGrid />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.background,
    zIndex: -1,
  },
  baseDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.dark.background,
  },
  gridContainer: {
    opacity: 0.35,
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  gridLineVertical: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
});
