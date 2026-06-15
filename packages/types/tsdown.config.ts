import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/better-auth.ts"],
	format: ["esm"],
	dts: true,
	sourcemap: true,
	clean: true,
});
