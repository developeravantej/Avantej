// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = withNativeWind(getDefaultConfig(__dirname), {
	input: "./global.css",
	configPath: "./tailwind.config.js",
});

config.resolver.unstable_enablePackageExports = true;
// Bundle PDF so local terms.pdf can be loaded offline
if (!config.resolver.assetExts.includes("pdf")) {
	config.resolver.assetExts.push("pdf");
}

module.exports = config;
