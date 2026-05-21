import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	// Override server port via SERVER_PORT env (used by E2E to avoid worktree port conflicts).
	const serverUrl =
		env.VITE_SERVER_URL ?? `http://localhost:${process.env.SERVER_PORT ?? 3020}`;

	return {
		plugins: [
			tailwindcss(),
			tanstackRouter({}),
			react(),
			...(process.env.CF_DEPLOY === "true" ? [cloudflare()] : []),
		],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
		build: {
			chunkSizeWarningLimit: 600,
			rollupOptions: {
				output: {
					manualChunks: {
						"vendor-react": ["react", "react-dom"],
						"vendor-tanstack": [
							"@tanstack/react-query",
							"@tanstack/react-router",
							"@tanstack/react-table",
						],
						"vendor-radix": [
							"radix-ui",
							"@radix-ui/react-avatar",
							"@radix-ui/react-checkbox",
							"@radix-ui/react-collapsible",
							"@radix-ui/react-dialog",
							"@radix-ui/react-dropdown-menu",
							"@radix-ui/react-label",
							"@radix-ui/react-radio-group",
							"@radix-ui/react-select",
							"@radix-ui/react-separator",
							"@radix-ui/react-slot",
							"@radix-ui/react-tabs",
							"@radix-ui/react-tooltip",
						],
						"vendor-ui": ["lucide-react", "sonner"],
						"vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
					},
				},
			},
		},
		server: {
			// Allow *.localhost hostnames so cookie-scoped dev sessions don't collide with
			// other projects running on localhost (browsers scope cookies by domain, not port).
			// Navigate to http://avantej.localhost:3021 instead of http://localhost:3021.
			allowedHosts: ["avantej.localhost"],
			// In local dev the API (Wrangler) runs on :3020 while the web app runs on :3021.
			// Proxy API calls so the frontend can use relative URLs like /rpc/* and /api/*.
			proxy: {
				"/rpc": { target: serverUrl, changeOrigin: true },
				"/api": { target: serverUrl, changeOrigin: true },
				"/auth": { target: serverUrl, changeOrigin: true },
				"/api-reference": { target: serverUrl, changeOrigin: true },
			},
		},
	};
});
