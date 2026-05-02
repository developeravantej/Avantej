import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), tanstackRouter({}), react(), cloudflare()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		// In local dev the API (Wrangler) runs on :3000 while the web app runs on :3001.
		// Proxy API calls so the frontend can use relative URLs like /rpc/* and /api/*.
		// Override server port via SERVER_PORT env (used by E2E to avoid worktree port conflicts).
		proxy: (() => {
			const target = `http://localhost:${process.env.SERVER_PORT ?? 3000}`;
			return {
				"/rpc": { target, changeOrigin: true },
				"/api": { target, changeOrigin: true },
				"/auth": { target, changeOrigin: true },
				"/api-reference": { target, changeOrigin: true },
			};
		})(),
	},
});
