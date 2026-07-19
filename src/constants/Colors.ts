export const Colors = {
  light: {
    text: "#F4F5F8",
    textSecondary: "#8A94A6",
    textMuted: "#5C6578",
    background: "#050505", // Deep Space Black
    backgroundElement: "rgba(255, 255, 255, 0.03)", // Translucent Glass
    backgroundElevated: "rgba(255, 255, 255, 0.06)", // Elevated Glass
    backgroundSelected: "rgba(255, 255, 255, 0.1)",
    border: "rgba(255, 255, 255, 0.05)",
    borderStrong: "rgba(255, 255, 255, 0.12)",
    borderGlow: "rgba(255, 255, 255, 0.2)",
    shadow: "rgba(0, 0, 0, 0.6)",
    solar: "#FFD60A", // Tesla Solar Yellow
    solarSoft: "rgba(255, 214, 10, 0.15)",
    solarGlow: "rgba(255, 214, 10, 0.3)",
    load: "#00E5FF", // Electric Cyan
    loadSoft: "rgba(0, 229, 255, 0.15)",
    loadGlow: "rgba(0, 229, 255, 0.3)",
    grid: "#FF3B30", // Danger Red
    gridSoft: "rgba(255, 59, 48, 0.15)",
    gridGlow: "rgba(255, 59, 48, 0.3)",
    export: "#34C759", // Apple Green
    exportSoft: "rgba(52, 199, 89, 0.15)",
    exportGlow: "rgba(52, 199, 89, 0.3)",
    meter: "#BF5AF2", // Apple Purple
    meterSoft: "rgba(191, 90, 242, 0.15)",
    success: "#34C759",
    warning: "#FF9F0A",
    critical: "#FF3B30",
    info: "#0A84FF",
  },
  dark: {
    text: "#F4F5F8",
    textSecondary: "#8A94A6",
    textMuted: "#5C6578",
    background: "#050505", // Deep Space Black
    backgroundElement: "rgba(255, 255, 255, 0.03)", // Translucent Glass
    backgroundElevated: "rgba(255, 255, 255, 0.06)", // Elevated Glass
    backgroundSelected: "rgba(255, 255, 255, 0.1)",
    border: "rgba(255, 255, 255, 0.05)",
    borderStrong: "rgba(255, 255, 255, 0.12)",
    borderGlow: "rgba(255, 255, 255, 0.2)",
    shadow: "rgba(0, 0, 0, 0.6)",
    solar: "#FFD60A", // Tesla Solar Yellow
    solarSoft: "rgba(255, 214, 10, 0.15)",
    solarGlow: "rgba(255, 214, 10, 0.3)",
    load: "#00E5FF", // Electric Cyan
    loadSoft: "rgba(0, 229, 255, 0.15)",
    loadGlow: "rgba(0, 229, 255, 0.3)",
    grid: "#FF3B30", // Danger Red
    gridSoft: "rgba(255, 59, 48, 0.15)",
    gridGlow: "rgba(255, 59, 48, 0.3)",
    export: "#34C759", // Apple Green
    exportSoft: "rgba(52, 199, 89, 0.15)",
    exportGlow: "rgba(52, 199, 89, 0.3)",
    meter: "#BF5AF2", // Apple Purple
    meterSoft: "rgba(191, 90, 242, 0.15)",
    success: "#34C759",
    warning: "#FF9F0A",
    critical: "#FF3B30",
    info: "#0A84FF",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
