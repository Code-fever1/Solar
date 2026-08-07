import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { useSceneTheme } from "@/context/SceneThemeContext";

/**
 * SceneBackground — renders the same seam→mid→sky gradient used on the home
 * page's scrollable sheet, as a full-screen background for any screen.
 *
 * The gradient starts at the seam color (semi-transparent, so any content
 * behind it can peek through) and transitions to the sky color at the bottom,
 * matching the wallpaper's color palette for the active scene.
 *
 * Usage: place as the first child of a screen's root View (with absoluteFill).
 */
export function SceneBackground({ style }: { style?: ViewStyle }) {
  const { sheetGradient } = useSceneTheme();
  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={sheetGradient.colors as [string, string, ...string[]]}
        locations={sheetGradient.locations as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
