import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
  Insets,
  AccessibilityState,
  AccessibilityRole,
} from 'react-native';
import { prefersReducedMotion, pressScale, snappySpring, subscribeReduceMotion } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressStyle = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

type SpringPressableProps = {
  children?: React.ReactNode;
  style?: PressStyle;
  disabled?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  onPressIn?: (event: GestureResponderEvent) => void;
  onPressOut?: (event: GestureResponderEvent) => void;
  delayLongPress?: number;
  hitSlop?: number | Insets;
  activeOpacity?: number;
  feedback?: 'scale' | 'none';
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
};

export function SpringPressable({
  children,
  style,
  disabled,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  delayLongPress,
  hitSlop,
  feedback = 'scale',
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
  testID,
}: SpringPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion());

  useEffect(() => subscribeReduceMotion(setReduceMotion), []);

  const animateTo = (toValue: number) => {
    if (reduceMotion || feedback === 'none') return;
    Animated.spring(scale, { ...snappySpring, toValue }).start();
  };

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled) animateTo(pressScale);
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    animateTo(1);
    onPressOut?.(event);
  };

  const shared = {
    disabled,
    onPress,
    onLongPress,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
    delayLongPress,
    hitSlop,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    testID,
  };

  if (typeof style === 'function') {
    return (
      <Pressable {...shared} style={style}>
        <Animated.View pointerEvents="box-none" style={{ transform: [{ scale }] }}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <AnimatedPressable
      {...shared}
      style={[style, reduceMotion || feedback === 'none' ? null : { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
