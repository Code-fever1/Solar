import { NewDashboard } from "@/components/NewDashboard";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";

export default function DashboardScreen() {
  useKeepAwake();
  const isFocused = useIsFocused();
  return (
    <TabSlideWrapper index={0}>
      <NewDashboard isTabFocused={isFocused} />
    </TabSlideWrapper>
  );
}
