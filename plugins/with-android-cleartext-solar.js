const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">104.43.56.204</domain>
  </domain-config>
</network-security-config>
`;

function withAndroidCleartextSolar(config) {
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
        NETWORK_SECURITY_CONFIG,
        "utf8",
      );

      return modConfig;
    },
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(modConfig.modResults);

    mainApplication.$["android:usesCleartextTraffic"] = "true";
    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return modConfig;
  });

  return config;
}

module.exports = withAndroidCleartextSolar;
