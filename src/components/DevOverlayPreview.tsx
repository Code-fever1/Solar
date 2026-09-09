import { useEnergy } from "@/context/EnergyContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DeviceEventEmitter,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path, Polygon } from "react-native-svg";

const OVERLAY_ENABLED_KEY = "overlayEnabled";
export const OVERLAY_PREF_EVENT = "voltix-overlay-pref";

const SOLAR_COLOR = "#FBBF24";       // Warm amber
const HOME_COLOR = "#34D399";        // Vibrant mint emerald
const GRID_IMPORT_COLOR = "#EF4444"; // Red for import
const GRID_EXPORT_COLOR = "#38BDF8"; // Blue for export
const IDLE_COLOR = "#94A3B8";        // Muted slate
const ON_GRID_COLOR = "#38BDF8";

/**
 * Formats power according to clean minimal rules:
 * - Under 1000W: integer in W (e.g. 4W, 10W, 999W, 0W)
 * - 1000W and above: in kW with up to 2 decimals, trimming trailing zeros (e.g. 1kW, 1.05kW, 1.1kW, 1.9kW, 1.94kW)
 */
export function formatPowerParts(watts: number): { value: string; unit: string; full: string } {
  if (!Number.isFinite(watts)) {
    return { value: "0", unit: "W", full: "0W" };
  }
  const abs = Math.abs(watts);
  const roundedW = Math.round(abs);
  if (roundedW === 0) {
    return { value: "0", unit: "W", full: "0W" };
  }
  const sign = watts < 0 ? "-" : "";
  if (roundedW < 1000) {
    return { value: `${sign}${roundedW}`, unit: "W", full: `${sign}${roundedW}W` };
  }
  const kwNum = parseFloat((abs / 1000).toFixed(2));
  const kwStr = String(kwNum);
  return { value: `${sign}${kwStr}`, unit: "kW", full: `${sign}${kwStr}kW` };
}

