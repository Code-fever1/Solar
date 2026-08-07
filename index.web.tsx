// Web entry point — loads CanvasKit WASM BEFORE the app bundle evaluates.
// Skia's module-level code (Skia.web.js) accesses global.CanvasKit at import
// time, so LoadSkiaWeb() must complete before any @shopify/react-native-skia
// import is evaluated. This deferred registration ensures that.
import "@expo/metro-runtime";
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

LoadSkiaWeb({ locateFile: () => "/canvaskit.wasm" })
  .then(() => {
    // CanvasKit is now on global.CanvasKit — safe to evaluate Skia imports.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { App } = require("expo-router/build/qualified-entry");
    const { renderRootComponent } = require("expo-router/build/renderRootComponent");
    renderRootComponent(App);
  })
  .catch((err: unknown) => {
    console.error("[Skia Web] CanvasKit failed to load", err);
    // Still render the app so the user sees something instead of a blank screen.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { App } = require("expo-router/build/qualified-entry");
    const { renderRootComponent } = require("expo-router/build/renderRootComponent");
    renderRootComponent(App);
  });
