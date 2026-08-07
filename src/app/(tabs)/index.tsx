import { NewDashboard } from "@/components/NewDashboard";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";

export default function DashboardScreen() {
  return (
    <TabSlideWrapper index={0}>
      <NewDashboard />
    </TabSlideWrapper>
  );
}
