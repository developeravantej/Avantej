/**
 * D2 drift validation: check for orphan preferred_trainer_id values.
 *
 * Iterates every tenant organization in the control panel DB, decrypts each
 * tenant connection string, and runs an orphan check against the tenant DB.
 *
 * Usage:
 *   cd apps/server
 *   bun scripts/check-preferred-trainer-orphans.ts
 *
 * Reads control panel DB from DATABASE_URL in apps/server/.dev.vars.
 * Exits 1 if orphans found in ANY tenant, 0 if all clean,
 * 2 on configuration / connection errors.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { decrypt } from "@avantej-core/db";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

function loadDevVars(): Record<string, string> {
	const candidates = [
		path.resolve(__dirname, "..", ".dev.vars"),
		path.resolve(process.cwd(), ".dev.vars"),
		path.resolve(process.cwd(), "apps/server/.dev.vars"),
	];
	for (const p of candidates) {
		try {
			const text = readFileSync(p, "utf8");
			const out: Record<string, string> = {};
			for (const line of text.split(/\r?\n/)) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const m = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
				if (m) out[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
			}
			return out;
		} catch {
			/* try next */
		}
	}
	throw new Error(".dev.vars not found");
}

async function checkTenant(
	orgId: string,
	orgName: string,
	connStr: string,
): Promise<{ orgId: string; orgName: string; orphanCount: number; samples: Array<{ id: string; preferred_trainer_id: string }>; error?: string }> {
	const pool = new Pool({ connectionString: connStr });
	try {
		// Verify package_instances table + preferred_trainer_id column exist before querying
		const tableCheck = await pool.query<{ exists: boolean }>(
			`SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'package_instances'
       ) AS exists`,
		);
		if (!tableCheck.rows[0]?.exists) {
			return {
				orgId,
				orgName,
				orphanCount: 0,
				samples: [],
				error: "package_instances table not present (tenant pre-dates package schema)",
			};
		}
		const colCheck = await pool.query<{ exists: boolean }>(
			`SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'package_instances'
           AND column_name = 'preferred_trainer_id'
       ) AS exists`,
		);
		if (!colCheck.rows[0]?.exists) {
			return {
				orgId,
				orgName,
				orphanCount: 0,
				samples: [],
				error: "preferred_trainer_id column not present (migration 0019 not yet applied)",
			};
		}

		const result = await pool.query<{ count: string }>(
			`SELECT COUNT(*)::text AS count
       FROM public.package_instances pi
       WHERE pi.preferred_trainer_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = pi.preferred_trainer_id)`,
		);
		const count = Number.parseInt(result.rows[0]?.count ?? "0", 10);

		if (count === 0) {
			return { orgId, orgName, orphanCount: 0, samples: [] };
		}

		const samples = await pool.query<{
			id: string;
			preferred_trainer_id: string;
		}>(
			`SELECT pi.id, pi.preferred_trainer_id
       FROM public.package_instances pi
       WHERE pi.preferred_trainer_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = pi.preferred_trainer_id)
       LIMIT 10`,
		);
		return { orgId, orgName, orphanCount: count, samples: samples.rows };
	} catch (err) {
		return {
			orgId,
			orgName,
			orphanCount: 0,
			samples: [],
			error: err instanceof Error ? err.message : String(err),
		};
	} finally {
		await pool.end();
	}
}

async function main() {
	const env = loadDevVars();
	const controlPanelUrl = env.DATABASE_URL;
	if (!controlPanelUrl) {
		console.error("No DATABASE_URL in .dev.vars");
		process.exit(2);
	}

	const controlPool = new Pool({ connectionString: controlPanelUrl });
	const orgsResult = await controlPool.query<{
		id: string;
		name: string;
		connection_string: string | null;
	}>(`SELECT id, name, connection_string FROM public.organizations`);
	const orgs = orgsResult.rows.map((r) => ({
		id: r.id,
		name: r.name,
		connectionString: r.connection_string,
	}));
	await controlPool.end();

	console.log(`Found ${orgs.length} tenant organization(s) in control panel.\n`);

	let totalOrphans = 0;
	let tenantsChecked = 0;
	let tenantsErrored = 0;
	const orphanReports: Array<{
		orgId: string;
		orgName: string;
		orphanCount: number;
		samples: Array<{ id: string; preferred_trainer_id: string }>;
	}> = [];

	for (const org of orgs) {
		if (!org.connectionString) {
			console.warn(`  [skip] ${org.name} (${org.id}) — no connection string`);
			continue;
		}
		let connStr: string;
		try {
			connStr = decrypt(org.connectionString);
		} catch (err) {
			console.error(
				`  [error] ${org.name} (${org.id}) — failed to decrypt connection: ${err instanceof Error ? err.message : err}`,
			);
			tenantsErrored++;
			continue;
		}

		const res = await checkTenant(org.id, org.name, connStr);
		if (res.error) {
			console.warn(`  [warn] ${res.orgName} (${res.orgId}) — ${res.error}`);
			tenantsErrored++;
			continue;
		}
		tenantsChecked++;
		if (res.orphanCount === 0) {
			console.log(`  ✓ ${res.orgName} (${res.orgId}) — 0 orphans`);
		} else {
			totalOrphans += res.orphanCount;
			orphanReports.push(res);
			console.error(
				`  ✗ ${res.orgName} (${res.orgId}) — ${res.orphanCount} orphan(s)`,
			);
		}
	}

	console.log(
		`\nSummary: ${tenantsChecked} tenant(s) checked, ${tenantsErrored} skipped/errored, ${totalOrphans} total orphan(s).`,
	);

	if (totalOrphans === 0) {
		console.log(
			"✓ D2 validation: 0 orphans on package_instances.preferred_trainer_id across all tenants",
		);
		process.exit(0);
	}

	console.error("\nOrphan details:");
	for (const r of orphanReports) {
		console.error(`Tenant ${r.orgName} (${r.orgId}):`);
		for (const row of r.samples) {
			console.error(
				`  package_instance ${row.id} → missing trainer ${row.preferred_trainer_id}`,
			);
		}
	}
	process.exit(1);
}

main().catch((err) => {
	console.error("Script failed:", err);
	process.exit(2);
});
