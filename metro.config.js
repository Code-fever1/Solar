// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── tslib ESM/CJS interop fix ────────────────────────────────────────────────
// tslib@2.8+ ships an `exports` map whose "import" condition points to
// `modules/index.js`, an ESM wrapper that does:
//   import tslib from '../tslib.js';
//   const { __extends, ... } = tslib;          ← tslib.default is undefined in CJS
// Metro resolves the "import" condition by default in Expo 57 (packageExports
// is enabled), which triggers the crash:
//   "Cannot destructure property '__extends' of 'tslib.default' as it is undefined"
//
// Fix: Force Metro to always resolve `tslib` to its CJS entry `tslib.js`,
// bypassing the problematic ESM wrapper entirely.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return {
      filePath: require.resolve('tslib/tslib.js'),
      type: 'sourceFile',
    };
  }
  // Optionally, chain to the standard Metro resolver.
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
