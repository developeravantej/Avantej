/**
 * Playwright Global Setup
 *
 * Loads DATABASE_URL and TENANT_DATABASE_URL from apps/server/.env into
 * process.env so that E2E fixture files (db.ts) can create direct Drizzle
 * connections for seeding and assertion.
 *
 * This runs once before all tests (configured via globalSetup in playwright.config.ts).
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export default async function globalSetup() {
	// Resolve path to apps/server/.env relative to this file's location (apps/web/e2e).
	// Use fileURLToPath(import.meta.url) for ESM compatibility; fall back to __dirname for CJS.
	const dir =
		typeof __dirname !== "undefined"
			? __dirname
			: path.dirname(fileURLToPath(import.meta.url));
	const serverEnvPath = path.resolve(dir, "../../server/.env");
	const devVarsPath = path.resolve(dir, "../../server/.dev.vars");

	const KEYS_FROM_ENV = new Set([
		"DATABASE_URL",
		"TENANT_DATABASE_URL",
		"ENCRYPTION_KEY",
	]);
	const KEYS_FROM_DEV_VARS = new Set(["GHL_AGENCY_ID"]);

	const loadEnvFile = (filePath: string, keys: Set<string>, label: string) => {
		if (!fs.existsSync(filePath)) {
			console.warn(`[global-setup] ${label} not found at ${filePath}`);
			return;
		}
		const content = fs.readFileSync(filePath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx === -1) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			const value = trimmed.slice(eqIdx + 1).trim();
			if (keys.has(key)) {
				const unquoted = value.replace(/^["']|["']$/g, "");
				process.env[key] = unquoted;
			}
		}
	};

	loadEnvFile(serverEnvPath, KEYS_FROM_ENV, "apps/server/.env");
	loadEnvFile(devVarsPath, KEYS_FROM_DEV_VARS, "apps/server/.dev.vars");

	console.log(
		"[global-setup] Loaded DATABASE_URL, TENANT_DATABASE_URL, ENCRYPTION_KEY from apps/server/.env; GHL_AGENCY_ID from apps/server/.dev.vars",
	);
}
