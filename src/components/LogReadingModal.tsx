import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';

import { GlassCard } from './GlassCard';
import { Colors } from '@/constants/Colors';
import type { MeterId } from '@/context/EnergyContext';

type LogReadingModalProps = {
  visible: boolean;
  onClose: () => void;
  onSave: (meterId: MeterId, reading: number, timestamp: number, notes?: string) => void;
  initialMeterId?: MeterId;
  editLog?: {
    id: string;
    meterId: MeterId;
    reading: number;
    timestamp: number;
    notes?: string;
  } | null;
};

export function LogReadingModal({ visible, onClose, onSave, initialMeterId = 'meter1', editLog = null }: LogReadingModalProps) {
  const [meterId, setMeterId] = useState<MeterId>(initialMeterId);
  const [reading, setReading] = useState('');
  const [notes, setNotes] = useState('');
  const [isCustomTime, setIsCustomTime] = useState(false);
  
  // Custom Date/Time states (local time)
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [timeOffsetMs, setTimeOffsetMs] = useState(0); // offset from "now" in ms

  useEffect(() => {
    if (visible) {
      if (editLog) {
        setMeterId(editLog.meterId);
        setReading(String(editLog.reading));
        setNotes(editLog.notes ?? '');
        setIsCustomTime(true);
        const logDate = new Date(editLog.timestamp);
        setDateStr(formatLocalDate(logDate));
        setTimeStr(formatLocalTime(logDate));
      } else {
        setMeterId(initialMeterId);
        setReading('');
        setNotes('');
        setIsCustomTime(false);
        setTimeOffsetMs(0);
        const now = new Date();
        setDateStr(formatLocalDate(now));
        setTimeStr(formatLocalTime(now));
      }
    }
  }, [visible, editLog, initialMeterId]);

  const formatLocalDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const formatLocalTime = (d: Date) => {
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  const handleSave = () => {
    const numericReading = Number.parseFloat(reading);
    if (Number.isNaN(numericReading) || numericReading < 0) {
      alert('Please enter a valid positive number for units.');
      return;
    }

    let timestampObj = new Date();
    if (isCustomTime) {
      const dateParts = dateStr.split('-').map(Number);
      const timeParts = timeStr.split(':').map(Number);
      if (dateParts.length !== 3 || timeParts.length !== 2) {
        alert('Invalid Date or Time format. Use YYYY-MM-DD and HH:MM.');
        return;
      }
      timestampObj = new Date(
        dateParts[0],
        dateParts[1] - 1,
        dateParts[2],
        timeParts[0],
        timeParts[1],
        0,
        0
      );
      if (Number.isNaN(timestampObj.getTime())) {
        alert('Please enter a valid Date and Time.');
        return;
      }
    } else {
      timestampObj = new Date(Date.now() - timeOffsetMs);
    }

    onSave(meterId, numericReading, timestampObj.getTime(), notes.trim() || undefined);
  };

  const applyOffset = (label: string, ms: number) => {
    setTimeOffsetMs(ms);
    setIsCustomTime(false);
    const targetDate = new Date(Date.now() - ms);
    setDateStr(formatLocalDate(targetDate));
    setTimeStr(formatLocalTime(targetDate));
  };

  const presets = [
    { label: 'Now', ms: 0 },
    { label: '30m ago', ms: 30 * 60 * 1000 },
    { label: '1h ago', ms: 60 * 60 * 1000 },
    { label: '2h ago', ms: 2 * 60 * 60 * 1000 },
    { label: '4h ago', ms: 4 * 60 * 60 * 1000 },
    { label: '12h ago', ms: 12 * 60 * 60 * 1000 },
    { label: 'Yesterday', ms: 24 * 60 * 60 * 1000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <GlassCard style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{editLog ? 'Edit Meter Entry' : 'Log Meter Reading'}</Text>
            <Text style={styles.subtitle}>Enter the current units (kWh) shown on your meter face.</Text>

            {/* Meter Selection */}
            {!editLog && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Select Source</Text>
                <View style={styles.selectorRow}>
                  <Pressable
                    onPress={() => setMeterId('meter1')}
                    style={[
                      styles.selectorChip,
                      meterId === 'meter1' && styles.selectorChipMeter1Active,
                    ]}
                  >
                    <Text style={[styles.selectorChipText, meterId === 'meter1' && styles.selectorChipTextActive]}>
                      Meter 1 (Analog)
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMeterId('meter2')}
                    style={[
                      styles.selectorChip,
                      meterId === 'meter2' && styles.selectorChipMeter2Active,
                    ]}
                  >
                    <Text style={[styles.selectorChipText, meterId === 'meter2' && styles.selectorChipTextActive]}>
                      Meter 2 (Digital)
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Reading Input */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Current Reading (kWh / Units)</Text>
              <TextInput
                value={reading}
                onChangeText={setReading}
                keyboardType="decimal-pad"
                placeholder="e.g. 5231.4"
                placeholderTextColor={Colors.dark.textSecondary}
                style={styles.input}
              />
            </View>

            {/* Time Presets (only for adding new entries) */}
            {!editLog && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Time Presets</Text>
                <View style={styles.presetsContainer}>
                  {presets.map((preset) => {
                    const isActive = !isCustomTime && timeOffsetMs === preset.ms;
                    return (
                      <Pressable
                        key={preset.label}
                        onPress={() => applyOffset(preset.label, preset.ms)}
                        style={[styles.presetBtn, isActive && styles.presetBtnActive]}
                      >
                        <Text style={[styles.presetBtnText, isActive && styles.presetBtnTextActive]}>
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Custom Time Selector */}
            <View style={styles.formGroup}>
              <Pressable
                onPress={() => setIsCustomTime(!isCustomTime)}
                style={styles.toggleCustomTimeBtn}
              >
                <Text style={styles.toggleCustomTimeText}>
                  {isCustomTime ? '✓ Custom Timestamp Enabled' : '✎ Edit Date & Time Manually'}
                </Text>
              </Pressable>

              {isCustomTime && (
                <View style={styles.dateTimeInputsRow}>
                  <View style={{ flex: 1.3 }}>
                    <Text style={styles.subLabel}>Date (YYYY-MM-DD)</Text>
                    <TextInput
                      value={dateStr}
                      onChangeText={setDateStr}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.dark.textSecondary}
                      style={styles.smallInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subLabel}>Time (HH:MM)</Text>
                    <TextInput
                      value={timeStr}
                      onChangeText={setTimeStr}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.dark.textSecondary}
                      style={styles.smallInput}
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Notes Input */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Morning reset, load peak"
                placeholderTextColor={Colors.dark.textSecondary}
                style={[styles.input, { height: 48 }]}
              />
            </View>

            {/* Save / Cancel buttons */}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.button, styles.secondaryButton]}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={styles.button}>
                <Text style={styles.primaryText}>{editLog ? 'Update' : 'Save Entry'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 11, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    padding: 0,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '600',
  },
  subLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 12,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectorChipMeter1Active: {
    backgroundColor: 'rgba(255,91,127,0.12)',
    borderColor: Colors.dark.grid,
  },
  selectorChipMeter2Active: {
    backgroundColor: 'rgba(157,80,187,0.12)',
    borderColor: Colors.dark.meter,
  },
  selectorChipSolarActive: {
    backgroundColor: 'rgba(0,242,254,0.12)',
    borderColor: Colors.dark.solar,
  },
  selectorChipText: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '600',
  },
  selectorChipTextActive: {
    color: Colors.dark.text,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: Colors.dark.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Share Tech Mono',
    fontSize: 18,
  },
  smallInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: Colors.dark.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Share Tech Mono',
    fontSize: 14,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  presetBtnText: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 12,
  },
  presetBtnTextActive: {
    color: Colors.dark.text,
    fontWeight: '700',
  },
  toggleCustomTimeBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  toggleCustomTimeText: {
    color: Colors.dark.solar,
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '600',
  },
  dateTimeInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.dark.solar,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  primaryText: {
    color: '#071018',
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  secondaryText: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
});
