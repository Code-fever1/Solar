import { Tabs } from "expo-router";
import {
    ChartSpline,
    CircleGauge,
    House,
    TriangleAlert,
} from "lucide-react-native";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/Colors";

const TAB_BAR_HEIGHT = 72;

function TabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const containerWidth = Math.min(width - 24, 520);

  return (
    <View
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}
    >
      <View style={[styles.bar, { width: containerWidth }]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = options.title ?? route.name;
          const Icon =
            route.name === "index"
              ? House
              : route.name === "meters"
                ? CircleGauge
                : route.name === "history"
                  ? ChartSpline
                  : TriangleAlert;

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
              style={[styles.tab, isFocused && styles.tabActive]}
            >
              <Icon
                color={isFocused ? Colors.dark.text : Colors.dark.textSecondary}
                size={20}
              />
              <Text style={[styles.label, isFocused && styles.labelActive]}>
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
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="meters" options={{ title: "Meters" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="alerts" options={{ title: "Alerts" }} />
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
    backgroundColor: "rgba(14, 18, 29, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
  },
  tab: {
    flex: 1,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    gap: 4,
  },
  tabActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  label: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
  },
  labelActive: {
    color: Colors.dark.text,
    fontWeight: "700",
  },
});