function IconSun({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2.2" fill="none" />
      <Path
        d="M12,2 L12,4 M12,20 L12,22 M4.93,4.93 L6.34,6.34 M17.66,17.66 L19.07,19.07 M2,12 L4,12 M20,12 L22,12 M6.34,17.66 L4.93,19.07 M19.07,4.93 L17.66,6.34"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function IconHouse({ color, size = 11 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3,9.5 L12,2.5 L21,9.5 L21,20.5 A1.5,1.5 0 0,1 19.5,22 L4.5,22 A1.5,1.5 0 0,1 3,20.5 Z"
        stroke={color}
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M9,22 L9,13 L15,13 L15,22" stroke={color} strokeWidth="2" fill="none" />
    </Svg>
  );
}

function IconZap({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon
        points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function IconArrow({ dir, color, size = 8 }: { dir: "up" | "down" | "flat"; color: string; size?: number }) {
  if (dir === "flat") {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M5,12 L19,12" stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </Svg>
    );
  }
  const d = dir === "up" ? "M12,19 L12,5 M5,12 L12,5 L19,12" : "M12,5 L12,19 M5,12 L12,19 L19,12";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={d} stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * Single-Line Expandable HUD Overlay:
 * - Compact state (default): Shows only mini Grid (⚡ 1.xxkW ↓ in RED or ⚡ 1.xxkW ↑ in BLUE)
 * - Expanded state (tap): Expands on the exact same single line into full HUD (Solar, Home, Grid)
 * - Number formatting: Strictly 2 digits after decimal (1.xx kW)
 */
export function DevOverlayPreview() {
  const { inverter, tomznLive, gridFlow, ups, liveReady } = useEnergy();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Position state (clamped to screen boundaries)
  const [pos, setPos] = useState({ x: 12, y: 110 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragStart = useRef(pos);
  const isDragging = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(OVERLAY_ENABLED_KEY).then((v) => setEnabled(v === "true")).catch(() => undefined);
    const sub = DeviceEventEmitter.addListener(OVERLAY_PREF_EVENT, (v: boolean) => setEnabled(!!v));
    return () => sub.remove();
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      dragStart.current = posRef.current;
      isDragging.current = false;
    },
    onPanResponderMove: (_e, g) => {
      if (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4) {
        isDragging.current = true;
      }
      const newX = Math.max(8, Math.min(screenWidth - 70, dragStart.current.x - g.dx));
      const newY = Math.max(50, Math.min(screenHeight - 100, dragStart.current.y + g.dy));
      setPos({ x: newX, y: newY });
    },
    onPanResponderRelease: () => {
      // Drag released
    },
  }), [screenWidth, screenHeight]);

  const view = useMemo(() => {
    const mode = gridFlow?.mode || "hybrid";
    const direction = gridFlow?.direction || "idle";
    const solarW = Math.max(0, gridFlow?.solarW ?? inverter.solarW ?? 0);
    const homeW = Math.max(0, gridFlow?.homeW ?? 0);
    const tomznPowerW = Math.abs(tomznLive.powerW || 0);
    const exportOk = tomznPowerW <= solarW + 50;
    const effectiveDirection = direction === "export" && !exportOk ? "import" : direction;
    const gridDisplayW = effectiveDirection === "export"
      ? -Math.min(tomznPowerW, solarW)
      : effectiveDirection === "import" ? tomznPowerW : 0;

    const fault = tomznLive.faultCode || 0;
    const wapdaCutOff = fault === 2048 || fault === 8192;
    const gridUnavailable = !tomznLive.isOnline || wapdaCutOff;
    const inverterOffline = inverter.isOnline === false;
    const bothOffline = inverterOffline && gridUnavailable;
    const isBypass = mode === "bypass";

    const solarParts = formatPowerParts(solarW);
    const homeParts = formatPowerParts(homeW);
    const gridParts = formatPowerParts(gridDisplayW);

    const solarColor = solarW > 0 ? SOLAR_COLOR : IDLE_COLOR;
    const homeColor = homeW > 0 ? (mode === "on-grid" ? ON_GRID_COLOR : HOME_COLOR) : IDLE_COLOR;

    // Grid colors: all unified red for import, all unified blue for export
    let gridColor = IDLE_COLOR;
    let arrow: "up" | "down" | "flat" = "flat";
    let glowBorderColor = "rgba(255, 255, 255, 0.14)";

    if (effectiveDirection === "import") {
      gridColor = GRID_IMPORT_COLOR;
      arrow = "down";
      glowBorderColor = "rgba(239, 68, 68, 0.45)";
    } else if (effectiveDirection === "export") {
      gridColor = GRID_EXPORT_COLOR;
      arrow = "up";
      glowBorderColor = "rgba(56, 189, 248, 0.45)";
    }

    let status: { text: string; color: string } | null = null;
    if (bothOffline) {
      if (ups) {
        status = ups.active ? { text: "UPS", color: "#FBBF24" } : { text: "PWR CUT", color: "#EF4444" };
      } else {
        status = { text: "OFFLINE", color: IDLE_COLOR };
      }
    }

    const showSolar = !bothOffline && !isBypass;
    const showHome = !bothOffline && !isBypass;
    const showGrid = !bothOffline && !gridUnavailable;

    return {
      liveReady,
      solarW, homeW, gridDisplayW,
      solarParts, homeParts, gridParts,
      solarColor, homeColor, gridColor, arrow,
      glowBorderColor,
      showSolar, showHome, showGrid, status,
      isExport: effectiveDirection === "export",
      isImport: effectiveDirection === "import",
    };
  }, [gridFlow, inverter, tomznLive, ups, liveReady]);

  // In-app HUD is a Metro/dev stand-in only. Release APK uses the native overlay.
  if (!__DEV__ || !enabled) return null;

  const handlePress = () => {
    if (!isDragging.current) {
      setExpanded((prev) => !prev);
    }
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        {...pan.panHandlers}
        style={[
          styles.container,
          { right: pos.x, top: pos.y },
        ]}
      >
        <Pressable
          onPress={handlePress}
          style={[
            styles.singleLineCapsule,
            { borderColor: view.glowBorderColor },
            expanded && styles.expandedCapsule,
          ]}
        >
          {view.status ? (
            <View style={styles.statusRow}>
              <View style={[styles.statusPulseDot, { backgroundColor: view.status.color }]} />
              <Text style={[styles.statusBadgeText, { color: view.status.color }]}>
                {view.status.text}
              </Text>
            </View>
          ) : (
            <>
              {/* ============================================== */}
              {/* EXPANDED EXTRA: Solar & Home (on same line)    */}
              {/* ============================================== */}
              {expanded ? (
                <>
                  {/* Solar */}
                  {view.showSolar ? (
                    <View style={styles.metricNode}>
                      <View style={[styles.iconBox, { backgroundColor: "rgba(251,191,36,0.12)" }]}>
                        <IconSun color={view.solarColor} size={10} />
                      </View>
                      <View style={styles.metricValueWrap}>
                        <Text style={[styles.metricNumber, { color: view.solarColor }]}>
                          {view.liveReady ? view.solarParts.value : "--"}
                        </Text>
                        <Text style={[styles.metricUnit, { color: view.solarColor }]}>
                          {view.solarParts.unit}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Micro Divider */}
                  {view.showSolar && view.showHome ? <View style={styles.microDivider} /> : null}

                  {/* Home */}
                  {view.showHome ? (
                    <View style={styles.metricNode}>
                      <View style={[styles.iconBox, { backgroundColor: "rgba(52,211,153,0.12)" }]}>
                        <IconHouse color={view.homeColor} size={10} />
                      </View>
                      <View style={styles.metricValueWrap}>
                        <Text style={[styles.metricNumber, { color: view.homeColor }]}>
                          {view.liveReady ? view.homeParts.value : "--"}
                        </Text>
                        <Text style={[styles.metricUnit, { color: view.homeColor }]}>
                          {view.homeParts.unit}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Micro Divider */}
                  {view.showHome && view.showGrid ? <View style={styles.microDivider} /> : null}
                </>
              ) : null}

              {/* ============================================== */}
              {/* WAPDA GRID: Always visible in both states      */}
              {/* Entirely unified RED on import, BLUE on export */}
              {/* ============================================== */}
              {view.showGrid ? (
                <View style={styles.metricNode}>
                  <View
                    style={[
                      styles.iconBox,
                      {
                        backgroundColor:
                          view.isExport
                            ? "rgba(56,189,248,0.16)"
                            : view.isImport
                            ? "rgba(239,68,68,0.16)"
                            : "rgba(148,163,184,0.1)",
                      },
                    ]}
                  >
                    <IconZap color={view.gridColor} size={10} />
                  </View>
                  <View style={styles.metricValueWrap}>
                    <Text style={[styles.metricNumber, { color: view.gridColor }]}>
                      {view.liveReady ? view.gridParts.value : "--"}
                    </Text>
                    <Text style={[styles.metricUnit, { color: view.gridColor }]}>
                      {view.gridParts.unit}
                    </Text>
                    <View style={styles.arrowWrap}>
                      <IconArrow dir={view.arrow} color={view.gridColor} size={8} />
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    zIndex: 99999,
    elevation: 20,
  },
  singleLineCapsule: {
    flexDirection: "row",
    alignItems: "center",
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: "rgba(10, 14, 24, 0.92)",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 16,
  },
  expandedCapsule: {
    paddingHorizontal: 8,
  },
  metricNode: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  iconBox: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 3,
  },
  metricValueWrap: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  metricNumber: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  metricUnit: {
    fontSize: 7,
    fontWeight: "700",
    marginLeft: 1,
    opacity: 0.8,
    includeFontPadding: false,
  },
  arrowWrap: {
    marginLeft: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  microDivider: {
    width: 1,
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    marginHorizontal: 3,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  statusPulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});

