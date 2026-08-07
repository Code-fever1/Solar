import { BlurView } from "expo-blur";
import { memo } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

import { useSceneTheme } from "@/context/SceneThemeContext";

// Module-level helper — avoids re-creating the function on every render.
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/**
 * GlassCard — a glassmorphism container.
 *
 * By default (`blur={false}`) uses only semi-transparent scene-tinted washes
 * — this is safe inside ScrollViews and performs well on all platforms.
 *
 * Set `blur={true}` for cards OUTSIDE ScrollViews (tab bar, modals, floating
 * overlays) to enable real expo-blur backdrop blur. BlurView inside a
 * ScrollView causes major FPS drops on iOS due to offscreen rendering on
 * every scroll frame.
 *
 * Layers (bottom to top):
 *   1. BlurView (only when blur=true) — real frosted glass on iOS
 *   2. Scene-tinted wash — seam color at low opacity, ties glass to wallpaper
 *   3. White wash — subtle brightness that makes the glass readable
 *   4. Top inner glow — light catching the top edge
 *   5. Border rim — subtle white outline
 *
 * Children render on top with zIndex.
 */
export const GlassCard = memo(function GlassCard({
  children,
  style,
  blur = false,
  intensity = 40,
  tintAmount = 0.18,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  blur?: boolean;
  intensity?: number;
  tintAmount?: number;
}) {
  const { sheetColors, isLight } = useSceneTheme();
  const { seam } = sheetColors;

  // On light scenes (fog, morning-cloud), use dark overlays instead of white
  // so the glass surface stays readable with dark text.
  const washColor = isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)";
  const glowColor = isLight ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.12)";
  const rimColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)";
  const blurTint = isLight ? "light" : "dark";

  return (
    <View style={[styles.container, style]}>
      {blur && (
        <BlurView
          intensity={intensity}
          tint={blurTint as any}
          style={StyleSheet.absoluteFill}
          blurMethod={Platform.OS === "android" ? "none" : undefined}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(seam, tintAmount) }]} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]} />
      <View style={[styles.topGlow, { borderTopColor: glowColor }]} />
      <View style={[styles.rim, { borderColor: rimColor }]} />
      <View style={styles.content}>{children}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 8,
    right: 8,
    height: 1,
    borderTopWidth: 1,
    borderRadius: 0.5,
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
