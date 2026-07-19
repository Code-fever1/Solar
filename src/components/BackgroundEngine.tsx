import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Canvas, Rect, LinearGradient, vec, SweepGradient, Blur, Circle, Paint } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

const { width, height } = Dimensions.get('window');

// Grid overlay component using standard React Native elements for the grid to keep Skia pure for blurs
const AnimatedGrid = () => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withTiming(40, { duration: 4000, easing: Easing.linear }),
      -1, // Infinite
      false // Do not reverse
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // Create grid lines
  const gridLines = [];
  for (let i = 0; i < height / 40 + 2; i++) {
    gridLines.push(<View key={`h-${i}`} style={[styles.gridLineHorizontal, { top: i * 40 - 40 }]} />);
  }
  for (let i = 0; i < width / 40; i++) {
    gridLines.push(<View key={`v-${i}`} style={[styles.gridLineVertical, { left: i * 40 }]} />);
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.gridContainer, animatedStyle]} pointerEvents="none">
      {gridLines}
    </Animated.View>
  );
};

export const BackgroundEngine = () => {
  // Rotate the glowing orbs slowly
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 25000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedCanvasStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotation.value}rad` }],
    };
  });

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Base Dark Background */}
      <View style={styles.baseDark} />

      {/* Skia Glowing Orbs */}
      <Animated.View style={[StyleSheet.absoluteFill, animatedCanvasStyle]}>
        <Canvas style={{ flex: 1, width: height * 1.5, height: height * 1.5, left: -(height * 1.5 - width) / 2, top: -(height * 0.5) }}>
          {/* Blue Glow */}
          <Circle cx={height * 0.75} cy={height * 0.3} r={width * 0.8}>
            <Paint>
              <Blur blur={80} />
              <SweepGradient
                c={vec(height * 0.75, height * 0.3)}
                colors={['rgba(0, 229, 255, 0)', 'rgba(0, 229, 255, 0.08)', 'rgba(0, 229, 255, 0)']}
              />
            </Paint>
          </Circle>
          
          {/* Purple Glow */}
          <Circle cx={height * 0.3} cy={height * 0.8} r={width * 0.7}>
            <Paint>
              <Blur blur={80} />
              <SweepGradient
                c={vec(height * 0.3, height * 0.8)}
                colors={['rgba(191, 90, 242, 0)', 'rgba(191, 90, 242, 0.06)', 'rgba(191, 90, 242, 0)']}
              />
            </Paint>
          </Circle>
        </Canvas>
      </Animated.View>

      {/* Grid Overlay */}
      <AnimatedGrid />
      
      {/* Vignette overlay to darken edges */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient
            start={vec(width / 2, 0)}
            end={vec(width / 2, height)}
            colors={['rgba(5, 5, 5, 0.2)', 'rgba(5, 5, 5, 0)', 'rgba(5, 5, 5, 0.9)']}
          />
        </Rect>
      </Canvas>
    </View>
  );
};

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
    opacity: 0.4,
  },
  gridLineHorizontal: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  gridLineVertical: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
});
