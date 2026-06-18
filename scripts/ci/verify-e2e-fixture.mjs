#!/usr/bin/env node
/**
 * Verify dev Neon has minimum E2E fixture data for the franchise test org.
 * Exits 0 when seed-business-data prerequisites are met; 1 with actionable errors.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars() {
	try {
		const content = readFileSync(
			join(__dirname, "../../apps/server/.dev.vars"),
			"utf-8",
		);
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined && !process.env[match[1]]) {
				process.env[match[1]] = match[2];
			}
		}
	} catch {
		// CI may inject env directly
	}
}

loadDevVars();

const databaseUrl = process.env.CI_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("verify-e2e-fixture: DATABASE_URL or CI_DATABASE_URL required");
	process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

try {
	const org = await pool.query(
		"SELECT id, slug FROM organizations WHERE id = $1 LIMIT 1",
		[TARGET_ORG_ID],
	);
	if (org.rowCount === 0) {
		console.error(
			`verify-e2e-fixture: org ${TARGET_ORG_ID} not found — run seed-franchise-owner or seed-business-data`,
		);
		process.exit(1);
	}
	console.log(
		`verify-e2e-fixture: org ok (${org.rows[0].slug ?? "unknown slug"})`,
	);
	console.log(
		"verify-e2e-fixture: run `cd apps/server && bun run scripts/seed-business-data.ts` before smoke tests",
	);
} finally {
	await pool.end();
}
