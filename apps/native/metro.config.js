const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch all files and resolve packages from both local and root node_modules
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(monorepoRoot, "node_modules"),
];

const finalConfig = withNativeWind(config, {
	input: "./global.css",
	configPath: "./tailwind.config.js",
});

finalConfig.resolver.unstable_enablePackageExports = true;
if (!finalConfig.resolver.assetExts.includes("pdf")) {
	finalConfig.resolver.assetExts.push("pdf");
}

module.exports = finalConfig;
