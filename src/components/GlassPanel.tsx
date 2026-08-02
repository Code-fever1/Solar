import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  intensity = 20, 
  glowColor,
  delay = 0,
  ...rest 
}) => {
  const scheme = useColorScheme();
  const isLight = scheme === 'light';
  const theme = isLight ? Colors.light : Colors.dark;

  const defaultGlow = glowColor ?? (isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(0,0,0,0.4)');

  return (
    <Animated.View 
      entering={FadeInUp.delay(delay).springify().damping(18).stiffness(150)}
      style={[
        styles.container, 
        { 
          backgroundColor: theme.backgroundElement,
          shadowColor: defaultGlow 
        },
        style
      ]} 
      {...rest}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity} 
          tint={isLight ? "light" : "dark"}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View 
          style={[
            StyleSheet.absoluteFill, 
            { backgroundColor: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(21, 26, 36, 0.97)' }
          ]} 
        />
      )}
      {/* Inner border simulation */}
      <View 
        style={[
          styles.innerBorder, 
          { 
            borderColor: theme.border,
            borderTopColor: theme.borderStrong 
          }
        ]} 
        pointerEvents="none" 
      />
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    
    // Outer shadow for ambient depth
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: Platform.OS === 'android' ? 4 : 6,
  },
  innerBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1,
  }
});
