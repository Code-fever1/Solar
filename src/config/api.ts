/**
 * Solar API origin used by the dashboard and the Android overlay.
 *
 * Expo inlines EXPO_PUBLIC_* from the project .env when the bundle is built.
 * Set EXPO_PUBLIC_API_HOST to the server host. The port stays 3001 and the
 * path stays /api/solar unless EXPO_PUBLIC_SOLAR_API_URL overrides the base.
 * See .env.example.
 */

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function hostOnly(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  return withoutScheme.split("/")[0]?.split(":")[0]?.trim() ?? "";
}

export function solarApiUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_SOLAR_API_URL ?? "").trim();
  if (explicit) return stripTrailingSlashes(explicit);
  const host = hostOnly(process.env.EXPO_PUBLIC_API_HOST);
  if (!host) return "";
  const port = (process.env.EXPO_PUBLIC_API_PORT ?? "").trim() || "3001";
  return `http://${host}:${port}/api/solar`;
}

export function solarLiveUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_SOLAR_LIVE_URL ?? "").trim();
  if (explicit) return stripTrailingSlashes(explicit);
  const base = solarApiUrl();
  return base ? `${base}/live` : "";
}

export const SOLAR_API_URL = solarApiUrl();
export const SOLAR_LIVE_URL = solarLiveUrl();
