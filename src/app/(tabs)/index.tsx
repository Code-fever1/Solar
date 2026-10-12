import { NewDashboard } from "@/components/NewDashboard";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";

export default function DashboardScreen() {
  useKeepAwake();
  const isFocused = useIsFocused();
  return <NewDashboard isTabFocused={isFocused} />;
}
