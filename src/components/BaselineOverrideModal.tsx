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
import type { MeterId, MeterState } from "@/context/energy-types";
import { GlassCard } from "./GlassCard";

type BaselineOverrideModalProps = {
  visible: boolean;
  meter: MeterState;
  currentBaseline: number;
  onClose: () => void;
  onSave: (meterId: MeterId, manualReading: number) => void;
};

export function BaselineOverrideModal({
  visible,
  meter,
  currentBaseline,
  onClose,
  onSave,
}: BaselineOverrideModalProps) {
  const [value, setValue] = useState(String(currentBaseline.toFixed(1)));

  useEffect(() => {
    if (visible) {
      setValue(String(currentBaseline.toFixed(1)));
    }
  }, [currentBaseline, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <GlassCard style={styles.sheet}>
          <Text style={styles.title}>Override Bill Start Reading</Text>
          <Text style={styles.subtitle}>
            Enter the exact baseline reading from your physical WAPDA bill for {meter.label}. This will reset automatically next month on the 28th.
          </Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="Manual bill reading"
            placeholderTextColor={Colors.dark.textSecondary}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const num = parseFloat(value);
                if (!isNaN(num) && num > 0) {
                  onSave(meter.id, num);
                }
              }}
              style={[styles.button, styles.primaryButton]}
            >
              <Text style={styles.primaryButtonText}>Save Override</Text>
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
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  sheet: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontFamily: "Outfit",
    fontSize: 20,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  subtitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  input: {
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 16,
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  primaryButton: {
    backgroundColor: Colors.dark.solar,
  },
  secondaryButtonText: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
  primaryButtonText: {
    color: "#000",
    fontFamily: "Outfit",
    fontWeight: "700",
  },
});
