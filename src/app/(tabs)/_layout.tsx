import { Colors } from "@/constants/Colors";
import { useUiMode } from "@/context/UiModeContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Tabs } from "expo-router";
import { Activity, CalendarDays, House, Settings as SettingsIcon, Zap } from "lucide-react-native";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";


const TAB_BAR_HEIGHT = 72;

function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 24, 520);

  const scheme = useColorScheme();
  const isLight = scheme === "light";
  const theme = isLight ? Colors.light : Colors.dark;
  const { mode } = useUiMode();
  const isNew = mode === "new";
  const titles: Record<string, string> = isNew ? { index: "Home", meters: "Energy", logs: "", history: "History", settings: "Settings" } : { index: "Voltix", meters: "Meters", logs: "Logs", history: "History", settings: "Settings" };

  return (
    <View
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
    >
      <View
        style={[
          styles.bar,
          {
            width: containerWidth,
            backgroundColor: isLight
              ? "rgba(255, 255, 255, 0.94)"
              : "rgba(14, 18, 29, 0.92)",
            borderColor: theme.borderStrong,
            shadowColor: isLight ? "rgba(15, 23, 42, 0.15)" : "#000",
          },
        ]}
      >
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const label = titles[route.name] ?? route.name;
          const isPulse = isNew && route.name === "logs";
          const Icon = route.name === "index" ? House : route.name === "meters" ? Zap : route.name === "logs" ? Activity : route.name === "settings" ? SettingsIcon : CalendarDays;
          const activeColor = isNew ? "#35E378" : "#3B82F6";
          const inactiveColor = "#A5B4C5";

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
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tab, isNew && isFocused && !isPulse && styles.newFocused, isPulse && styles.pulseTab]}
            >
              <View style={isPulse ? styles.pulse : undefined}><Icon color={isPulse ? "#52F493" : isFocused ? activeColor : inactiveColor} size={isPulse ? 23 : 18} /></View>
              {!!label && <Text style={[styles.label, { color: isFocused ? activeColor : inactiveColor }, isFocused && styles.labelActive]} numberOfLines={1}>{label}</Text>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Voltix" }} />
      <Tabs.Screen name="meters" options={{ title: "Meters" }} />
      <Tabs.Screen name="logs" options={{ title: "Logs" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
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
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },
  tab: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    gap: 4,
  },
  newFocused: {
    backgroundColor: "rgba(53, 227, 120, 0.08)",
  },
  pulseTab: {
    overflow: "visible",
  },
  pulse: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginTop: -27,
    backgroundColor: "#0E2C22",
    borderWidth: 1,
    borderColor: "rgba(82, 244, 147, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#35E378",
    shadowOpacity: 0.42,
    shadowRadius: 14,
    elevation: 8,
  },
  label: {
    fontFamily: "Outfit",
    fontSize: 11,
  },
  labelActive: {
    fontWeight: "700",
  },
});
