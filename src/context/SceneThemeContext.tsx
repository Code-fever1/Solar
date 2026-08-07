import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useEnergy } from "@/context/EnergyContext";
import {
  HERO_OVERLAY_CONFIGS,
  HERO_SCENE_BACKGROUNDS,
  HERO_SCENE_LIST,
  HERO_SCENE_SHEET_COLORS,
  resolveHeroScene,
} from "@/overlay/heroScenes";
import type { CardTheme } from "@/components/NewDashboardCards";
import type { HeroScene, HeroSceneId } from "@/overlay/types";

// Full scene-tinted theme — extends CardTheme with screen-level tokens used
// across all screens (screenBg, border, borderStrong, inputBg, etc).
export type SceneTheme = CardTheme & {
  screenBg: string;
  border: string;
  borderStrong: string;
  inputBg: string;
  inputBorder: string;
  pillBg: string;
  backgroundElement: string;
  isLightScene: boolean;
};

// Build a full scene-tinted theme from the active wallpaper's seam color.
// Card bg = seam × 0.42 (dark enough for light text on all 6 scenes).
// Screen bg = seam × 0.22 (darker than cards, gives depth).
// Text colors adapt based on seam luminance — light scenes (fog, morning-cloud)
// use darker text so it's readable through glassmorphism cards; dark scenes
// (night) keep bright text.
function makeSceneTheme(seam: [number, number, number]): SceneTheme {
  const d42 = (v: number) => Math.round(v * 0.42);
  const d22 = (v: number) => Math.round(v * 0.22);
  const [r, g, b] = seam;

  // Compute relative luminance — determines if the scene is "light" or "dark".
  // Glass cards blur the background, so on light scenes the blurred surface
  // is lighter and needs darker text for contrast.
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const isLightScene = luminance > 0.4; // fog (0.48), morning-cloud (0.56)

  // Text colors: darker for light scenes, lighter for dark scenes.
  // On glassmorphism, the effective background is a blend of the blurred
  // wallpaper + seam wash, so we need sufficient contrast.
  const textPrimary = isLightScene ? "#1A2332" : "#F8FAFC";
  const textSecondary = isLightScene ? "#475569" : "#CBD5E1";
  const textMuted = isLightScene ? "#64748B" : "#94A3B8";

  // Element colors: use dark overlays on light scenes, light overlays on dark.
  const overlayBase = isLightScene ? "0,0,0" : "255,255,255";

  return {
    // CardTheme keys
    cardBg: `rgb(${d42(r)},${d42(g)},${d42(b)})`,
    cardBorder: `rgba(${overlayBase},0.08)`,
    cardHighlight: `rgba(${overlayBase},0.06)`,
    cardShadow: "rgba(0,0,0,0.5)",
    textPrimary,
    textSecondary,
    textMuted,
    trackBg: `rgba(${overlayBase},0.05)`,
    overlayBg: `rgba(${overlayBase},0.04)`,
    overlayBorder: `rgba(${overlayBase},0.06)`,
    svgGridLine: `rgba(${overlayBase},${isLightScene ? 0.12 : 0.04})`,
    svgTrack: `rgba(${overlayBase},0.06)`,
    // Screen-level keys
    screenBg: `rgb(${d22(r)},${d22(g)},${d22(b)})`,
    border: `rgba(${overlayBase},0.06)`,
    borderStrong: `rgba(${overlayBase},0.12)`,
    inputBg: `rgba(${overlayBase},0.05)`,
    inputBorder: `rgba(${overlayBase},0.1)`,
    pillBg: `rgba(${overlayBase},0.06)`,
    backgroundElement: `rgba(${overlayBase},0.03)`,
    isLightScene,
  };
}

// Alias keys to match Colors.dark naming (so screens can use theme.text,
// theme.card, theme.cardBorder, etc. without changing every reference).
// SceneTheme uses CardTheme names (textPrimary, cardBg, etc.) but existing
// screens use Colors.dark names (text, card, cardBorder, etc.). We provide
// both via the context value.
export type SceneThemeContextValue = {
  // CardTheme-style keys (used by NewDashboardCards)
  cardTheme: CardTheme;
  // Colors.dark-style keys (used by all other screens)
  text: string;
  textSecondary: string;
  textMuted: string;
  card: string;
  cardBorder: string;
  cardHighlight: string;
  cardShadow: string;
  screenBg: string;
  border: string;
  borderStrong: string;
  overlayBg: string;
  overlayBorder: string;
  inputBg: string;
  inputBorder: string;
  pillBg: string;
  backgroundElement: string;
  trackBg: string;
  svgGridLine: string;
  svgTrack: string;
  // Additional Colors keys used by themed-text/themed-view/explore
  background: string;
  backgroundElevated: string;
  backgroundSelected: string;
  borderGlow: string;
  shadow: string;
  solar: string;
  solarSoft: string;
  solarGlow: string;
  load: string;
  loadSoft: string;
  loadGlow: string;
  grid: string;
  gridSoft: string;
  gridGlow: string;
  export: string;
  exportSoft: string;
  exportGlow: string;
  meter: string;
  meterSoft: string;
  success: string;
  warning: string;
  critical: string;
  info: string;
  // Scene info
  heroScene: HeroScene;
  sheetColors: { seam: [number, number, number]; sky: [number, number, number]; mid: [number, number, number] };
  // Sheet gradient — the same seam→mid→sky gradient used on the home page's
  // scrollable sheet. Exposed so all screens can use it as their background.
  sheetGradient: { colors: string[]; locations: number[] };
  // Manual scene cycling
  manualSceneIndex: number | null;
  cycleScene: () => void;
  // Always false — app is always dark now
  isLight: boolean;
};

