import { useSceneTheme } from "@/context/SceneThemeContext";
import { setPendingSlideDirection, setSwipeNavigateFn } from "@/components/TabSlideWrapper";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Activity, CalendarDays, House, Settings as SettingsIcon, Zap } from "lucide-react-native";
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Brighten a color toward white so it stays readable on dark backgrounds.
// `amount` = 0 returns original, 1 returns white.
function brighten([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  ];
}

// Darken a color toward black so it stays readable on light backgrounds.
// `amount` = 0 returns original, 1 returns black.
function darken([r, g, b]: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.round(r * (1 - amount)),
    Math.round(g * (1 - amount)),
    Math.round(b * (1 - amount)),
  ];
}

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 20, 480);

  // Expose navigation state for swipe gestures (TabSlideWrapper reads this).
  (globalThis as any).__tabNavState = {
    index: state.index,
    routes: state.routes.map((r: any) => r.name),
    navigate: navigation.navigate.bind(navigation),
  };

  const { sheetColors, textSecondary, isLight } = useSceneTheme();
  const { seam, sky } = sheetColors;

  // Brighten the sky color for the accent so the selected tab's icon/text
  // are always clearly readable, even on dark scenes like night (sky [6,21,45]).
  // On light scenes (fog, morning), darken instead so it reads on a light bar.
  const accentRgb = isLight ? darken(sky, 0.45) : brighten(sky, 0.55);

  // Glassmorphism navbar:
  //  - BlurView (expo-blur) gives real backdrop blur on iOS.
  //  - On Android (blurMethod='none'), BlurView renders semi-transparent —
  //    we layer a scene-tinted wash on top to simulate the frosted look.
  //  - The seam color ties the bar to the scene's dominant tone.
  //  - The accent color is the active tab highlight (scene's light source).
  const accent = rgba(accentRgb, 1);
  const inactiveColor = isLight ? "rgba(15,23,42,0.5)" : textSecondary;

  // Scene-tinted wash layered over the blur — this is what makes the glass
  // feel like it belongs to the current wallpaper, not a generic overlay.
  const tintWash = rgba(seam, 0.28);
  // Top inner glow — light catching the upper edge of the glass bar.
  const topGlowColor = rgba(accentRgb, 0.30);
  // Active pill: frosted glass with sky-tinted accent
  const pillAccent = rgba(accentRgb, 0.12);
  const pillBorder = rgba(accentRgb, 0.30);
  const pillGlow = rgba(accentRgb, 0.50);

  const titles: Record<string, string> = { index: "Home", meters: "Energy", logs: "Logs", history: "Summary", settings: "Settings" };

  const tabCount = state.routes.length;
  // Account for paddingHorizontal (8 each side) in the bar container.
  const usableWidth = containerWidth - 16;
  const tabWidth = usableWidth / tabCount;
  // Pill fills most of the tab slot — wider bubble that's clearly visible.
  const pillWidth = Math.min(tabWidth - 8, 76);

  // Animated sliding pill — translateX moves to center the pill in the active tab.
  // Offset by 8 to account for the bar's left padding.
  const pillOffset = 8 + state.index * tabWidth + (tabWidth - pillWidth) / 2;
  const translateX = useSharedValue(pillOffset);

  // Update position whenever the active tab changes.
  useEffect(() => {
    translateX.value = withSpring(pillOffset, {
      damping: 22,
      stiffness: 260,
      mass: 0.9,
    });
  }, [pillOffset, translateX]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
      <View style={[styles.barContainer, { width: containerWidth }]}>
        {/* Real backdrop blur (iOS) / semi-transparent fallback (Android) */}
        <BlurView
          intensity={isLight ? 45 : 60}
          tint={isLight ? "light" : "dark"}
          style={StyleSheet.absoluteFill}
          blurMethod={Platform.OS === "android" ? "none" : undefined}
        />
        {/* Scene-tinted wash over the blur — ties glass to the wallpaper */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tintWash }]} />
        {/* Top inner glow — light catching the glass edge */}
        <View style={[styles.topGlow, { borderTopColor: topGlowColor }]} />
        {/* Outer border — subtle rim defines the glass */}
        <View style={[styles.glassRim, { borderColor: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)" }]} />

        {/* Sliding active pill — compact bubble that animates between tabs */}
        <Animated.View style={[styles.pillContainer, { width: pillWidth }, pillStyle]}>
          <View style={styles.pill}>
            <View style={[styles.pillAccent, { backgroundColor: pillAccent }]} />
            <View style={[styles.pillBorder, { borderColor: pillBorder }]} />
            <View style={[styles.pillTopGlow, { borderTopColor: pillGlow }]} />
          </View>
        </Animated.View>

        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const label = titles[route.name] ?? route.name;
          const Icon = route.name === "index" ? House : route.name === "meters" ? Zap : route.name === "logs" ? Activity : route.name === "settings" ? SettingsIcon : CalendarDays;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              // Set slide direction BEFORE navigating so the incoming screen
              // knows which direction to slide from (no flash).
              setPendingSlideDirection(index > state.index ? 1 : -1);
              navigation.navigate(route.name);
            }
          };

          return (
            <View key={route.key} style={styles.tabWrapper}>
              <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                  styles.tab,
                  pressed && { opacity: 0.5 },
                ]}
              >
                <View style={styles.tabContent}>
                  <Icon
                    color={isFocused ? accent : inactiveColor}
                    size={19}
                    strokeWidth={isFocused ? 2.5 : 2}
                  />
                  <Text
                    style={[
                      styles.label,
                      { color: isFocused ? accent : inactiveColor },
                      isFocused && styles.labelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
              {index < tabCount - 1 && <View style={styles.separator} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const tabNames = ["index", "meters", "history", "logs", "settings"];

  // Register swipe navigation handler so TabSlideWrapper can trigger
  // tab switches from swipe gestures. Direction: -1 = back, 1 = forward.
  useEffect(() => {
    setSwipeNavigateFn((direction: number) => {
      // Use the router to navigate — we need the current index from the DOM state.
      // This is set via the tab bar's navigation state.
      const nav = (globalThis as any).__tabNavState;
      if (!nav) return;
      const { index, routes, navigate } = nav;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= routes.length) return;
      setPendingSlideDirection(direction);
      navigate(routes[targetIndex]);
    });
    return () => { setSwipeNavigateFn((() => {}) as any); };
  }, []);

  return (
    <Tabs
      initialRouteName="index"
      detachInactiveScreens={false}
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        freezeOnBlur: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="meters" options={{ title: "Meters" }} />
      <Tabs.Screen name="history" options={{ title: "Summary" }} />
      <Tabs.Screen name="logs" options={{ title: "Logs" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  // Glass bar container — holds the blur + tint layers + tabs
  barContainer: {
    height: 60,
    borderRadius: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  // Top inner glow — bright line at the top edge of the glass bar
  topGlow: {
    position: "absolute",
    top: 0,
    left: 10,
    right: 10,
    height: 1.5,
    borderTopWidth: 1.5,
    borderRadius: 1,
  },
  // Subtle white rim around the entire bar
  glassRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabWrapper: {
    flex: 1,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    position: "relative",
  },
  // Thin semi-transparent vertical divider between tab options
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  // Active pill — compact frosted glass bubble, centered in each tab slot.
  // Slides between tabs via animated translateX.
  pillContainer: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    zIndex: 0,
  },
  pill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    overflow: "hidden",
  },
  pillAccent: {
    ...StyleSheet.absoluteFill,
  },
  pillBorder: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderRadius: 14,
  },
  pillTopGlow: {
    position: "absolute",
    top: 0,
    left: 6,
    right: 6,
    height: 1.5,
    borderTopWidth: 1.5,
    borderRadius: 1,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    zIndex: 1,
  },
  label: {
    fontFamily: "Outfit",
    fontSize: 10,
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: "700",
  },
});
