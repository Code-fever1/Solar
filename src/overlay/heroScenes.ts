import type { WeatherState } from "@/context/energy-types";
import type { HeroOverlayConfig, HeroScene, HeroSceneId } from "./types";

import cloudsDarkOverlay from "./configs/clouds-dark.json";
import eveningOverlay from "./configs/evening.json";
import fogOverlay from "./configs/fog.json";
import morningCloudOverlay from "./configs/morning-cloud.json";
import nightOverlay from "./configs/night.json";
import rainLightOverlay from "./configs/rain-light.json";

export const HERO_SCENE_BACKGROUNDS: Record<HeroSceneId, number> = {
  night: require("@/assets/images/z-night.jpeg"),
  "rain-light": require("@/assets/images/z-rain-light.jpeg"),
  "clouds-dark": require("@/assets/images/z-clouds-dark.jpeg"),
  fog: require("@/assets/images/z-fog.jpeg"),
  evening: require("@/assets/images/z-evening.jpeg"),
  "morning-cloud": require("@/assets/images/z-morning-cloud.jpeg"),
};

export const HERO_OVERLAY_CONFIGS: Record<HeroSceneId, HeroOverlayConfig> = {
  night: nightOverlay as HeroOverlayConfig,
  "rain-light": rainLightOverlay as HeroOverlayConfig,
  "clouds-dark": cloudsDarkOverlay as HeroOverlayConfig,
  fog: fogOverlay as HeroOverlayConfig,
  evening: eveningOverlay as HeroOverlayConfig,
  "morning-cloud": morningCloudOverlay as HeroOverlayConfig,
};

export const HERO_SCENE_LIST: HeroSceneId[] = [
  "night",
  "rain-light",
  "clouds-dark",
  "fog",
  "evening",
  "morning-cloud",
];

// Per-scene sheet gradient colors, sampled directly from each background
// image. `seam` is the average color at ~49% image height (where the
// scrollable sheet's top edge meets the image); `sky` is the average color
// of the top ~8% (the sky region). `mid` is the midpoint used for the
// transition stop. The scrollable sheet gradient starts at the seam color
// (so it emerges seamlessly from the image) and shifts toward the sky tone
// going down, blending the sheet into the scene vertically.
export const HERO_SCENE_SHEET_COLORS: Record<HeroSceneId, {
  seam: [number, number, number];
  sky: [number, number, number];
  mid: [number, number, number];
}> = {
  night:           { seam: [26, 35, 53],    sky: [6, 21, 45],    mid: [16, 28, 49] },
  "rain-light":    { seam: [83, 83, 83],    sky: [167, 174, 184], mid: [125, 128, 133] },
  "clouds-dark":   { seam: [104, 103, 104], sky: [102, 107, 116], mid: [103, 105, 110] },
  fog:             { seam: [122, 122, 126], sky: [175, 185, 198], mid: [148, 153, 162] },
  evening:         { seam: [120, 95, 80],   sky: [172, 144, 139], mid: [146, 119, 109] },
  "morning-cloud": { seam: [148, 142, 140], sky: [125, 159, 198], mid: [136, 150, 169] },
};

/** Pick background + overlay config from live weather/time. */
export function resolveHeroScene(weather: WeatherState): HeroScene {
  const id = resolveHeroSceneId(weather);
  return {
    id,
    source: HERO_SCENE_BACKGROUNDS[id],
    overlay: HERO_OVERLAY_CONFIGS[id],
  };
}

export function resolveHeroSceneId(weather: WeatherState): HeroSceneId {
  const code = weather.code || 0;
  const sunriseMs = weather.sunrise ? new Date(weather.sunrise).getTime() : null;
  const sunsetMs = weather.sunset ? new Date(weather.sunset).getTime() : null;
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const hour = now.getHours();
  // 20-minute window around sunset for the evening scene.
  const EVENING_WINDOW_MS = 20 * 60_000;

  // Determine time phase from sunrise/sunset (most accurate).
  // When they're missing (e.g. EMPTY_WEATHER fallback before backend responds),
  // derive day/night from the local hour instead of weather.isDay — the default
  // EMPTY_WEATHER ships isDay=true, which would incorrectly show daytime scenes
  // at night. The device local hour is reliable for this app's Pakistan users.
  let phase: "night" | "day" | "evening";
  if (sunriseMs && sunsetMs) {
    if (nowMs < sunriseMs) {
      phase = "night";
    } else if (nowMs >= sunsetMs - EVENING_WINDOW_MS && nowMs < sunsetMs + EVENING_WINDOW_MS) {
      phase = "evening";
    } else if (nowMs >= sunsetMs + EVENING_WINDOW_MS) {
      phase = "night";
    } else {
      phase = "day";
    }
  } else {
    if (hour >= 5 && hour < 18) phase = "day";
    else if (hour >= 18 && hour < 19) phase = "evening";
    else phase = "night";
  }

  // Night phase: always night, no weather override.
  if (phase === "night") return "night";

  // Day or evening phase: check weather with priority fog > rain > clouds.
  // WMO weather codes (Open-Meteo):
  //   Fog: 45, 48
  //   Rain: 51-57 (drizzle), 61-67 (rain), 80-82 (rain showers), 95-99 (thunderstorm)
  //   Clouds: 1-3 (mainly clear, partly cloudy, overcast)
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return "rain-light";
  if (code >= 1 && code <= 3) return "clouds-dark";

  // No weather override — use time-based default.
  if (phase === "evening") return "evening";
  return "morning-cloud";
}

export function getOverlayConfig(sceneId: HeroSceneId): HeroOverlayConfig {
  return HERO_OVERLAY_CONFIGS[sceneId];
}
