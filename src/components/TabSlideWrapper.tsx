import { useSceneTheme } from "@/context/SceneThemeContext";
import { useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SLIDE_DURATION = 280;
const EASING = Easing.out(Easing.cubic);
const SWIPE_THRESHOLD = 80;

/**
 * Module-level pending slide direction.
 * The tab bar sets this BEFORE navigating so the incoming screen knows
 * which direction to slide from.
 *
 * direction: 1 = slide from right (moving forward), -1 = slide from left (moving back)
 */
let pendingDirection: number | null = null;

export function setPendingSlideDirection(direction: number) {
  pendingDirection = direction;
}

/**
 * Module-level navigation function for swipe gestures.
 * Set by the tab layout so swipe gestures can trigger tab navigation.
 */
let swipeNavigateFn: ((direction: number) => void) | null = null;

export function setSwipeNavigateFn(fn: (direction: number) => void) {
  swipeNavigateFn = fn;
}

/**
 * Wraps tab screen content with a full page-width slide animation.
 *
 * - Both screens stay mounted (detachInactiveScreens=false) so the incoming
 *   screen is already rendered before the animation starts.
 * - Solid background from scene theme — no black flash.
 * - No opacity fade — connected scrolling feel.
 * - Swipe left/right to change tabs (like WhatsApp/Facebook).
 */
type Props = {
  children: React.ReactNode;
  index: number;
  /** Total number of tabs (for swipe bounds checking). */
  tabCount?: number;
};

export function TabSlideWrapper({ children, index, tabCount = 5 }: Props) {
  const { width } = useWindowDimensions();
  const { screenBg } = useSceneTheme();
  const translateX = useSharedValue(0);
  const hasAnimated = useRef(false);

  // Check pending direction on every render — works on web and native.
  // useFocusEffect doesn't always fire on web, so we poll via useEffect
  // with a microtask to catch the pending direction set by the tab bar.
  useEffect(() => {
    if (pendingDirection !== null) {
      const dir = pendingDirection;
      pendingDirection = null;
      translateX.value = dir * width;
      translateX.value = withTiming(0, { duration: SLIDE_DURATION, easing: EASING });
    }
    hasAnimated.current = true;
  });

  // Swipe gesture — pan left/right to change tabs
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
    .failOffsetY([-30, 30])
    .onEnd((e) => {
      if (Math.abs(e.translationX) < SWIPE_THRESHOLD) return;
      // Swipe right (translationX > 0) = go back (lower index)
      // Swipe left (translationX < 0) = go forward (higher index)
      const direction = e.translationX > 0 ? -1 : 1;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= tabCount) return;
      if (swipeNavigateFn) {
        runOnJS(swipeNavigateFn)(direction);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: screenBg }, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
