import {
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import { ShareTechMono_400Regular } from "@expo-google-fonts/share-tech-mono";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { EnergyProvider } from "@/context/EnergyContext";
import { SceneThemeProvider } from "@/context/SceneThemeContext";
import { ensureOverlayPermission, startOverlay, stopOverlay } from "@/native/FloatingOverlay";

const OVERLAY_API_URL = "http://104.43.56.204:3001/api/solar/live";
const OVERLAY_ENABLED_KEY = "overlayEnabled";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    ShareTechMono_400Regular,
  });
  const overlayStartedRef = useRef(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
    // Safety fallback: never get stuck on splash screen for more than 3 seconds
    const timer = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 3000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  // ── Floating overlay: starts when app goes to background, stops on foreground ──
  // The overlay is a native Android foreground service that draws a mini widget
  // (solar / home / grid kW) over other apps. It polls /api/solar/live every 5s
  // independently — no 30s dashboard sync needed while the overlay is active.
  // On iOS this is a no-op (the native module doesn't exist).
  // The overlay only starts if the user has enabled it in Settings (stored in
  // AsyncStorage under "overlayEnabled"). Default is OFF so the overlay doesn't
  // appear unless the user explicitly turns it on.
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let permissionGranted = false;

    const checkPermission = async () => {
      permissionGranted = await ensureOverlayPermission();
    };
    void checkPermission();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        // App minimized — start the floating overlay only if the user has enabled it
        if (permissionGranted && !overlayStartedRef.current) {
          void AsyncStorage.getItem(OVERLAY_ENABLED_KEY).then((v) => {
            if (v === "true" && !overlayStartedRef.current) {
              void startOverlay(OVERLAY_API_URL).then(() => {
                overlayStartedRef.current = true;
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      } else if (nextAppState === "active") {
        // App back to foreground — stop the floating overlay
        if (overlayStartedRef.current) {
          void stopOverlay().then(() => {
            overlayStartedRef.current = false;
          }).catch(() => {
            overlayStartedRef.current = false;
          });
        }
      }
    });

    return () => {
      subscription.remove();
      if (overlayStartedRef.current) {
        void stopOverlay().catch(() => {});
        overlayStartedRef.current = false;
      }
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <ThemeProvider value={DarkTheme}>
          <EnergyProvider>
          <SceneThemeProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B0F1A" } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="overlay-editor" options={{ animation: "slide_from_right" }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </SceneThemeProvider>
          </EnergyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
