/**
 * E2E Cleanup Script — prune orphan test users created by e2e journeys
 *
 * Each branch-onboarding e2e run creates a Better-Auth user with an email like
 *   testuser+<timestamp>@avantej-e2e.test
 * These users are intentionally NOT deleted mid-test (no delete endpoint).
 * This script removes them from both the control panel DB (users + auth cascade)
 * and from any tenant `members` rows that reference them.
 *
 * Usage (dry-run — default):
 *   cd apps/server
 *   bun run scripts/e2e-cleanup.ts
 *
 * Usage (apply deletions):
 *   bun run scripts/e2e-cleanup.ts --apply
 *
 * Options:
 *   --email-prefix <prefix>   Email prefix to match (default: "testuser+")
 *   --tenant <orgId>          Restrict tenant member cleanup to this org only
 *   --apply                   Execute deletions (default is dry-run)
 *
 * Safety:
 *   - The script will NEVER delete users whose email does NOT start with the prefix.
 *   - Dry-run is the default; --apply must be explicit.
 *   - Idempotent: safe to run repeatedly.
 */

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	users,
	organizationMembers,
} from "@avantej-core/db/schema/control-panel/index";
import { inArray } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				const key = match[1];
				if (!process.env[key]) process.env[key] = match[2];
			}
		}
	} catch {
		// .dev.vars may not exist in CI
	}
}

function parseArgs(): {
	emailPrefix: string;
	apply: boolean;
	tenantId: string | null;
} {
	const args = process.argv.slice(2);
	let emailPrefix = "testuser+";
	let apply = false;
	let tenantId: string | null = null;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--apply") apply = true;
		if (args[i] === "--email-prefix" && args[i + 1]) {
			emailPrefix = args[++i]!;
		}
		if (args[i] === "--tenant" && args[i + 1]) {
			tenantId = args[++i]!;
		}
	}
	return { emailPrefix, apply, tenantId };
}

// ─── Tenant DB helpers ────────────────────────────────────────────────────────

async function getTenantConnString(
	controlDb: ReturnType<typeof drizzle<typeof controlPanelSchema>>,
	orgId: string,
): Promise<string | null> {
	try {
		const org = await controlDb.query.organizations.findFirst({
			where: (o, { eq }) => eq(o.id, orgId),
		});
		// tenantDbUrl is the connection string for the tenant Neon branch
		return (org as { tenantDbUrl?: string | null })?.tenantDbUrl ?? null;
	} catch {
		return null;
	}
}

async function deleteTenantMembers(
	connString: string,
	userIds: string[],
	apply: boolean,
	orgId: string,
): Promise<number> {
	if (userIds.length === 0) return 0;
	const pool = new Pool({ connectionString: connString });
	try {
		// Use raw query — tenant schema is separate package
		const placeholders = userIds.map((_, i) => `$${i + 1}`).join(", ");
		const countResult = await pool.query(
			`SELECT COUNT(*) FROM members WHERE user_id = ANY(ARRAY[${placeholders}])`,
			userIds,
		);
		const count = Number(countResult.rows[0]?.count ?? 0);
		if (count > 0 && apply) {
			await pool.query(
				`DELETE FROM members WHERE user_id = ANY(ARRAY[${placeholders}])`,
				userIds,
			);
			console.log(`  [tenant ${orgId}] Deleted ${count} member row(s)`);
		} else if (count > 0) {
			console.log(
				`  [tenant ${orgId}] Would delete ${count} member row(s) (dry-run)`,
			);
		}
		return count;
	} finally {
		await pool.end();
	}
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	loadDevVars();

	const { emailPrefix, apply, tenantId } = parseArgs();

	const dbUrl = process.env.DATABASE_URL;
	if (!dbUrl) throw new Error("DATABASE_URL is required");

	console.log(`E2E Cleanup — ${apply ? "APPLY" : "DRY-RUN"}`);
	console.log(`Email prefix: "${emailPrefix}"`);
	if (tenantId) console.log(`Tenant filter: ${tenantId}`);
	console.log("");

	const pool = new Pool({ connectionString: dbUrl });
	const db = drizzle({ client: pool, schema: controlPanelSchema });

	try {
		// ── 1. Find matching control-panel users ────────────────────────────────
		const matchedUsers = await db.query.users.findMany({
			where: (u, { like }) => like(u.email, `${emailPrefix}%`),
		});

		if (matchedUsers.length === 0) {
			console.log("No matching users found — nothing to clean up.");
			return;
		}

		console.log(`Found ${matchedUsers.length} matching user(s):`);
		for (const u of matchedUsers) {
			console.log(`  ${u.email} (id: ${u.id})`);
		}
		console.log("");

		const userIds = matchedUsers.map((u) => u.id);

		// ── 2. Find all organizations these users are members of ────────────────
		const memberRows = await db.query.organizationMembers.findMany({
			where: (om) => inArray(om.userId, userIds),
		});

		// Collect unique org IDs for tenant cleanup
		const orgIds = tenantId
			? [tenantId]
			: [...new Set(memberRows.map((m) => m.organizationId))];

		console.log(
			`Organization memberships (control panel): ${memberRows.length} row(s) across ${orgIds.length} org(s)`,
		);

		// ── 3. Delete tenant members rows ───────────────────────────────────────
		let totalTenantDeleted = 0;
		for (const orgId of orgIds) {
			const connString = await getTenantConnString(db, orgId);
			if (!connString) {
				console.log(
					`  [tenant ${orgId}] No tenantDbUrl found — skipping tenant cleanup`,
				);
				continue;
			}
			try {
				const deleted = await deleteTenantMembers(
					connString,
					userIds,
					apply,
					orgId,
				);
				totalTenantDeleted += deleted;
			} catch (err) {
				console.warn(
					`  [tenant ${orgId}] Failed to connect to tenant DB: ${String(err)}`,
				);
			}
		}

		// ── 4. Delete control-panel organizationMembers ─────────────────────────
		const cpMemberCount = memberRows.length;
		if (cpMemberCount > 0) {
			if (apply) {
				await db
					.delete(organizationMembers)
					.where(inArray(organizationMembers.userId, userIds));
				console.log(
					`Deleted ${cpMemberCount} organization_members row(s) from control panel`,
				);
			} else {
				console.log(
					`Would delete ${cpMemberCount} organization_members row(s) from control panel (dry-run)`,
				);
			}
		}

		// ── 5. Delete control-panel users (cascade handles sessions, accounts) ──
		if (apply) {
			await db.delete(users).where(inArray(users.id, userIds));
			console.log(
				`Deleted ${userIds.length} user(s) from control panel (auth cascade removes accounts/sessions)`,
			);
		} else {
			console.log(
				`Would delete ${userIds.length} user(s) from control panel (dry-run)`,
			);
		}

		console.log("");
		if (apply) {
			console.log(
				`Done. Removed ${userIds.length} user(s), ${cpMemberCount} CP member(s), ${totalTenantDeleted} tenant member(s).`,
			);
		} else {
			console.log(`Dry-run complete. Pass --apply to execute deletions.`);
		}
	} finally {
		await pool.end();
	}
}

if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("Script failed:", err);
			process.exit(1);
		});
}
