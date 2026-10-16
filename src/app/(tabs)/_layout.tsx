import { SpringPressable } from "@/components/SpringPressable";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { forFluidTab, prefersReducedMotion, subscribeReduceMotion, tabPageTransition } from "@/lib/motion";
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Activity, CalendarDays, House, Settings as SettingsIcon, Zap } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    Platform,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 24, 480);
  const onHome = state.routes[state.index]?.name === "index";
  const titles: Record<string, string> = { index: "Home", meters: "Energy", logs: "Logs", history: "Summary", settings: "Settings" };

  return (
    <View
      style={[
        styles.outer,
        {
          paddingBottom: Math.max(insets.bottom, 8),
          backgroundColor: onHome ? "#0B0F14" : "transparent",
        },
      ]}
    >
      <View style={[styles.barContainer, { width: containerWidth }]}>
        <BlurView
          intensity={40}
          tint="dark"
          style={StyleSheet.absoluteFill}
          blurMethod={Platform.OS === "android" ? "none" : undefined}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(18,24,33,0.84)" }]} />
        <View style={styles.topGlow} />
        <View style={styles.glassRim} />

        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const label = titles[route.name] ?? route.name;
          const Icon = route.name === "index" ? House : route.name === "meters" ? Zap : route.name === "logs" ? Activity : route.name === "settings" ? SettingsIcon : CalendarDays;
          const color = isFocused ? "#F2F5F8" : "#8A94A3";

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <SpringPressable key={route.key} onPress={onPress} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} accessibilityLabel={label}>
              <Icon color={color} size={19} strokeWidth={isFocused ? 2.4 : 2} />
              {isFocused ? <View style={styles.amberDot} /> : <View style={styles.dotSpacer} />}
              <Text style={[styles.label, { color }, isFocused && styles.labelActive]} numberOfLines={1}>
                {label}
              </Text>
            </SpringPressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { screenBg } = useSceneTheme();
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion());

  useEffect(() => subscribeReduceMotion(setReduceMotion), []);

  return (
    <Tabs
      initialRouteName="index"
      detachInactiveScreens={false}
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: false,
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: screenBg },
        transitionSpec: tabPageTransition(),
        sceneStyleInterpolator: forFluidTab,
        animation: reduceMotion ? "none" : undefined,
        tabBarStyle: {
          position: "relative",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
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
    alignItems: "center",
    paddingTop: 8,
  },
  barContainer: {
    height: 62,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 18,
    right: 18,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  glassRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tab: {
    flex: 1,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  amberDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#F5B83D",
    marginTop: 1,
  },
  dotSpacer: {
    width: 4,
    height: 4,
    marginTop: 1,
  },
  label: {
    fontFamily: "Outfit_400Regular",
    fontSize: 10,
    letterSpacing: 0.1,
  },
  labelActive: {
    fontFamily: "Outfit_600SemiBold",
  },
});
