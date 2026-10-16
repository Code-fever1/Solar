import { pointsToPathD } from "@/overlay/pathUtils";
import type { HeroScene } from "@/overlay/types";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Path } from "react-native-svg";

import type { FlowNode } from "./homeModel";
import { formatPower, formatVA } from "./homeModel";
import { useReducedMotionFlag } from "./homeMotion";
import { INK, SOURCE } from "./palette";

const AnimatedPath = Animated.createAnimatedComponent(Path);

function GlowLine({
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
      withTiming(reverse ? -32 : 32, { duration: 1500, easing: Easing.linear }),
      -1,
      false,
    );
  }, [active, d, phase, reduced, reverse]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: phase.value,
  }));

  if (!d) return null;

  return (
    <G>
      <Path
        d={d}
        stroke={color}
        strokeWidth={5}
        strokeOpacity={active ? 0.28 : 0.1}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <AnimatedPath
        d={d}
        stroke={color}
        strokeWidth={1.7}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 8"
        strokeOpacity={active ? 1 : 0.4}
        animatedProps={animatedProps}
      />
    </G>
  );
}

const PILL_W = 102;
const PILL_H = 54;

function layoutPills(
  positions: Array<{ x: number; y: number; anchor?: "left" | "center" | "right" }>,
  viewBox: { width: number; height: number },
  width: number,
  height: number,
) {
  const boxes = positions.map((pos) => {
    let left = (pos.x / viewBox.width) * width;
    if (pos.anchor === "right") left -= PILL_W;
    else if (pos.anchor === "center" || !pos.anchor) left -= PILL_W / 2;
    const top = (pos.y / viewBox.height) * height;
    return {
      left: Math.max(8, Math.min(width - PILL_W - 8, left)),
      top: Math.max(8, Math.min(height - PILL_H - 36, top)),
    };
  });
  // Stack any pair that would cover the same patch of the house.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = a.left < b.left + PILL_W && b.left < a.left + PILL_W;
      const overlapY = a.top < b.top + PILL_H + 6 && b.top < a.top + PILL_H + 6;
      if (!overlapX || !overlapY) continue;
      if (a.top <= b.top) b.top = Math.min(height - PILL_H - 36, a.top + PILL_H + 8);
      else a.top = Math.min(height - PILL_H - 36, b.top + PILL_H + 8);
    }
  }
  return boxes;
}

function Pill({
  node,
  color,
  top,
  left,
}: {
  node: FlowNode;
  color: string;
  top: number;
  left: number;
}) {
  const power = formatPower(node.watts);
  return (
    <View
      style={[styles.pillWrap, { top, left }]}
      accessibilityLabel={`${node.label} ${power.value} ${power.unit}, ${formatVA(node.volts, node.amps)}, ${node.caption}`}
    >
      <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} blurMethod={Platform.OS === "android" ? "none" : undefined} />
      <View style={styles.pillWash} />
      <View style={styles.pillRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.pillName}>{node.label.toUpperCase()}</Text>
        <Text style={styles.pillCaption} numberOfLines={1}>{node.caption}</Text>
      </View>
      <Text style={styles.pillValue}>
        {power.value}
        <Text style={styles.pillUnit}> {power.unit}</Text>
      </Text>
      <Text style={styles.pillMeta}>{formatVA(node.volts, node.amps)}</Text>
    </View>
  );
}

export const HeroHouse = memo(function HeroHouse({
  scene,
  width,
  nodes,
  solarActive,
  gridActive,
  gridExporting,
}: {
  scene: HeroScene;
  width: number;
  nodes: [FlowNode, FlowNode, FlowNode];
  solarActive: boolean;
  gridActive: boolean;
  gridExporting: boolean;
}) {
  const reduced = useReducedMotionFlag();
  const { overlay } = scene;
  const height = Math.round(width * (overlay.viewBox.height / overlay.viewBox.width));
  const solarD = pointsToPathD(overlay.solarPath, overlay.viewBox, width, height);
  const gridD = pointsToPathD(overlay.gridPath, overlay.viewBox, width, height);
  const [solar, home, grid] = nodes;
  const gridColor = gridExporting ? SOURCE.export : SOURCE.home;

  const [solarPos, homePos, gridPos] = layoutPills(
    [overlay.solarLabelPosition, overlay.homeLabelPosition, overlay.gridLabelPosition],
    overlay.viewBox,
    width,
    height,
  );

  return (
    <View style={[styles.frame, { width, height }]}>
      <Image source={scene.source} style={StyleSheet.absoluteFill} resizeMode="stretch" accessibilityIgnoresInvertColors />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <GlowLine d={solarD} color={SOURCE.solar} active={solarActive && !reduced} reverse={false} />
        <GlowLine d={gridD} color={gridColor} active={gridActive && !reduced} reverse={gridExporting} />
      </Svg>
      <LinearGradient
        colors={["rgba(11,15,20,0)", "rgba(11,15,20,0.72)"]}
        style={styles.scrim}
        pointerEvents="none"
      />
      <Pill node={solar} color={SOURCE.solar} {...solarPos} />
      <Pill node={home} color={SOURCE.home} {...homePos} />
      <Pill node={grid} color={gridExporting ? SOURCE.export : SOURCE.grid} {...gridPos} />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { alignSelf: "center", overflow: "hidden" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 64 },
  pillWrap: {
    position: "absolute",
    width: PILL_W,
    minHeight: PILL_H,
    borderRadius: 14,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillWash: { ...StyleSheet.absoluteFill, backgroundColor: INK.frost },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillName: {
    color: INK.text,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 9,
    letterSpacing: 0.6,
  },
  pillCaption: {
    flex: 1,
    color: INK.secondary,
    fontFamily: "Outfit_400Regular",
    fontSize: 9,
  },
  pillValue: {
    color: INK.text,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 15,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  pillUnit: {
    color: INK.secondary,
    fontFamily: "Outfit_400Regular",
    fontSize: 11,
  },
  pillMeta: {
    color: INK.secondary,
    fontFamily: "Outfit_400Regular",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    marginTop: 1,
  },
});
