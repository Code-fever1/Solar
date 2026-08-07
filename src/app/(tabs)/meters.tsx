import { NewMetersScreen } from "@/components/NewMetersScreen";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";

export default function MetersScreen() {
  return (
    <TabSlideWrapper index={1}>
      <NewMetersScreen />
    </TabSlideWrapper>
  );
}
