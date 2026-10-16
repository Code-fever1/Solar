import { HomeDashboard } from "@/components/home/HomeDashboard";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";

export default function DashboardScreen() {
  useKeepAwake();
  const isFocused = useIsFocused();
  return <HomeDashboard isTabFocused={isFocused} />;
}
