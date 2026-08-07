import { HERO_OVERLAY_CONFIGS, HERO_SCENE_BACKGROUNDS, HERO_SCENE_LIST } from "@/overlay/heroScenes";
import { pointsToPathD, screenToViewBox } from "@/overlay/pathUtils";
import type {
  HeroOverlayConfig,
  HeroSceneId,
  OverlayAnchorKey,
  OverlayPoint,
  WireKind,
} from "@/overlay/types";
import { router } from "expo-router";
import { ArrowLeft, Copy, Plus, Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

type EditTarget = WireKind | OverlayAnchorKey;

const WIRE_TARGETS: WireKind[] = ["grid", "solar", "inverterOutput"];
const ANCHOR_TARGETS: OverlayAnchorKey[] = [
  "solarLabelPosition",
  "gridLabelPosition",
  "homeLabelPosition",
  "inverterPosition",
  "dbBoxPosition",
];

const TARGET_LABELS: Record<EditTarget, string> = {
  grid: "Grid wire",
  solar: "Solar wire",
  inverterOutput: "Output wire",
  solarLabelPosition: "Solar label",
  gridLabelPosition: "Grid label",
  homeLabelPosition: "Home label",
  inverterPosition: "Inverter",
  dbBoxPosition: "DB box",
};

const TARGET_COLORS: Record<EditTarget, string> = {
  grid: "#6E9BFF",
  solar: "#FFD54F",
  inverterOutput: "#45E376",
  solarLabelPosition: "#F59E0B",
  gridLabelPosition: "#60A5FA",
  homeLabelPosition: "#34D399",
  inverterPosition: "#E879F9",
  dbBoxPosition: "#F87171",
};

const PATH_KEYS: Record<
  WireKind,
  keyof Pick<HeroOverlayConfig, "solarPath" | "gridPath" | "inverterOutputPath">
> = {
  solar: "solarPath",
  grid: "gridPath",
  inverterOutput: "inverterOutputPath",
};

function cloneConfig(config: HeroOverlayConfig): HeroOverlayConfig {
  return JSON.parse(JSON.stringify(config));
}

function isWireTarget(target: EditTarget): target is WireKind {
  return WIRE_TARGETS.includes(target as WireKind);
}

function getTargetPoint(config: HeroOverlayConfig, target: OverlayAnchorKey): OverlayPoint {
  return config[target];
}

function updateTargetPoint(
  config: HeroOverlayConfig,
  target: OverlayAnchorKey,
  next: OverlayPoint,
): HeroOverlayConfig {
  return { ...config, [target]: next };
}

function DraggableMarker({
  point,
  viewBox,
  layout,
  color,
  label,
  onMove,
  onDelete,
}: {
  point: OverlayPoint;
  viewBox: HeroOverlayConfig["viewBox"];
  layout: { width: number; height: number };
  color: string;
  label: string;
  onMove: (next: OverlayPoint) => void;
  onDelete?: () => void;
}) {
  const x = (point.x / viewBox.width) * layout.width;
  const y = (point.y / viewBox.height) * layout.height;
  const startX = useSharedValue(x);
  const startY = useSharedValue(y);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = (point.x / viewBox.width) * layout.width;
      startY.value = (point.y / viewBox.height) * layout.height;
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      const nextX = startX.value + translateX.value;
      const nextY = startY.value + translateY.value;
      translateX.value = 0;
      translateY.value = 0;
      onMove(screenToViewBox(nextX, nextY, viewBox, layout.width, layout.height));
    });

  const gesture = onDelete
    ? Gesture.Simultaneous(pan, Gesture.LongPress().minDuration(450).onStart(onDelete))
    : pan;

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX.value + translateX.value - 18 },
      { translateY: startY.value + translateY.value - 18 },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.markerWrap, style]}>
        <View style={[styles.markerDot, { backgroundColor: color }]}>
          <View style={styles.markerCore} />
        </View>
        <Text style={styles.markerLabel}>{label}</Text>
      </Animated.View>
    </GestureDetector>
  );
}

