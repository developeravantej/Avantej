/**
 * Loads apps/server/.dev.vars into process.env (side-effect free until called).
 * Mirrors scripts/load-dev-vars.ts so the migration tooling needs no extra wiring.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadDevVars(): void {
	try {
		const content = readFileSync(
			join(__dirname, "../../../.dev.vars"),
			"utf-8",
		);
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]]) {
				process.env[m[1]] = m[2];
			}
		}
	} catch (e) {
		console.warn("Could not load .dev.vars:", e);
	}
}
