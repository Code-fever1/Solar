import { useFocusEffect } from "expo-router";
import { useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const SLIDE_DURATION = 300;
const EASING = Easing.out(Easing.cubic);

/**
 * Wraps tab screen content with a full page-width slide animation when the
 * tab gains focus — like swiping between pages in a horizontal pager.
 *
 * The new screen slides in from the edge of the direction you're moving:
 *  - Tapping a tab to the right → content slides in from the right edge
 *  - Tapping a tab to the left → content slides in from the left edge
 *
 * The initial position is set synchronously via useSharedValue's initial
 * argument so there's no flash at position 0 before the animation starts.
 * No opacity fade — the page stays fully visible as it slides in, giving
 * a connected "scrolling" feel with no black gap.
 *
 * Uses a module-level shared "last index" so any TabSlideWrapper instance
 * knows which tab was previously active and can compute the correct direction.
 */
let lastTabIndex = 0;

type Props = {
  children: React.ReactNode;
  /** This tab's index in the tab bar (0-based). */
  index: number;
};

export function TabSlideWrapper({ children, index }: Props) {
  const { width } = useWindowDimensions();
  const isFirstMount = useRef(true);

  // Compute the initial offset synchronously — on first mount, if we're
  // switching from a different tab, start fully off-screen so there's no
  // flash at position 0. For the initial tab (app open), start at 0.
  const shouldStartOffscreen = lastTabIndex !== index;
  const initialDir = index > lastTabIndex ? 1 : -1;
  const translateX = useSharedValue(shouldStartOffscreen ? initialDir * width : 0);

  useFocusEffect(() => {
    if (isFirstMount.current) {
      // First mount — translateX is already at the offset (or 0 for initial tab).
      // Just animate to 0.
      if (shouldStartOffscreen) {
        translateX.value = withTiming(0, { duration: SLIDE_DURATION, easing: EASING });
      }
      isFirstMount.current = false;
    } else {
      // Subsequent focus (tab was kept mounted, now refocused).
      // Set offset based on direction, then slide to 0.
      if (lastTabIndex !== index) {
        const dir = index > lastTabIndex ? 1 : -1;
        translateX.value = dir * width;
        translateX.value = withTiming(0, { duration: SLIDE_DURATION, easing: EASING });
      }
    }
    lastTabIndex = index;
    return () => {};
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
