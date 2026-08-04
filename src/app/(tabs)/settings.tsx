import { ComingSoonScreen } from "@/components/ComingSoonScreen";
import { Colors } from "@/constants/Colors";
import { useEnergy } from "@/context/EnergyContext";
import { useUiMode } from "@/context/UiModeContext";
import { RefreshCw, Save } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = Colors.dark;
  const { swapChangeover, activeMeter, meters, setManualBaseline } = useEnergy();
  const [meter1Baseline, setMeter1Baseline] = useState("");
  const [meter2Baseline, setMeter2Baseline] = useState("");
  const [savingBaselines, setSavingBaselines] = useState(false);
  const { mode } = useUiMode();

  useEffect(() => {
    if (!meter1Baseline) setMeter1Baseline(String((meters.meter1.reading - (meters.meter1.cycleUsage || 0)).toFixed(2)));
    if (!meter2Baseline) setMeter2Baseline(String((meters.meter2.reading - (meters.meter2.cycleUsage || 0)).toFixed(2)));
  }, [meters.meter1.reading, meters.meter1.cycleUsage, meters.meter2.reading, meters.meter2.cycleUsage]);

  if (mode === "new") return <ComingSoonScreen title="Settings" />;

  const handleSwap = () => {
    swapChangeover();
    Alert.alert("Changeover Swapped", `Active meter is now ${activeMeter === 'meter1' ? 'Meter 2 (Digital)' : 'Meter 1 (Analog)'}`);
  };

  const handleSaveBaselines = async () => {
    const meter1 = Number(meter1Baseline);
    const meter2 = Number(meter2Baseline);
    if (!Number.isFinite(meter1) || meter1 < 0 || !Number.isFinite(meter2) || meter2 < 0) {
      Alert.alert("Check baseline units", "Enter a valid non-negative meter reading for both meters.");
      return;
    }
    setSavingBaselines(true);
    try {
      // The server fixes each baseline to the current billing cycle, which starts on the 28th.
      await setManualBaseline("meter1", meter1, Date.now());
      await setManualBaseline("meter2", meter2, Date.now());
      Alert.alert("Baselines saved", "Both meter baselines are set for the billing cycle that started on the 28th.");
    } catch {
      Alert.alert("Could not save baselines", "Check the server connection and try again.");
    } finally {
      setSavingBaselines(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Manual changeover and billing-cycle meter baselines.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CHANGEOVER CONTROL</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <View style={[styles.iconBox, { backgroundColor: theme.info + '20' }]}>
                  <RefreshCw size={18} color={theme.info} />
                </View>
                <View>
                  <Text style={styles.cardTitle}>Active Source</Text>
                  <Text style={styles.cardSub}>
                    Currently {activeMeter === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'}
                  </Text>
                </View>
              </View>
              <Pressable style={styles.swapBtn} onPress={handleSwap}>
                <Text style={styles.swapBtnText}>Swap</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BILLING CYCLE BASELINES</Text>
          <View style={styles.card}>
            <View style={styles.baselineContent}>
              <Text style={styles.cardTitle}>Meter readings on the 28th</Text>
              <Text style={styles.cardSub}>Enter the physical readings from your bill. Both values anchor the current monthly cycle.</Text>
              <Text style={styles.cycleDate}>Billing cycle starts on the 28th of every month</Text>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meter 1</Text>
                  <TextInput value={meter1Baseline} onChangeText={setMeter1Baseline} keyboardType="decimal-pad" style={styles.input} placeholder="0.00" placeholderTextColor={theme.textMuted} />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meter 2</Text>
                  <TextInput value={meter2Baseline} onChangeText={setMeter2Baseline} keyboardType="decimal-pad" style={styles.input} placeholder="0.00" placeholderTextColor={theme.textMuted} />
                </View>
              </View>
              <Pressable style={[styles.saveBtn, savingBaselines && styles.saveBtnDisabled]} onPress={handleSaveBaselines} disabled={savingBaselines}>
                <Save size={15} color="#071018" />
                <Text style={styles.saveBtnText}>{savingBaselines ? "Saving…" : "Save 28th baselines"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
    gap: 24,
  },
  header: {
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
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingLeft: 4,
  },
  card: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 15,
    fontWeight: "600",
  },
  cardSub: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  swapBtn: {
    backgroundColor: Colors.dark.info,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  swapBtnText: {
    color: "#000",
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 12,
  },
  baselineContent: {
    padding: 16,
    gap: 10,
  },
  cycleDate: {
    color: Colors.dark.info,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
  },
  inputGroup: {
    flex: 1,
    gap: 5,
  },
  inputLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
  },
  input: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  saveBtn: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.info,
    borderRadius: 9,
    paddingVertical: 11,
    marginTop: 2,
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    color: "#071018",
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 12,
  },
});