const SceneThemeContext = createContext<SceneThemeContextValue | null>(null);

/**
 * Returns a "tick" number that increments every minute and whenever the app
 * returns to the foreground. This forces time-dependent memos (like scene
 * selection) to re-evaluate even while the app was backgrounded for hours.
 */
function useSceneTick() {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const startTimer = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => setTick((t) => t + 1), 60_000);
    };
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        // App returned to foreground — immediately re-evaluate the scene.
        setTick((t) => t + 1);
        startTimer();
      } else {
        // App backgrounded — stop the timer to save battery.
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    startTimer();
    return () => {
      sub.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return tick;
}

export function SceneThemeProvider({ children }: { children: ReactNode }) {
  const { weather } = useEnergy();
  const [manualSceneIndex, setManualSceneIndex] = useState<number | null>(null);
  const sceneTick = useSceneTick();

  const cycleScene = () => {
    setManualSceneIndex((prev) => {
      if (prev === null) return 0;
      return prev + 1 >= HERO_SCENE_LIST.length ? null : prev + 1;
    });
  };

  const heroScene = useMemo<HeroScene>(() => {
    if (manualSceneIndex !== null) {
      const id = HERO_SCENE_LIST[manualSceneIndex];
      return { id, source: HERO_SCENE_BACKGROUNDS[id], overlay: HERO_OVERLAY_CONFIGS[id] };
    }
    return resolveHeroScene(weather);
    // sceneTick forces re-evaluation every minute and on foreground return
  }, [manualSceneIndex, weather.code, weather.sunrise, weather.sunset, weather.isDay, sceneTick]);

  const sheetColors = HERO_SCENE_SHEET_COLORS[heroScene.id];
  const theme = useMemo(() => makeSceneTheme(sheetColors.seam), [sheetColors]);

  // Sheet gradient — same as the home page's scrollable sheet:
  // seam (semi-transparent) → seam (near-opaque) → mid → sky.
  // This is the "perfect" background the user sees when scrolled up on Home.
  const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const sheetGradient = useMemo(() => ({
    colors: [
      rgba(sheetColors.seam, 0.55),
      rgba(sheetColors.seam, 0.88),
      rgba(sheetColors.mid, 1),
      rgba(sheetColors.sky, 1),
    ],
    locations: [0, 0.12, 0.32, 1],
  }), [sheetColors]);

  const value = useMemo<SceneThemeContextValue>(() => ({
    cardTheme: {
      cardBg: theme.cardBg,
      cardBorder: theme.cardBorder,
      cardHighlight: theme.cardHighlight,
      cardShadow: theme.cardShadow,
      textPrimary: theme.textPrimary,
      textSecondary: theme.textSecondary,
      textMuted: theme.textMuted,
      trackBg: theme.trackBg,
      overlayBg: theme.overlayBg,
      overlayBorder: theme.overlayBorder,
      svgGridLine: theme.svgGridLine,
      svgTrack: theme.svgTrack,
    },
    // Colors.dark-style aliases
    text: theme.textPrimary,
    textSecondary: theme.textSecondary,
    textMuted: theme.textMuted,
    card: theme.cardBg,
    cardBorder: theme.cardBorder,
    cardHighlight: theme.cardHighlight,
    cardShadow: theme.cardShadow,
    screenBg: theme.screenBg,
    border: theme.border,
    borderStrong: theme.borderStrong,
    overlayBg: theme.overlayBg,
    overlayBorder: theme.overlayBorder,
    inputBg: theme.inputBg,
    inputBorder: theme.inputBorder,
    pillBg: theme.pillBg,
    backgroundElement: theme.backgroundElement,
    trackBg: theme.trackBg,
    svgGridLine: theme.svgGridLine,
    svgTrack: theme.svgTrack,
    // Additional Colors keys (accent colors are constant across scenes)
    background: theme.screenBg,
    backgroundElevated: "rgba(255,255,255,0.06)",
    backgroundSelected: "rgba(255,255,255,0.1)",
    borderGlow: "rgba(255,255,255,0.2)",
    shadow: "rgba(0,0,0,0.8)",
    solar: "#F59E0B",
    solarSoft: "rgba(245,158,11,0.15)",
    solarGlow: "rgba(245,158,11,0.3)",
    load: "#0EA5E9",
    loadSoft: "rgba(14,165,233,0.15)",
    loadGlow: "rgba(14,165,233,0.3)",
    grid: "#FF3B30",
    gridSoft: "rgba(255,59,48,0.15)",
    gridGlow: "rgba(255,59,48,0.3)",
    export: "#10B981",
    exportSoft: "rgba(16,185,129,0.15)",
    exportGlow: "rgba(16,185,129,0.3)",
    meter: "#BF5AF2",
    meterSoft: "rgba(191,90,242,0.15)",
    success: "#10B981",
    warning: "#FF9F0A",
    critical: "#FF3B30",
    info: "#0A84FF",
    // Scene info
    heroScene,
    sheetColors,
    sheetGradient,
    manualSceneIndex,
    cycleScene,
    isLight: theme.isLightScene,
  }), [theme, heroScene, sheetColors, sheetGradient, manualSceneIndex]);

  return <SceneThemeContext.Provider value={value}>{children}</SceneThemeContext.Provider>;
}

export function useSceneTheme(): SceneThemeContextValue {
  const ctx = useContext(SceneThemeContext);
  if (!ctx) throw new Error("useSceneTheme must be used within SceneThemeProvider");
  return ctx;
}
