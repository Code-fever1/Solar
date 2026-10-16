import { HomeDashboard } from "@/components/home/HomeDashboard";
import { useKeepAwake } from "expo-keep-awake";

export default function DashboardScreen() {
  useKeepAwake();
  return <HomeDashboard />;
}
