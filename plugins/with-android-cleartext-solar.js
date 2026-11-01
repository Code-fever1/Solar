const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

require("../backend/load-env");

/**
 * Cleartext is limited to the configured API host, matching the previous
 * single-domain network security config. Host comes from EXPO_PUBLIC_API_HOST
 * or EXPO_PUBLIC_SOLAR_API_URL (see .env.example). Expo loads .env before
 * prebuild; load-env covers a direct require.
 */
function cleartextHost() {
  const fromHost = hostOnly(process.env.EXPO_PUBLIC_API_HOST);
  if (fromHost) return fromHost;
  return hostOnly(process.env.EXPO_PUBLIC_SOLAR_API_URL);
}

function hostOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = withoutScheme.split("/")[0].split(":")[0].trim();
  return /^[A-Za-z0-9.-]+$/.test(host) ? host : "";
}

function networkSecurityConfig(host) {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${host}</domain>
  </domain-config>
</network-security-config>
`;
}

function withAndroidCleartextSolar(config) {
  const host = cleartextHost();

  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);

    mainApplication.$["android:usesCleartextTraffic"] = "true";
    if (host) {
      mainApplication.$["android:networkSecurityConfig"] =
        "@xml/network_security_config";
    }

    return modConfig;
  });

  if (!host) return config;

  config = withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );

      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        networkSecurityConfig(host),
        "utf8",
      );

      return modConfig;
    },
  ]);

  return config;
}

withAndroidCleartextSolar.cleartextHost = cleartextHost;
withAndroidCleartextSolar.networkSecurityConfig = networkSecurityConfig;

module.exports = withAndroidCleartextSolar;
