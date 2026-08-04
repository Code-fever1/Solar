import { ComingSoonScreen } from "@/components/ComingSoonScreen";
import { MechanicalMeter } from "@/components/MechanicalMeter";
import { SmartMeter } from "@/components/SmartMeter";
import { TomznCard } from "@/components/TomznCard";
import { Colors } from "@/constants/Colors";
import { useEnergy } from "@/context/EnergyContext";
import { useUiMode } from "@/context/UiModeContext";
import { Info } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NewMetersScreen } from "@/components/NewMetersScreen";

export default function MetersScreen() {
  const insets = useSafeAreaInsets();
  const theme = Colors.dark;
  const { activeMeter, meters, home, learningProfiles } = useEnergy();
  const { mode } = useUiMode();
  if (mode === "new") return <NewMetersScreen />;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Meters</Text>
            <Text style={styles.subtitle}>Overview of your physical meters & Tomzn.</Text>
          </View>
          <Info size={20} color={theme.textSecondary} />
        </View>

        {/* Tomzn integration card */}
        <TomznCard />

        <View style={styles.spacer} />

        {/* Meter 1 Analog */}
        <MechanicalMeter
          state={meters.meter1}
          home={home}
          isActive={activeMeter === "meter1"}
          activeProfile={learningProfiles["meter1"]}
        />

        <View style={styles.spacer} />

        {/* Meter 2 Digital */}
        <SmartMeter
          state={meters.meter2}
          home={home}
          isActive={activeMeter === "meter2"}
          activeProfile={learningProfiles["meter2"]}
        />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    paddingHorizontal: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  spacer: {
    height: 8,
  }
});
