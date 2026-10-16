import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { formatPower } from "./homeModel";
import { useReducedMotionFlag } from "./homeMotion";
import type { Ink } from "./palette";
import { SOURCE } from "./palette";

const AnimatedPath = Animated.createAnimatedComponent(Path);

function Dash({
  d,
  color,
  active,
  reverse,
}: {
  d: string;
  color: string;
  active: boolean;
  reverse: boolean;
}) {
  const reduced = useReducedMotionFlag();
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!active || reduced || !d) {
      phase.value = 0;
      return;
    }
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(reverse ? -28 : 28, { duration: 1400, easing: Easing.linear }),
      -1,
      false,
    );
  }, [active, d, phase, reduced, reverse]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: phase.value }));
  if (!d) return null;
  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={1.5}
      fill="none"
      strokeLinecap="round"
      strokeDasharray="2 7"
      strokeOpacity={active ? 1 : 0.35}
      animatedProps={animatedProps}
    />
  );
}

export const PowerFlow = memo(function PowerFlow({
  width,
  ink,
  solarW,
  homeW,
  gridW,
  solarActive,
  gridActive,
  gridExporting,
}: {
  width: number;
  ink: Ink;
  solarW: number;
  homeW: number;
  gridW: number;
  solarActive: boolean;
  gridActive: boolean;
  gridExporting: boolean;
}) {
  const reduced = useReducedMotionFlag();
  const y = 22;
  const xs = [width * 0.16, width * 0.5, width * 0.84];
  const solarD = `M ${xs[0]} ${y} L ${xs[1]} ${y}`;
  const gridD = `M ${xs[1]} ${y} L ${xs[2]} ${y}`;
  const gridColor = gridExporting ? SOURCE.export : gridActive ? SOURCE.home : ink.secondary;
  const nodes = [
    { key: "solar", label: "Solar", watts: solarW, color: SOURCE.solar },
    { key: "home", label: "Home", watts: homeW, color: SOURCE.home },
    { key: "grid", label: "Grid", watts: gridW, color: gridExporting ? SOURCE.export : SOURCE.grid },
  ];

  return (
    <View style={{ width, height: 108 }}>
      <Svg width={width} height={44} style={StyleSheet.absoluteFill}>
        <Dash d={solarD} color={SOURCE.solar} active={solarActive && !reduced} reverse={false} />
        <Dash d={gridD} color={gridColor} active={gridActive && !reduced} reverse={!gridExporting && gridActive} />
      </Svg>
      {nodes.map((node, i) => {
        const power = formatPower(node.watts);
        return (
          <View key={node.key} style={[styles.node, { left: xs[i] - 36 }]}>
            <View style={[styles.dot, { backgroundColor: node.color, borderColor: ink.bg }]} />
            <Text style={[styles.label, { color: ink.secondary }]}>{node.label}</Text>
            <Text style={[styles.value, { color: ink.text }]}>
              {power.value}
              <Text style={[styles.unit, { color: ink.secondary }]}> {power.unit}</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  node: { position: "absolute", top: 10, width: 72, alignItems: "center" },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  label: { fontFamily: "Outfit_500Medium", fontSize: 11, marginTop: 10, letterSpacing: 0.4 },
  value: { fontFamily: "Outfit_400Regular", fontSize: 13, marginTop: 2, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: "Outfit_400Regular", fontSize: 11 },
});
