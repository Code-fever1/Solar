import React from 'react';
import { StyleSheet, Text, Pressable, PressableProps, ViewStyle, TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';

export interface GlowButtonProps extends PressableProps {
  label: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  glowColor?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const GlowButton: React.FC<GlowButtonProps> = ({ 
  label, 
  style, 
  textStyle,
  glowColor,
  variant = 'primary',
  onPressIn,
  onPressOut,
  ...rest 
}) => {
  const scale = useSharedValue(1);

  const getVariantStyles = () => {
    switch(variant) {
      case 'danger': return { bg: 'rgba(255, 59, 48, 0.15)', border: Colors.dark.grid, text: Colors.dark.grid, shadow: Colors.dark.gridGlow };
      case 'secondary': return { bg: 'rgba(255, 255, 255, 0.05)', border: Colors.dark.borderStrong, text: Colors.dark.textSecondary, shadow: 'transparent' };
      case 'primary':
      default: return { bg: 'rgba(0, 229, 255, 0.15)', border: Colors.dark.load, text: Colors.dark.load, shadow: Colors.dark.loadGlow };
    }
  };

  const vStyles = getVariantStyles();
  const shadowColor = glowColor || vStyles.shadow;

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = (e: any) => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
    if (onPressOut) onPressOut(e);
  };

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.button,
        {
          backgroundColor: vStyles.bg,
          borderColor: vStyles.border,
          shadowColor: shadowColor,
        },
        animatedStyle,
        style
      ]}
      {...rest}
    >
      <Text style={[styles.text, { color: vStyles.text }, textStyle]}>{label}</Text>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 100, // Pill shape
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    
    // Glow effect
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
  },
  text: {
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  }
});
