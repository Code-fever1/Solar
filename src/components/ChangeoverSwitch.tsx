import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/Colors';
import type { MeterId } from '@/context/EnergyContext';

type ChangeoverSwitchProps = {
  activeMeter: MeterId;
  onToggle: () => void;
};

export function ChangeoverSwitch({ activeMeter, onToggle }: ChangeoverSwitchProps) {
  const animatedValue = useRef(new Animated.Value(activeMeter === 'meter2' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: activeMeter === 'meter2' ? 0 : 1, // 0 is UP (meter2), 1 is DOWN (meter1)
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [activeMeter, animatedValue]);

  // Interpolate position of the lever handle knob inside the track
  const leverTranslateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 74], // Track length: 110. Handle height: 30. Bounds: 6px to 74px.
  });

  return (
    <View style={styles.outerPanel}>
      <Text style={styles.panelTitle}>Manual Changeover Switch</Text>
      
      <View style={styles.switchBody}>
        {/* Labels left side */}
        <View style={styles.labelsColumn}>
          <View style={[styles.labelBlock, activeMeter === 'meter2' && styles.activeTextContainer]}>
            <Text style={[styles.labelTitle, activeMeter === 'meter2' && styles.activeText]}>UP POSITION</Text>
            <Text style={styles.labelText}>Meter 2 (Digital)</Text>
          </View>
          <View style={[styles.labelBlock, activeMeter === 'meter1' && styles.activeTextContainer]}>
            <Text style={[styles.labelTitle, activeMeter === 'meter1' && styles.activeText]}>DOWN POSITION</Text>
            <Text style={styles.labelText}>Meter 1 (Analog)</Text>
          </View>
        </View>

        {/* Physical switch casing */}
        <Pressable onPress={onToggle} style={styles.knifeSwitchBox}>
          {/* Top terminals */}
          <View style={styles.terminalsRow}>
            <View style={[styles.terminalContact, activeMeter === 'meter2' && styles.terminalActive]} />
            <View style={[styles.terminalContact, activeMeter === 'meter2' && styles.terminalActive]} />
          </View>

          {/* Lever track slot */}
          <View style={styles.leverTrack}>
            <Animated.View style={[styles.leverHandle, { transform: [{ translateY: leverTranslateY }] }]}>
              {/* Metal arm */}
              <View style={styles.leverArm} />
              {/* Red knob head */}
              <View style={styles.leverKnob} />
            </Animated.View>
          </View>

          {/* Bottom terminals */}
          <View style={styles.terminalsRow}>
            <View style={[styles.terminalContact, activeMeter === 'meter1' && styles.terminalActive]} />
            <View style={[styles.terminalContact, activeMeter === 'meter1' && styles.terminalActive]} />
          </View>
        </Pressable>
      </View>
      
      <Text style={styles.actionHint}>TAP THE SWITCH BOX TO FLIP THE LEVER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outerPanel: {
    borderRadius: 14,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  panelTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  switchBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 24,
  },
  labelsColumn: {
    flex: 1.2,
    gap: 24,
  },
  labelBlock: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
  },
  activeTextContainer: {
    borderLeftColor: Colors.dark.solar,
  },
  labelTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  activeText: {
    color: Colors.dark.solar,
  },
  labelText: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  knifeSwitchBox: {
    width: 60,
    height: 140,
    borderRadius: 10,
    backgroundColor: '#0F1116',
    borderWidth: 2,
    borderColor: '#2D323E',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  terminalsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  terminalContact: {
    width: 10,
    height: 10,
    backgroundColor: '#4B5263',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#363C4A',
  },
  terminalActive: {
    backgroundColor: '#E6A23C', // Copper spark active glow
    borderColor: '#FFD066',
  },
  leverTrack: {
    width: 18,
    flex: 1,
    backgroundColor: '#07080B',
    borderRadius: 9,
    marginVertical: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  leverHandle: {
    width: 30,
    height: 30,
    position: 'absolute',
    left: -6, // Centering horizontal arm/knob (width 30 over width 18 track)
    alignItems: 'center',
    justifyContent: 'center',
  },
  leverArm: {
    width: 14,
    height: 8,
    backgroundColor: '#8C98B0',
    borderRadius: 1,
  },
  leverKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D93838', // Physical red plastic lever handle
    borderWidth: 1.5,
    borderColor: '#FFA3A3',
    position: 'absolute',
  },
  actionHint: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontFamily: 'Outfit',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
