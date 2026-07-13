import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [react(), tsconfigPaths()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/__tests__/setup.ts"],
		include: [
			"src/__tests__/**/*.test.{ts,tsx}",
			"src/features/**/*.test.{ts,tsx}",
			// Colocated lib tests (e.g. src/lib/gender.test.ts) — without this glob
			// they exist on disk but never run.
			"src/lib/**/*.test.{ts,tsx}",
		],
		coverage: {
			reporter: ["text", "html"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/routeTree.gen.ts", "src/__tests__/**"],
		},
	},
});
