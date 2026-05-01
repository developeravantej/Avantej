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

	if (!fs.existsSync(serverEnvPath)) {
		console.warn(
			`[global-setup] apps/server/.env not found at ${serverEnvPath} — DB env vars must be set externally`,
		);
		return;
	}

	const content = fs.readFileSync(serverEnvPath, "utf-8");

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		// Only set DATABASE_URL and TENANT_DATABASE_URL — don't clobber other env
		if (
			key === "DATABASE_URL" ||
			key === "TENANT_DATABASE_URL"
		) {
			process.env[key] = value;
		}
	}

	console.log("[global-setup] Loaded DATABASE_URL and TENANT_DATABASE_URL from apps/server/.env");
}
