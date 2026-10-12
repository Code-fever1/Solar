import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, LayoutAnimation, Platform, UIManager } from 'react-native';

// SwiftUI spring(response, dampingFraction) → React Native stiffness/damping.
// Coucou island open: response 0.5, dampingFraction 0.72 (docs/SPEC §4, louis-cfm/coucou).
function swiftSpring(response: number, dampingFraction: number) {
  const stiffness = (2 * Math.PI / response) ** 2;
  const damping = (4 * Math.PI * dampingFraction) / response;
  return {
    stiffness,
    damping,
    mass: 1,
    useNativeDriver: true as const,
    restDisplacementThreshold: 0.001,
    restSpeedThreshold: 0.001,
  };
}

/** Coucou island open — use for pages, FluidPager, modals, layout. */
export const openSpring = swiftSpring(0.5, 0.72);

/** Critically damped when bounce is unwanted (rare). Prefer openSpring for pages. */
export const smoothSpring = swiftSpring(0.5, 1);

/** Press / control springs — bouncy but refined. */
export const snappySpring = swiftSpring(0.3, 0.72);

export const pressScale = 0.965;

/** Page transitions must bounce — user asked for Coucou open spring back. */
export const pageSpring = openSpring;

/**
 * Bottom-tabs sceneStyleInterpolator.
 * Full-width slide; both scenes stay opaque. No opacity/scale.
 * Do NOT add extrapolate: 'clamp' — that kills spring overshoot.
 */
export function forFluidTab({
  current,
}: {
  current: { progress: Animated.Value };
}) {
  const width = Dimensions.get('window').width;
  return {
    sceneStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-width, 0, width],
          }),
        },
      ],
    },
  };
}

export function tabPageTransition() {
  if (reduceMotion) {
    return { animation: 'timing' as const, config: { duration: 1 } };
  }
  // Critically damped so a full-width tab slide settles in place.
  // The old 0.05 rest threshold stopped ~5% of the screen early, then snapped.
  return {
    animation: 'spring' as const,
    config: {
      stiffness: smoothSpring.stiffness,
      damping: smoothSpring.damping,
      mass: smoothSpring.mass,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
    },
  };
}

let reduceMotion = false;
const listeners = new Set<(value: boolean) => void>();

export function prefersReducedMotion() {
  return reduceMotion;
}

export function subscribeReduceMotion(listener: (value: boolean) => void) {
  listeners.add(listener);
  listener(reduceMotion);
  return () => {
    listeners.delete(listener);
  };
}

function publishReduceMotion(value: boolean) {
  reduceMotion = value;
  listeners.forEach((listener) => listener(value));
}

/** Call once from root layout. */
export function startMotionPreferences() {
  AccessibilityInfo.isReduceMotionEnabled().then(publishReduceMotion).catch(() => {});
  const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', publishReduceMotion);
  return () => subscription.remove();
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Expand/collapse cards — Coucou damping. Instant if Reduce Motion. */
export function flowLayout() {
  if (reduceMotion) {
    LayoutAnimation.configureNext({
      duration: 1,
      update: { type: LayoutAnimation.Types.linear },
    });
    return;
  }
  LayoutAnimation.configureNext({
    duration: 420,
    update: {
      type: LayoutAnimation.Types.spring,
      springDamping: 0.72,
    },
    create: {
      type: LayoutAnimation.Types.spring,
      property: LayoutAnimation.Properties.opacity,
      springDamping: 0.72,
    },
    delete: {
      type: LayoutAnimation.Types.spring,
      property: LayoutAnimation.Properties.opacity,
      springDamping: 0.86,
    },
  });
}

/** Modal card: scale 0.94 → 1 with the open spring, opacity with a short fade. */
export function useCoucouEnter(visible: boolean) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const [reduced, setReduced] = useState(prefersReducedMotion());

  useEffect(() => subscribeReduceMotion(setReduced), []);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.94);
      return;
    }
    if (reduced) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    opacity.setValue(0);
    scale.setValue(0.94);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { ...openSpring, toValue: 1 }),
    ]).start();
  }, [visible, reduced, opacity, scale]);

  return { opacity, scale };
}
