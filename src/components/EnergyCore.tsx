import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Colors } from '@/constants/Colors';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, useAnimatedProps, withSequence, withDelay } from 'react-native-reanimated';
import { MotiView } from 'moti';
import { Sun, Zap, Home } from 'lucide-react-native';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type EnergyCoreProps = {
  solarKw: number;
  gridKw: number;
  loadKw: number;
};

// Represents a single pulsing node
const PowerNode = ({ icon: Icon, value, label, color, glow, delay = 0 }: any) => {
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.8, translateY: 20 }}
      animate={{ opacity: 1, scale: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 14, stiffness: 100, delay }}
      style={[styles.node, { shadowColor: glow }]}
    >
      {/* Inner glowing circle */}
      <MotiView
        from={{ scale: 0.9, opacity: 0.5 }}
        animate={{ scale: 1.1, opacity: 0.8 }}
        transition={{ loop: true, type: 'timing', duration: 2000, direction: 'alternate' }}
        style={[styles.nodeGlow, { backgroundColor: color }]}
      />
      <View style={styles.nodeInner}>
        <Icon color={color} size={24} />
        <Text style={styles.nodeValue}>{value.toFixed(1)} <Text style={styles.nodeUnit}>kW</Text></Text>
        <Text style={styles.nodeLabel}>{label}</Text>
      </View>
    </MotiView>
  );
};

// Represents the flowing particles along a wire
const EnergyFlowPath = ({ d, color, speed, reverse = false, active = true }: any) => {
  const dashOffset = useSharedValue(0);

  useEffect(() => {
    if (active) {
      dashOffset.value = withRepeat(
        withTiming(reverse ? 100 : -100, { duration: speed, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [active, speed, reverse]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={3}
      strokeDasharray="10 20"
      animatedProps={animatedProps}
      fill="none"
      opacity={active ? 0.8 : 0.1}
    />
  );
};

export const EnergyCore = ({ solarKw, gridKw, loadKw }: EnergyCoreProps) => {
  // SVG paths connecting nodes to the center
  const solarPath = "M 50,40 C 100,40 100,100 150,100";
  const gridPath = "M 50,160 C 100,160 100,100 150,100";
  const homePath = "M 150,100 C 200,100 200,100 250,100";

  // Calculate flow speeds (faster = higher kW, clamp min/max)
  const getSpeed = (kw: number) => Math.max(500, 2000 - (kw * 200));

  return (
    <View style={styles.container}>
      {/* Background connecting wires (faint) */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 300 200">
          <Defs>
            <LinearGradient id="solarGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={Colors.dark.solar} stopOpacity="0.1" />
              <Stop offset="1" stopColor={Colors.dark.solar} stopOpacity="0.4" />
            </LinearGradient>
            <LinearGradient id="gridGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={Colors.dark.grid} stopOpacity="0.1" />
              <Stop offset="1" stopColor={Colors.dark.grid} stopOpacity="0.4" />
            </LinearGradient>
            <LinearGradient id="homeGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={Colors.dark.load} stopOpacity="0.4" />
              <Stop offset="1" stopColor={Colors.dark.load} stopOpacity="0.1" />
            </LinearGradient>
          </Defs>

          {/* Base wires */}
          <Path d={solarPath} stroke="url(#solarGrad)" strokeWidth={2} fill="none" />
          <Path d={gridPath} stroke="url(#gridGrad)" strokeWidth={2} fill="none" />
          <Path d={homePath} stroke="url(#homeGrad)" strokeWidth={2} fill="none" />

          {/* Flowing particles */}
          <EnergyFlowPath d={solarPath} color={Colors.dark.solar} speed={getSpeed(solarKw)} active={solarKw > 0.1} />
          <EnergyFlowPath d={gridPath} color={Colors.dark.grid} speed={getSpeed(gridKw)} active={gridKw > 0.1} />
          <EnergyFlowPath d={homePath} color={Colors.dark.load} speed={getSpeed(loadKw)} active={loadKw > 0.1} />
        </Svg>
      </View>

      <View style={styles.sourcesCol}>
        <PowerNode icon={Sun} value={solarKw} label="Solar Yield" color={Colors.dark.solar} glow={Colors.dark.solarGlow} delay={100} />
        <PowerNode icon={Zap} value={gridKw} label="Grid Import" color={Colors.dark.grid} glow={Colors.dark.gridGlow} delay={200} />
      </View>

      <View style={styles.centerCol}>
        {/* The Hub / Energy Core */}
        <MotiView
          from={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring' }}
          style={styles.hub}
        >
          <MotiView
            from={{ scale: 0.9, opacity: 0.4 }}
            animate={{ scale: 1.2, opacity: 0.8 }}
            transition={{ loop: true, type: 'timing', duration: 1500, direction: 'alternate' }}
            style={[styles.hubGlow, { backgroundColor: solarKw > gridKw ? Colors.dark.solarGlow : Colors.dark.gridGlow }]}
          />
          <View style={styles.hubInner} />
        </MotiView>
      </View>

      <View style={styles.destCol}>
        <PowerNode icon={Home} value={loadKw} label="Home Load" color={Colors.dark.load} glow={Colors.dark.loadGlow} delay={300} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 240,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    position: 'relative',
  },
  sourcesCol: {
    justifyContent: 'space-between',
    height: '100%',
    paddingVertical: 20,
    zIndex: 2,
  },
  centerCol: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  destCol: {
    justifyContent: 'center',
    height: '100%',
    zIndex: 2,
  },
  node: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
  },
  nodeGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    filter: 'blur(20px)',
  },
  nodeInner: {
    backgroundColor: 'rgba(20, 20, 25, 0.7)',
    borderRadius: 20,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: 90,
  },
  nodeValue: {
    color: Colors.dark.text,
    fontFamily: 'Share Tech Mono',
    fontSize: 18,
    marginTop: 8,
  },
  nodeUnit: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  nodeLabel: {
    color: Colors.dark.textMuted,
    fontFamily: 'Outfit',
    fontSize: 10,
    marginTop: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  hub: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  hubGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    filter: 'blur(20px)',
  },
  hubInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  }
});
