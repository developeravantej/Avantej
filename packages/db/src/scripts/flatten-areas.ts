/**
 * One-shot data migration: flatten area level.
 *
 * For every branch whose parent is an area, reparent it to the area's parent
 * (typically region). Then delete all area rows.
 *
 * Skips reparenting if area has no parent (orphan — flag and abort tx).
 * Skips dedupe of duplicate country rows (separate cleanup).
 *
 * Usage:
 *   bun run flatten-areas.ts --tenant "Test Fitness Franchise" --dry-run
 *   bun run flatten-areas.ts --tenant "Test Fitness Franchise"
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

interface CliArgs {
	tenant: string;
	dryRun: boolean;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const tenantIdx = args.indexOf("--tenant");
	if (tenantIdx === -1 || !args[tenantIdx + 1]) {
		console.error('Usage: bun run flatten-areas.ts --tenant "<name>" [--dry-run]');
		process.exit(1);
	}
	return {
		tenant: args[tenantIdx + 1]!,
		dryRun: args.includes("--dry-run"),
	};
}

async function getTenantConn(controlPanelUrl: string, name: string): Promise<string> {
	const pool = new Pool({ connectionString: controlPanelUrl });
	try {
		const res = await pool.query(
			"SELECT connection_string FROM organizations WHERE name = $1",
			[name],
		);
		if (res.rows.length === 0) throw new Error(`Tenant not found: ${name}`);
		const enc = res.rows[0].connection_string as string;
		try {
			return decrypt(enc);
		} catch {
			return enc;
		}
	} finally {
		await pool.end();
	}
}

async function main() {
	const { tenant, dryRun } = parseArgs();
	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const conn = await getTenantConn(controlPanelUrl, tenant);
	const pool = new Pool({ connectionString: conn });
	const client = await pool.connect();

	try {
		await client.query("BEGIN");

		// 1. Find every area row + its parent_id
		const areas = await client.query(
			"SELECT id, name, parent_id FROM hierarchy_nodes WHERE type = 'area'",
		);
		console.log(`\nFound ${areas.rows.length} area row(s):\n`);
		for (const a of areas.rows) {
			console.log(`  [area] ${a.name} (id=${a.id.slice(0, 8)})  parent_id=${a.parent_id?.slice(0, 8) ?? "NULL"}`);
		}

		// 2. Validate every area has parent_id (no orphans)
		const orphans = areas.rows.filter((a: any) => !a.parent_id);
		if (orphans.length > 0) {
			throw new Error(
				`Aborting: ${orphans.length} area row(s) have NULL parent_id. Manual fix required.`,
			);
		}

		// 3. For each area, find its branch children + reparent them to area.parent_id
		let reparented = 0;
		for (const area of areas.rows) {
			const kids = await client.query(
				"SELECT id, name, type FROM hierarchy_nodes WHERE parent_id = $1",
				[area.id],
			);
			console.log(
				`\n  Area "${area.name}" has ${kids.rows.length} child(ren):`,
			);
			for (const k of kids.rows) {
				console.log(
					`    [${k.type}] ${k.name} (id=${k.id.slice(0, 8)})  → reparent to ${area.parent_id.slice(0, 8)}`,
				);
			}
			const upd = await client.query(
				"UPDATE hierarchy_nodes SET parent_id = $1, depth = depth - 1, updated_at = now() WHERE parent_id = $2",
				[area.parent_id, area.id],
			);
			reparented += upd.rowCount ?? 0;
		}

		// 4. Delete area rows
		const del = await client.query(
			"DELETE FROM hierarchy_nodes WHERE type = 'area'",
		);

		console.log(`\nSummary:`);
		console.log(`  Reparented children: ${reparented}`);
		console.log(`  Deleted area rows:   ${del.rowCount}`);

		if (dryRun) {
			console.log("\n🔍 DRY RUN — rolling back.");
			await client.query("ROLLBACK");
		} else {
			console.log("\n✅ Committing.");
			await client.query("COMMIT");
		}

		// 5. Verify
		const verify = await client.query(
			"SELECT type, count(*)::int AS n FROM hierarchy_nodes GROUP BY type ORDER BY type",
		);
		console.log("\nPost-state row counts:");
		for (const r of verify.rows) {
			console.log(`  ${r.type}: ${r.n}`);
		}
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(`\n❌ Aborted: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	} finally {
		client.release();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
