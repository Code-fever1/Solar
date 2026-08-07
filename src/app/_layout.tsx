import {
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import { ShareTechMono_400Regular } from "@expo-google-fonts/share-tech-mono";
import { useFonts } from "expo-font";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { EnergyProvider } from "@/context/EnergyContext";
import { SceneThemeProvider } from "@/context/SceneThemeContext";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_700Bold,
    ShareTechMono_400Regular,
  });

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