export default function OverlayEditorScreen() {
  const insets = useSafeAreaInsets();
  const [sceneId, setSceneId] = useState<HeroSceneId>("night");
  const [target, setTarget] = useState<EditTarget>("grid");
  const [draft, setDraft] = useState<HeroOverlayConfig>(() => cloneConfig(HERO_OVERLAY_CONFIGS.night));
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const activePath = isWireTarget(target) ? draft[PATH_KEYS[target]] : null;
  const activeAnchor = !isWireTarget(target) ? getTargetPoint(draft, target) : null;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setLayout((current) => (
      current.width === width && current.height === height ? current : { width, height }
    ));
  }, []);

  const selectScene = useCallback((id: HeroSceneId) => {
    setSceneId(id);
    setDraft(cloneConfig(HERO_OVERLAY_CONFIGS[id]));
  }, []);

  const updateActivePoint = useCallback((index: number, next: OverlayPoint) => {
    if (!isWireTarget(target)) return;
    const pathKey = PATH_KEYS[target];
    setDraft((current) => {
      const points = [...current[pathKey]];
      points[index] = next;
      return { ...current, [pathKey]: points };
    });
  }, [target]);

  const deleteActivePoint = useCallback((index: number) => {
    if (!isWireTarget(target)) return;
    const pathKey = PATH_KEYS[target];
    setDraft((current) => ({
      ...current,
      [pathKey]: current[pathKey].filter((_, pointIndex) => pointIndex !== index),
    }));
  }, [target]);

  const placeTargetAt = useCallback((x: number, y: number) => {
    if (layout.width <= 0) return;
    const nextPoint = screenToViewBox(x, y, draft.viewBox, layout.width, layout.height);

    if (isWireTarget(target)) {
      const pathKey = PATH_KEYS[target];
      setDraft((current) => ({
        ...current,
        [pathKey]: [...current[pathKey], nextPoint],
      }));
      return;
    }

    setDraft((current) => updateTargetPoint(current, target, nextPoint));
  }, [draft.viewBox, layout.height, layout.width, target]);

  const appendPoint = useCallback(() => {
    if (!isWireTarget(target)) return;
    const pathKey = PATH_KEYS[target];
    const last = draft[pathKey][draft[pathKey].length - 1] ?? { x: 500, y: 500 };
    setDraft((current) => ({
      ...current,
      [pathKey]: [...current[pathKey], { x: last.x + 22, y: last.y }],
    }));
  }, [draft, target]);

  const clearActivePath = useCallback(() => {
    if (!isWireTarget(target)) return;
    const pathKey = PATH_KEYS[target];
    setDraft((current) => ({ ...current, [pathKey]: [] }));
  }, [target]);

  const exportJson = useCallback(async () => {
    const payload = JSON.stringify({ ...draft, id: sceneId }, null, 2);
    await Share.share({ message: payload, title: `${sceneId}.json` });
  }, [draft, sceneId]);

  const hintText = isWireTarget(target)
    ? "Tap to add a point. Drag a marker to move it. Long-press a marker to delete it."
    : "Tap anywhere to place the anchor, then drag to fine-tune it.";

  const activeMetaText = isWireTarget(target)
    ? `${activePath?.length ?? 0} points`
    : activeAnchor
      ? `x ${activeAnchor.x} · y ${activeAnchor.y}`
      : "No point selected";

  const pathPreview = useMemo(() => {
    if (!isWireTarget(target) || layout.width <= 0) return "";
    return pointsToPathD(activePath ?? [], draft.viewBox, layout.width, layout.height);
  }, [activePath, draft.viewBox, layout.height, layout.width, target]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={20} color="#EAF2FA" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Overlay Editor</Text>
          <Text style={styles.subtitle}>{sceneId} · {TARGET_LABELS[target]}</Text>
        </View>
        <Pressable onPress={exportJson} style={styles.iconBtn}>
          <Copy size={18} color="#7DD3FC" />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sceneRow}>
        {HERO_SCENE_LIST.map((id) => (
          <Pressable
            key={id}
            onPress={() => selectScene(id)}
            style={[styles.sceneChip, sceneId === id && styles.sceneChipActive]}
          >
            <Text style={[styles.sceneChipText, sceneId === id && styles.sceneChipTextActive]}>{id}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.sectionLabel}>Wires</Text>
      <View style={styles.targetRow}>
        {WIRE_TARGETS.map((wire) => (
          <Pressable
            key={wire}
            onPress={() => setTarget(wire)}
            style={[styles.targetChip, target === wire && { borderColor: TARGET_COLORS[wire] }]}
          >
            <View style={[styles.targetDot, { backgroundColor: TARGET_COLORS[wire] }]} />
            <Text style={styles.targetText}>{TARGET_LABELS[wire]}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Anchors</Text>
      <View style={[styles.targetRow, styles.anchorRow]}>
        {ANCHOR_TARGETS.map((anchor) => (
          <Pressable
            key={anchor}
            onPress={() => setTarget(anchor)}
            style={[styles.targetChip, target === anchor && { borderColor: TARGET_COLORS[anchor] }]}
          >
            <View style={[styles.targetDot, { backgroundColor: TARGET_COLORS[anchor] }]} />
            <Text style={styles.targetText}>{TARGET_LABELS[anchor]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.canvasWrap} onLayout={onLayout}>
        <Image
          source={HERO_SCENE_BACKGROUNDS[sceneId]}
          style={StyleSheet.absoluteFill}
          resizeMode="stretch"
        />
        {layout.width > 0 && (
          <>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={(event) => placeTargetAt(event.nativeEvent.locationX, event.nativeEvent.locationY)}
            />
            <Svg width={layout.width} height={layout.height} style={StyleSheet.absoluteFill} pointerEvents="none">
              {WIRE_TARGETS.map((wire) => {
                const points = draft[PATH_KEYS[wire]];
                const d = pointsToPathD(points, draft.viewBox, layout.width, layout.height);
                if (!d) return null;
                return (
                  <Path
                    key={wire}
                    d={d}
                    stroke={TARGET_COLORS[wire]}
                    strokeWidth={target === wire ? 3.8 : 2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    opacity={target === wire ? 0.95 : 0.38}
                  />
                );
              })}

              {ANCHOR_TARGETS.map((anchor) => {
                const point = draft[anchor];
                return (
                  <Circle
                    key={anchor}
                    cx={(point.x / draft.viewBox.width) * layout.width}
                    cy={(point.y / draft.viewBox.height) * layout.height}
                    r={target === anchor ? 6 : 4}
                    fill={TARGET_COLORS[anchor]}
                    opacity={target === anchor ? 0.95 : 0.7}
                  />
                );
              })}
            </Svg>

            {isWireTarget(target) && activePath?.map((point, index) => (
              <DraggableMarker
                key={`point-${index}`}
                point={point}
                viewBox={draft.viewBox}
                layout={layout}
                color={TARGET_COLORS[target]}
                label={String(index + 1)}
                onMove={(next) => updateActivePoint(index, next)}
                onDelete={() => deleteActivePoint(index)}
              />
            ))}

            {!isWireTarget(target) && activeAnchor && (
              <DraggableMarker
                point={activeAnchor}
                viewBox={draft.viewBox}
                layout={layout}
                color={TARGET_COLORS[target]}
                label={TARGET_LABELS[target]}
                onMove={(next) => setDraft((current) => updateTargetPoint(current, target, next))}
              />
            )}
          </>
        )}
      </View>

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.hint}>{hintText}</Text>
        <View style={styles.toolbarRow}>
          {isWireTarget(target) ? (
            <>
              <Pressable onPress={appendPoint} style={styles.toolBtn}>
                <Plus size={16} color="#EAF2FA" />
                <Text style={styles.toolBtnText}>Add</Text>
              </Pressable>
              <Pressable onPress={clearActivePath} style={styles.toolBtn}>
                <Trash2 size={16} color="#FCA5A5" />
                <Text style={[styles.toolBtnText, styles.toolBtnDanger]}>Clear</Text>
              </Pressable>
            </>
          ) : null}
          <Text style={styles.pointCount}>{activeMetaText}</Text>
        </View>
        {isWireTarget(target) && (
          <Text style={styles.pathStatus}>{pathPreview ? "Path ready for export" : "Path is empty"}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B1220" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 12,
  },
  headerTextWrap: { flex: 1 },
  title: { color: "#EAF2FA", fontFamily: "Outfit", fontSize: 17, fontWeight: "700" },
  subtitle: { color: "#94A3B8", fontFamily: "Outfit", fontSize: 11, marginTop: 2 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  sceneRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  sceneChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sceneChipActive: { backgroundColor: "rgba(125,211,252,0.15)", borderColor: "#7DD3FC" },
  sceneChipText: { color: "#94A3B8", fontFamily: "Outfit", fontSize: 12, fontWeight: "600" },
  sceneChipTextActive: { color: "#E0F2FE" },
  sectionLabel: {
    color: "#64748B",
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  targetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  anchorRow: { paddingBottom: 12 },
  targetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  targetDot: { width: 8, height: 8, borderRadius: 999 },
  targetText: { color: "#CBD5E1", fontFamily: "Outfit", fontSize: 11, fontWeight: "600" },
  canvasWrap: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    backgroundColor: "#020617",
  },
  markerWrap: { position: "absolute", alignItems: "center", width: 72 },
  markerDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#020617",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  markerCore: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  markerLabel: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(2,6,23,0.82)",
    color: "#E2E8F0",
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  toolbar: { paddingHorizontal: 14, paddingTop: 12 },
  hint: { color: "#94A3B8", fontFamily: "Outfit", fontSize: 12, lineHeight: 17 },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    minHeight: 40,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  toolBtnText: { color: "#EAF2FA", fontFamily: "Outfit", fontSize: 11, fontWeight: "700" },
  toolBtnDanger: { color: "#FCA5A5" },
  pointCount: {
    flex: 1,
    color: "#CBD5E1",
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  pathStatus: {
    color: "#64748B",
    fontFamily: "Outfit",
    fontSize: 11,
    paddingTop: 8,
  },
});
