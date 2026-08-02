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
import type { MeterId } from "@/context/energy-types";
import { GlassCard } from "./GlassCard";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useEnergy } from "@/context/EnergyContext";
import React from "react";

type BaselineOverrideModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (meterId: MeterId, manualReading: number) => void;
};

export function BaselineOverrideModal({
  visible,
  onClose,
  onSave,
}: BaselineOverrideModalProps) {
  const scheme = useColorScheme();
  const theme = scheme === "light" ? Colors.light : Colors.dark;
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { meters } = useEnergy();

  const [meterId, setMeterId] = useState<MeterId>("meter1");
  const [value, setValue] = useState("");

  // When modal opens or meter changes, pre-fill with the computed baseline
  useEffect(() => {
    if (visible) {
      const state = meters[meterId];
      const computedBaseline = state.reading - (state.targetUnits - state.remainingUnits);
      setValue(String(computedBaseline.toFixed(1)));
    }
  }, [visible, meterId]);

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
            Select a meter and enter the exact baseline reading from your physical WAPDA bill. This resets automatically next month on the 28th.
          </Text>

          {/* Meter Selection */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Select Meter</Text>
            <View style={styles.selectorRow}>
              <Pressable
                onPress={() => setMeterId("meter1")}
                style={[
                  styles.selectorChip,
                  meterId === "meter1" && styles.selectorChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectorChipText,
                    meterId === "meter1" && styles.selectorChipTextActive,
                  ]}
                >
                  Meter 1 (Analog)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMeterId("meter2")}
                style={[
                  styles.selectorChip,
                  meterId === "meter2" && styles.selectorChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.selectorChipText,
                    meterId === "meter2" && styles.selectorChipTextActive,
                  ]}
                >
                  Meter 2 (Digital)
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Reading Input */}
          <TextInput
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="Manual bill reading"
            placeholderTextColor={theme.textSecondary}
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
                  onSave(meterId, num);
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

const getStyles = (theme: typeof Colors.light) => StyleSheet.create({
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
    color: theme.text,
  },
  subtitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontFamily: "Inter-Medium",
    fontSize: 13,
    color: theme.textSecondary,
    letterSpacing: 0.5,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectorChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  selectorChipActive: {
    borderColor: theme.solar,
    backgroundColor: "rgba(255, 214, 10, 0.12)",
  },
  selectorChipText: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  selectorChipTextActive: {
    color: theme.solar,
    fontWeight: "700",
  },
  input: {
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 16,
    color: theme.text,
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
    borderColor: theme.border,
  },
  primaryButton: {
    backgroundColor: theme.solar,
  },
  secondaryButtonText: {
    color: theme.text,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
  primaryButtonText: {
    color: "#000",
    fontFamily: "Outfit",
    fontWeight: "700",
  },
});
