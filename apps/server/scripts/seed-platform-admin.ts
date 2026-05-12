/**
 * Seed Script: Platform Admin Bootstrap
 *
 * Inserts developer.avantej@gmail.com as a super_admin platform admin and
 * mirrors user.role = 'admin' so the Better-Auth admin plugin recognises them.
 *
 * Safe to run multiple times — uses onConflictDoNothing on userId.
 *
 * Usage (from project root or apps/server):
 *   cd apps/server
 *   bun run scripts/seed-platform-admin.ts
 *
 * Prerequisites:
 *   - .dev.vars (or process.env) must have DATABASE_URL pointing to the
 *     control-panel Neon database.
 *   - developer.avantej@gmail.com must already exist in the user table
 *     (sign in via the app first if not present).
 */

import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq } from "drizzle-orm";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { getPlatformAdmin, syncUserRole } from "@/services/admin.service";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_EMAIL = "developer.avantej@gmail.com";

function loadDevVars(): void {
	try {
		const { readFileSync } = require("fs");
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				if (!process.env[match[1]]) {
					process.env[match[1]] = match[2];
				}
			}
		}
	} catch {
		// .dev.vars not present — rely on process.env set externally
	}
}

async function seedPlatformAdmin() {
	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required — check .dev.vars or environment");
	}

	console.log("Seeding platform admin...\n");

	const pool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({ client: pool, schema: controlPanelSchema });

	try {
		// 1. Look up user by email
		const targetUser = await controlPanelDb.query.users.findFirst({
			where: eq(controlPanelSchema.users.email, TARGET_EMAIL),
		});

		if (!targetUser) {
			console.error(
				`User not found: ${TARGET_EMAIL} — sign up first, then re-run this script.`
			);
			process.exit(1);
		}

		const userId = targetUser.id;
		console.log(`Found user: ${TARGET_EMAIL} (id: ${userId})`);

		// 2. Upsert into platform_admins (idempotent via onConflictDoNothing)
		await controlPanelDb
			.insert(platformAdmins)
			.values({
				userId,
				role: "super_admin",
				grantedBy: userId, // self-grant for bootstrap
			})
			.onConflictDoNothing({ target: platformAdmins.userId });

		// Re-read to confirm the row exists (handles both insert and pre-existing)
		const adminRow = await getPlatformAdmin(controlPanelDb, userId);
		if (!adminRow) {
			throw new Error("Failed to read platform_admins row after upsert");
		}
		console.log(`platform_admins row confirmed: role=${adminRow.role}`);

		// 3. Sync user.role = 'admin' for Better-Auth admin plugin
		await syncUserRole(controlPanelDb, userId);
		console.log(`user.role set to 'admin' for userId=${userId}`);

		console.log(`\nDone. ${TARGET_EMAIL} is now a super_admin platform admin.`);
	} finally {
		await pool.end();
	}
}

if (import.meta.main) {
	seedPlatformAdmin()
		.then(() => {
			process.exit(0);
		})
		.catch((error) => {
			console.error("Seed failed:", error);
			process.exit(1);
		});
}

export { seedPlatformAdmin };
