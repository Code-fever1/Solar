import { useEffect, useState } from "react";
import {
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { Colors } from "@/constants/Colors";
import type { MeterId, MeterState } from "@/context/EnergyContext";
import { GlassCard } from "./GlassCard";

type CalibrationModalProps = {
  visible: boolean;
  meter: MeterState;
  onClose: () => void;
  onSave: (meterId: MeterId, manualReading: number) => void;
};

export function CalibrationModal({
  visible,
  meter,
  onClose,
  onSave,
}: CalibrationModalProps) {
  const [value, setValue] = useState(String(meter.reading.toFixed(1)));

  useEffect(() => {
    if (visible) {
      setValue(String(meter.reading.toFixed(1)));
    }
  }, [meter.reading, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <GlassCard style={styles.sheet}>
          <Text style={styles.title}>Calibrate {meter.label}</Text>
          <Text style={styles.subtitle}>
            Enter the physical reading from the meter face.
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="Manual reading"
            placeholderTextColor={Colors.dark.textSecondary}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                onSave(meter.id, Number.parseFloat(value) || meter.reading)
              }
              style={styles.button}
            >
              <Text style={styles.primaryText}>Save calibration</Text>
            </Pressable>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(4, 6, 11, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    padding: 20,
    gap: 14,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: "rgba(255,255,255,0.04)",
    color: Colors.dark.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Share Tech Mono",
    fontSize: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.dark.solar,
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  primaryText: {
    color: "#071018",
    fontFamily: "Outfit",
    fontWeight: "700",
  },
  secondaryText: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
});
