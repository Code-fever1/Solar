import { Tabs } from "expo-router";
import {
  ChartSpline,
  CircleGauge,
  Zap,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/Colors";

const TAB_BAR_HEIGHT = 72;

function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 24, 520);

  const scheme = useColorScheme();
  const isLight = scheme === "light";
  const theme = isLight ? Colors.light : Colors.dark;

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
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = options.title ?? route.name;
          const Icon =
            route.name === "index"
              ? Zap
              : route.name === "meters"
                ? CircleGauge
                : route.name === "logs"
                  ? FileText
                  : route.name === "settings"
                    ? SettingsIcon
                    : ChartSpline;

          const activeColor = "#3B82F6";
          const inactiveColor = "#8A94A6";

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
              style={[
                styles.tab,
                isFocused && {
                  backgroundColor: "rgba(59, 130, 246, 0.12)",
                },
              ]}
            >
              <Icon
                color={isFocused ? activeColor : inactiveColor}
                size={18}
              />
              <Text
                style={[
                  styles.label,
                  { color: isFocused ? activeColor : inactiveColor },
                  isFocused && styles.labelActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {label}
              </Text>
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
  label: {
    fontFamily: "Outfit",
    fontSize: 11,
  },
  labelActive: {
    fontWeight: "700",
  },
});
