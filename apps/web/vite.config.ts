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
		proxy: {
			"/rpc": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
			"/auth": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
			"/api-reference": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
		},
	},
});
