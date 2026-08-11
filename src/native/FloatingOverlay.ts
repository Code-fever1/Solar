import { NativeModules, Platform } from "react-native";

// Native module bridged from FloatingOverlayModule.kt
// The floating overlay is a native Android foreground service that draws a
// mini live-data widget (solar / home / grid kW) over other apps when the
// Voltix app is backgrounded. It polls /api/solar/live every 5 seconds
// independently — no 30s dashboard sync needed while the overlay is active.
//
// On iOS this is a no-op (Android-only feature).
const { FloatingOverlay } = NativeModules;

export type OverlayStatus = {
  hasPermission: boolean;
  isActive: boolean;
};

export async function hasOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !FloatingOverlay) return false;
  return FloatingOverlay.hasOverlayPermission();
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (Platform.OS !== "android" || !FloatingOverlay) return false;
  return FloatingOverlay.requestOverlayPermission();
}

export async function startOverlay(apiUrl: string): Promise<boolean> {
  if (Platform.OS !== "android" || !FloatingOverlay) return false;
  return FloatingOverlay.startOverlay(apiUrl);
}

export async function stopOverlay(): Promise<boolean> {
  if (Platform.OS !== "android" || !FloatingOverlay) return false;
  return FloatingOverlay.stopOverlay();
}

export async function isOverlayActive(): Promise<boolean> {
  if (Platform.OS !== "android" || !FloatingOverlay) return false;
  return FloatingOverlay.isOverlayActive();
}

export async function ensureOverlayPermission(): Promise<boolean> {
  const has = await hasOverlayPermission();
  if (has) return true;
  return requestOverlayPermission();
}
