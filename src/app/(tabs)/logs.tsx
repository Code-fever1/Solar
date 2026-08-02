import React, { useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/Colors";
import { useEnergy, MeterId } from "@/context/EnergyContext";
import { Activity, Clock } from "lucide-react-native";

export default function LogsScreen() {
  const insets = useSafeAreaInsets();
  const theme = Colors.dark;
  const { meters, addManualLog, history, manualLogs } = useEnergy();

  const [meterId, setMeterId] = useState<MeterId>("meter1");
  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = async () => {
    const numericReading = Number.parseFloat(reading);
    if (Number.isNaN(numericReading) || numericReading < 0) {
      Alert.alert("Invalid Input", "Please enter a valid positive number for units.");
      return;
    }

    try {
      await addManualLog(meterId, numericReading, Date.now(), notes.trim() || undefined);
      Alert.alert("Success", "Reading logged successfully. Engine has calculated the drift using Tomzn data.");
      setReading("");
      setNotes("");
    } catch(e) {
      Alert.alert("Error", "Failed to save reading.");
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
          <Text style={styles.title}>Log Entry</Text>
          <Text style={styles.subtitle}>Enter meter readings to train the AI with Tomzn gaps.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Select Meter</Text>
          <View style={styles.selectorRow}>
            <Pressable
              onPress={() => setMeterId("meter1")}
              style={[styles.selectorChip, meterId === "meter1" && styles.chipActive1]}
            >
              <Text style={[styles.selectorChipText, meterId === "meter1" && styles.chipTextActive]}>
                Meter 1 (Analog)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMeterId("meter2")}
              style={[styles.selectorChip, meterId === "meter2" && styles.chipActive2]}
            >
              <Text style={[styles.selectorChipText, meterId === "meter2" && styles.chipTextActive]}>
                Meter 2 (Digital)
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Current Reading (Units)</Text>
          <TextInput
            value={reading}
            onChangeText={setReading}
            keyboardType="decimal-pad"
            placeholder="e.g. 5231.4"
            placeholderTextColor={theme.textSecondary}
            style={styles.input}
          />
          {meters[meterId]?.lastLoggedReading !== undefined && (
            <Text style={styles.helperText}>
              Last Logged: {meters[meterId]?.lastLoggedReading.toFixed(1)} units
            </Text>
          )}

          <Text style={[styles.label, { marginTop: 16 }]}>Notes (Optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Morning sync"
            placeholderTextColor={theme.textSecondary}
            style={styles.inputSmall}
          />

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Reading</Text>
          </Pressable>
        </View>

        <View style={styles.recentLogs}>
          <Text style={styles.sectionTitle}>Recent Manual Logs</Text>
          {manualLogs.slice(0, 5).map(log => (
            <View key={log.id} style={styles.logRow}>
              <View style={styles.logLeft}>
                <Clock size={14} color={theme.textSecondary} />
                <View>
                  <Text style={styles.logMeter}>{log.meterId === 'meter1' ? 'Meter 1' : 'Meter 2'}</Text>
                  <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
                </View>
              </View>
              <View style={styles.logRight}>
                <Text style={styles.logReading}>{log.reading.toFixed(1)} <Text style={styles.logUnit}>kWh</Text></Text>
                {log.notes && <Text style={styles.logNote}>{log.notes}</Text>}
              </View>
            </View>
          ))}
          {manualLogs.length === 0 && (
            <Text style={{color: theme.textSecondary, fontSize: 12}}>No manual logs found.</Text>
          )}
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
    gap: 16,
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
  card: {
    backgroundColor: Colors.dark.backgroundElevated,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  label: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  chipActive1: {
    backgroundColor: "rgba(16, 185, 129, 0.15)", // exportGlow equivalent
    borderWidth: 1,
    borderColor: Colors.dark.export,
  },
  chipActive2: {
    backgroundColor: "rgba(10, 132, 255, 0.15)", // info equivalent
    borderWidth: 1,
    borderColor: Colors.dark.info,
  },
  selectorChipText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
  },
  chipTextActive: {
    color: Colors.dark.text,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: "rgba(255,255,255,0.03)",
    color: Colors.dark.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: "Share Tech Mono",
    fontSize: 20,
  },
  inputSmall: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: "rgba(255,255,255,0.03)",
    color: Colors.dark.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  helperText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginTop: 6,
    marginLeft: 4,
  },
  saveBtn: {
    backgroundColor: Colors.dark.export,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  saveBtnText: {
    color: "#000",
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
  },
  recentLogs: {
    marginTop: 16,
  },
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  logLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logMeter: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
  },
  logTime: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  logRight: {
    alignItems: "flex-end",
  },
  logReading: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 16,
    fontWeight: "700",
  },
  logUnit: {
    fontSize: 10,
    color: Colors.dark.textSecondary,
  },
  logNote: {
    color: Colors.dark.info,
    fontSize: 10,
    marginTop: 2,
  }
});
