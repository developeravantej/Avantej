/**
 * One-shot data fix: merge duplicate sibling hierarchy_nodes rows.
 *
 * Detects duplicate (parent_id, name, type) groups in hierarchy_nodes and
 * merges them into one canonical row. The canonical row is the oldest by
 * created_at. Children of duplicate rows are reparented to the canonical;
 * any descendant whose country_node_id pointed to a duplicate is fixed up
 * to point to the canonical. Duplicates are then deleted.
 *
 * After each pass, the SELECT is re-run because merging a parent can produce
 * new sibling duplicates one level down (e.g. each Malaysia had its own
 * Sabah → after merging Malaysia, both Sabahs share a parent and become a
 * new dup group). Iteration is capped at 10 to avoid infinite loops.
 *
 * Pre-flight: many tenant tables hold FKs to hierarchy_nodes.id. Deleting a
 * referenced row would fail under "restrict" or silently lose data under
 * "cascade". The script counts references against every known FK column
 * before deleting, and aborts (with a per-table breakdown) if any duplicate
 * row is referenced.
 *
 * Wrapped in a single transaction. ROLLBACK on any error or --dry-run.
 *
 * Usage:
 *   bun run merge-duplicate-siblings.ts --tenant "<name>" --dry-run
 *   bun run merge-duplicate-siblings.ts --tenant "<name>"
 */
import { Pool } from "@neondatabase/serverless";
import type { PoolClient } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

interface CliArgs {
	tenant: string;
	dryRun: boolean;
}

interface DupGroup {
	parent_id: string | null;
	name: string;
	type: string;
	ids: string[];
	n: number;
}

/**
 * Tables (and the columns within them) that hold FKs to hierarchy_nodes.id.
 * Sourced from packages/db/src/schema/tenant/*.ts at the time of writing.
 * If a new FK is added, list it here so the pre-flight catches it.
 */
const HIERARCHY_FK_TARGETS: Array<{ table: string; column: string }> = [
	{ table: "announcements", column: "branch_id" },
	{ table: "announcement_scopes", column: "branch_id" },
	{ table: "invitations", column: "hierarchy_scope_id" },
	{ table: "stock_requests", column: "from_branch_id" },
	{ table: "stock_requests", column: "to_branch_id" },
	{ table: "sales_orders", column: "branch_id" },
	{ table: "purchase_orders", column: "branch_id" },
	{ table: "transfer_orders", column: "from_branch_id" },
	{ table: "transfer_orders", column: "to_branch_id" },
	{ table: "payout_batches", column: "branch_id" },
	{ table: "appointments", column: "branch_id" },
	{ table: "product_prices", column: "branch_id" },
	{ table: "service_prices", column: "branch_id" },
	{ table: "refunds", column: "branch_id" },
	{ table: "walk_in_customers", column: "branch_id" },
	{ table: "service_categories", column: "branch_id" },
	{ table: "members", column: "hierarchy_scope_id" },
	{ table: "product_stock", column: "branch_id" },
	{ table: "goods_receipts", column: "branch_id" },
	{ table: "expenses", column: "branch_id" },
	{ table: "class_slots", column: "branch_id" },
	{ table: "services", column: "branch_id" },
	{ table: "rooms", column: "branch_id" },
	{ table: "promotions", column: "branch_id" },
];

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const tenantIdx = args.indexOf("--tenant");
	if (tenantIdx === -1 || !args[tenantIdx + 1]) {
		console.error(
			'Usage: bun run merge-duplicate-siblings.ts --tenant "<name>" [--dry-run]',
		);
		process.exit(1);
	}
	return {
		tenant: args[tenantIdx + 1]!,
		dryRun: args.includes("--dry-run"),
	};
}

function shortId(id: string | null): string {
	if (!id) return "NULL";
	return id.slice(0, 8);
}

async function getTenantConn(
	controlPanelUrl: string,
	name: string,
): Promise<string> {
	const pool = new Pool({ connectionString: controlPanelUrl });
	try {
		const res = await pool.query(
			"SELECT connection_string FROM organizations WHERE name = $1",
			[name],
		);
		if (res.rows.length === 0) throw new Error(`Tenant not found: ${name}`);
		const enc = res.rows[0].connection_string as string;
		let conn: string;
		try {
			conn = decrypt(enc);
		} catch {
			conn = enc;
		}
		return conn;
	} finally {
		await pool.end();
	}
}

async function findDuplicateGroups(client: PoolClient): Promise<DupGroup[]> {
	const res = await client.query(
		`SELECT parent_id, name, type,
		        array_agg(id ORDER BY created_at ASC) AS ids,
		        count(*)::int AS n,
		        array_agg(created_at ORDER BY created_at ASC) AS created_ats
		   FROM hierarchy_nodes
		  WHERE archived_at IS NULL
		  GROUP BY parent_id, name, type
		 HAVING count(*) > 1
		  ORDER BY type ASC`,
	);
	const groups: DupGroup[] = [];
	for (const row of res.rows) {
		const createdAts = row.created_ats as Array<Date | string>;
		// Warn on degenerate ties (multiple rows with identical created_at).
		if (createdAts.length >= 2) {
			const first = new Date(createdAts[0] as string | Date).getTime();
			const second = new Date(createdAts[1] as string | Date).getTime();
			if (first === second) {
				console.warn(
					`  ⚠️  WARNING: duplicate group (type=${row.type} name="${row.name}") has rows with identical created_at; proceeding with array_agg ordering.`,
				);
			}
		}
		groups.push({
			parent_id: row.parent_id,
			name: row.name,
			type: row.type,
			ids: row.ids as string[],
			n: row.n,
		});
	}
	return groups;
}

interface FkConflict {
	table: string;
	column: string;
	id: string;
	count: number;
}

