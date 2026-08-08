import { useKeepAwake } from "expo-keep-awake";
import { NewDashboard } from "@/components/NewDashboard";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";

export default function DashboardScreen() {
  useKeepAwake();
  return (
    <TabSlideWrapper index={0}>
      <NewDashboard />
    </TabSlideWrapper>
  );
}
