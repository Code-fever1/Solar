import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors } from '@/constants/Colors';
import Animated, { FadeInUp } from 'react-native-reanimated';

export interface GlassPanelProps extends ViewProps {
  style?: ViewStyle | ViewStyle[];
  intensity?: number;
  glowColor?: string;
  delay?: number;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({ 
  children, 
  style, 
  intensity = 15, 
  glowColor = 'rgba(0,0,0,0.4)',
  delay = 0,
  ...rest 
}) => {
  return (
    <Animated.View 
      entering={FadeInUp.delay(delay).springify().damping(18).stiffness(150)}
      style={[
        styles.container, 
        { shadowColor: glowColor },
        style
      ]} 
      {...rest}
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? intensity : intensity * 2} 
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* Inner gradient border simulation */}
      <View style={styles.innerBorder} pointerEvents="none" />
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.dark.backgroundElement,
    
    // Outer shadow for ambient depth
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 8, // Android shadow
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderTopColor: Colors.dark.borderStrong, // Light coming from top
  }
});