async function checkFkReferences(
	client: PoolClient,
	duplicateIds: string[],
): Promise<FkConflict[]> {
	if (duplicateIds.length === 0) return [];
	const conflicts: FkConflict[] = [];
	for (const target of HIERARCHY_FK_TARGETS) {
		// Some tables may not exist on every tenant; guard with to_regclass.
		const exists = await client.query(
			"SELECT to_regclass($1) AS reg",
			[target.table],
		);
		if (!exists.rows[0]?.reg) continue;

		const res = await client.query(
			`SELECT "${target.column}" AS ref_id, count(*)::int AS n
			   FROM "${target.table}"
			  WHERE "${target.column}" = ANY($1::uuid[])
			  GROUP BY "${target.column}"`,
			[duplicateIds],
		);
		for (const row of res.rows) {
			conflicts.push({
				table: target.table,
				column: target.column,
				id: row.ref_id as string,
				count: row.n as number,
			});
		}
	}
	return conflicts;
}

async function processGroup(
	client: PoolClient,
	group: DupGroup,
): Promise<{ reparented: number; deleted: number; countryFixed: number }> {
	const canonicalId = group.ids[0]!;
	const duplicates = group.ids.slice(1);

	// Pre-flight: confirm no external FK references point to the duplicates.
	const conflicts = await checkFkReferences(client, duplicates);
	if (conflicts.length > 0) {
		const lines = conflicts
			.map(
				(c) =>
					`    - ${c.table}.${c.column} → duplicate ${shortId(c.id)} (${c.count} row${c.count === 1 ? "" : "s"})`,
			)
			.join("\n");
		throw new Error(
			`FK conflict: cannot delete duplicates for (type=${group.type} name="${group.name}").\n` +
				`  Referenced by:\n${lines}\n` +
				"  Resolve manually (reassign refs to the canonical id) before retrying.",
		);
	}

	// a) Reparent every direct child of each duplicate to the canonical.
	const reparentRes = await client.query(
		`UPDATE hierarchy_nodes
		    SET parent_id = $1, updated_at = now()
		  WHERE parent_id = ANY($2::uuid[])`,
		[canonicalId, duplicates],
	);
	const reparented = reparentRes.rowCount ?? 0;

	// c) Fix country_node_id denorm on any descendant pointing at a duplicate.
	const countryRes = await client.query(
		`UPDATE hierarchy_nodes
		    SET country_node_id = $1, updated_at = now()
		  WHERE country_node_id = ANY($2::uuid[])`,
		[canonicalId, duplicates],
	);
	const countryFixed = countryRes.rowCount ?? 0;

	// d) Delete duplicates.
	const delRes = await client.query(
		"DELETE FROM hierarchy_nodes WHERE id = ANY($1::uuid[])",
		[duplicates],
	);
	const deleted = delRes.rowCount ?? 0;

	return { reparented, deleted, countryFixed };
}

async function main() {
	const { tenant, dryRun } = parseArgs();
	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const conn = await getTenantConn(controlPanelUrl, tenant);
	const pool = new Pool({ connectionString: conn });
	const client = await pool.connect();

	let totalReparented = 0;
	let totalDeleted = 0;
	let totalCountryFixed = 0;
	let iterations = 0;
	const MAX_ITERATIONS = 10;

	try {
		await client.query("BEGIN");

		// Initial discovery report.
		const initial = await findDuplicateGroups(client);
		console.log(`\nFound ${initial.length} duplicate sibling group(s):`);
		for (const g of initial) {
			console.log(
				`  parent=${shortId(g.parent_id)} type=${g.type} name="${g.name}" canonical=${shortId(g.ids[0]!)} duplicates=[${g.ids.slice(1).map(shortId).join(", ")}]`,
			);
		}

		// Iterate until no duplicates remain (or we hit MAX_ITERATIONS).
		while (iterations < MAX_ITERATIONS) {
			const groups = await findDuplicateGroups(client);
			if (groups.length === 0) break;
			iterations++;

			let passReparented = 0;
			let passDeleted = 0;
			let passMerged = 0;

			for (const group of groups) {
				const r = await processGroup(client, group);
				passReparented += r.reparented;
				passDeleted += r.deleted;
				totalCountryFixed += r.countryFixed;
				passMerged++;
			}

			totalReparented += passReparented;
			totalDeleted += passDeleted;
			console.log(
				`\nPass ${iterations}: merged ${passMerged} group(s), ${passReparented} row(s) reparented, ${passDeleted} row(s) deleted`,
			);
		}

		if (iterations === MAX_ITERATIONS) {
			const remaining = await findDuplicateGroups(client);
			if (remaining.length > 0) {
				throw new Error(
					`Hit MAX_ITERATIONS (${MAX_ITERATIONS}) with ${remaining.length} duplicate group(s) still present. Likely degenerate data; aborting.`,
				);
			}
		}

		// Final verification.
		const finalGroups = await findDuplicateGroups(client);
		if (finalGroups.length !== 0) {
			throw new Error(
				`Post-merge verification failed: ${finalGroups.length} duplicate group(s) still present.`,
			);
		}

		console.log("\nFinal summary:");
		console.log(`  Total reparented:        ${totalReparented}`);
		console.log(`  Total country_node_id fixed: ${totalCountryFixed}`);
		console.log(`  Total deleted:           ${totalDeleted}`);
		console.log(`  Total iterations:        ${iterations}`);
		console.log("  Remaining duplicate groups: 0");

		if (dryRun) {
			console.log("\n🔍 DRY RUN — rolling back.");
			await client.query("ROLLBACK");
		} else {
			console.log("\n✅ Committing.");
			await client.query("COMMIT");
		}
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(
			`\n❌ Aborted: ${err instanceof Error ? err.message : String(err)}`,
		);
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
