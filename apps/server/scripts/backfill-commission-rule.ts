#!/usr/bin/env bun
/**
 * backfill-commission-rule.ts — migration 0051 rule-realignment backfill
 *
 * WHAT IT DOES
 * ============
 * After the Phase 1 commission-rule change (commissions earn on appointment
 * delivery, not at POS sale time), existing `commission_splits` rows that were
 * written under the OLD rule need to be voided so the new rule can re-create
 * them correctly when the appointments eventually resolve.
 *
 * TARGET ROWS
 * ===========
 * A split qualifies for voiding when ALL of the following are true:
 *   1. status = 'pending'
 *   2. salesOrderId IS NOT NULL  (sourced from POS)
 *   3. earnReason IS NULL OR earnReason != 'pos_product'  (not a product fast-path split — those still earn at sale)
 *   4. The linked sales_order_item has serviceId IS NOT NULL  (service line, not product)
 *   5. The linked appointment status is NOT IN ('completed', 'cancelled')  (delivery hasn't happened)
 *
 * Conditions 1–3 are evaluated directly on commission_splits.
 * Conditions 4–5 require a JOIN through sales_order_items → appointments.
 *
 * UPDATE APPLIED
 * ==============
 * For each qualifying row:
 *   status  = 'voided'
 *   notes   = COALESCE(notes, '') || ' [backfill 0051: rule realignment 2026-05-12]'
 *
 * Applied in batches of 500 per tenant inside a single transaction so a
 * partial failure rolls back cleanly.
 *
 * USAGE
 * =====
 *   cd apps/server
 *
 *   # Dry run (DEFAULT — no writes)
 *   bun run scripts/backfill-commission-rule.ts
 *   bun run scripts/backfill-commission-rule.ts --dry-run
 *
 *   # Apply for ONE tenant first (staged rollout)
 *   bun run scripts/backfill-commission-rule.ts --apply --tenant <orgId>
 *
 *   # Apply to all tenants
 *   bun run scripts/backfill-commission-rule.ts --apply
 *
 *   # Cap rows touched per tenant (safety belt during testing)
 *   bun run scripts/backfill-commission-rule.ts --apply --limit 100
 *
 *   # Help
 *   bun run scripts/backfill-commission-rule.ts --help
 *
 * MONITORING A PRODUCTION RUN
 * ===========================
 * 1. Start with dry-run across all tenants. Review the summary table — note
 *    any tenant with an unexpectedly large "to void" count (investigate before apply).
 * 2. Apply to the test tenant first: --apply --tenant <test-org-id>
 * 3. Verify in Drizzle Studio that voided rows have the backfill note and status='voided'.
 * 4. Roll out to remaining tenants without --tenant filter.
 * 5. Script is idempotent: re-runs skip already-voided rows (status != 'pending').
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BACKFILL_NOTE = " [backfill 0051: rule realignment 2026-05-12]";
const CHUNK_SIZE = 500;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	dryRun: boolean;
	tenantId: string | null;
	limit: number | null;
	help: boolean;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const opts: CliOptions = {
		dryRun: true, // DEFAULT: dry-run
		tenantId: null,
		limit: null,
		help: false,
	};

	// Support both `--flag value` and `--flag=value` forms.
	const valueOf = (i: number, arg: string): string | undefined => {
		const eq = arg.indexOf("=");
		return eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;
		if (arg === "--help" || arg === "-h") {
			opts.help = true;
		} else if (arg === "--apply") {
			opts.dryRun = false;
		} else if (arg === "--dry-run") {
			opts.dryRun = true;
		} else if (arg === "--tenant" || arg.startsWith("--tenant=")) {
			opts.tenantId = valueOf(i, arg) ?? null;
			if (!arg.includes("=")) i++;
			if (!opts.tenantId) {
				console.error("ERROR: --tenant requires an organization id");
				process.exit(1);
			}
		} else if (arg === "--limit" || arg.startsWith("--limit=")) {
			const raw = valueOf(i, arg);
			if (!arg.includes("=")) i++;
			const n = raw ? parseInt(raw, 10) : NaN;
			if (!isNaN(n) && n > 0) opts.limit = n;
			else {
				console.error(`ERROR: --limit must be a positive integer, got: ${raw}`);
				process.exit(1);
			}
		} else if (arg.startsWith("--")) {
			console.error(`ERROR: unknown flag ${arg}`);
			process.exit(1);
		}
	}

	return opts;
}

function printHelp(): void {
	console.log(`
backfill-commission-rule.ts — void POS-pending commission splits whose
linked appointment has not yet completed or been cancelled.

USAGE
  bun run scripts/backfill-commission-rule.ts [options]

OPTIONS
  --dry-run      Scan and report only; write nothing (DEFAULT)
  --apply        Commit the UPDATE statements
  --tenant <id>  Restrict to one organization ID (staged rollout)
  --limit <n>    Cap rows touched per tenant (safety belt)
  --help         Show this message

EXAMPLES
  # See what would be voided (safe — no writes)
  bun run scripts/backfill-commission-rule.ts

  # Apply to a single test tenant
  bun run scripts/backfill-commission-rule.ts --apply --tenant 996febce-aaad-4ded-8f47-02d2b566c8ee

  # Apply to all tenants, capped at 1000 rows each
  bun run scripts/backfill-commission-rule.ts --apply --limit 1000

MONITORING
  Review per-tenant summary at the end. "Voided" count should match
  "To void" from a preceding dry-run. Any discrepancy = investigate.
`);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const match = trimmed.match(/^([^=]+)=(.*)$/);
			if (match?.[1] && match[2] !== undefined) {
				const key = match[1].trim();
				const value = match[2].trim().replace(/^["']|["']$/g, "");
				if (!process.env[key]) process.env[key] = value;
			}
		}
	} catch {
		console.warn("Could not load .dev.vars — relying on process.env");
	}
}

// ---------------------------------------------------------------------------
// Per-tenant result
// ---------------------------------------------------------------------------

interface TenantResult {
	orgId: string;
	orgName: string;
	scanned: number;
	voided: number;
	skipped: number; // limit caused early stop
	error?: string;
}

// ---------------------------------------------------------------------------
// Core logic — scan qualifying rows
// ---------------------------------------------------------------------------

/**
 * Returns IDs of commission_splits rows that match the backfill criteria
 * for one tenant DB. Pure read — no writes.
 *
 * Criteria (all must be true):
 *   cs.status = 'pending'
 *   cs.salesOrderId IS NOT NULL
 *   (cs.earnReason IS NULL OR cs.earnReason != 'pos_product')
 *   soi.serviceId IS NOT NULL   (service line, not product)
 *   appt.status NOT IN ('completed', 'cancelled')
 *
 * JOIN path:
 *   commission_splits cs
 *     JOIN sales_order_items soi ON soi.sales_order_id = cs.sales_order_id
 *                                AND soi.service_id IS NOT NULL
 *     JOIN appointments appt     ON appt.id = soi.appointment_id
 *                                AND appt.status NOT IN ('completed', 'cancelled')
 *
 * Note: a sales order can have multiple items; we use DISTINCT on cs.id so
 * one split isn't counted multiple times when multiple service items link to it.
 */
async function findQualifyingIds(
	tenantDb: ReturnType<typeof drizzle<typeof tenantSchema>>,
	limitRows: number | null,
): Promise<string[]> {
	// We run a raw SQL query for the multi-join because Drizzle's relational
	// query builder doesn't cleanly express JOIN + DISTINCT on the outer table
	// without pulling every column into memory.
	const limitClause = limitRows != null ? sql` LIMIT ${limitRows}` : sql``;

	const result = await tenantDb.execute<{ id: string }>(sql`
		SELECT DISTINCT cs.id
		FROM commission_splits cs
		JOIN sales_order_items soi
			ON  soi.sales_order_id = cs.sales_order_id
			AND soi.service_id IS NOT NULL
		JOIN appointments appt
			ON  appt.id = soi.appointment_id
			AND appt.status NOT IN ('completed', 'cancelled')
		WHERE
			cs.status = 'pending'
			AND cs.sales_order_id IS NOT NULL
			AND (cs.earn_reason IS NULL OR cs.earn_reason <> 'pos_product')
		${limitClause}
	`);

	return result.rows.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Core logic — apply voids in chunks inside a transaction
// ---------------------------------------------------------------------------

async function voidChunked(
	tenantDb: ReturnType<typeof drizzle<typeof tenantSchema>>,
	ids: string[],
	orgName: string,
): Promise<number> {
	const { commissionSplits } = tenantSchema;

	let totalVoided = 0;
	const chunks: string[][] = [];
	for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
		chunks.push(ids.slice(i, i + CHUNK_SIZE));
	}

	await tenantDb.transaction(async (tx) => {
		for (let ci = 0; ci < chunks.length; ci++) {
			const chunk = chunks[ci]!;
			const updated = await tx
				.update(commissionSplits)
				.set({
					status: "voided",
					notes: sql`COALESCE(${commissionSplits.notes}, '') || ${BACKFILL_NOTE}`,
					updatedAt: new Date(),
				})
				.where(inArray(commissionSplits.id, chunk))
				.returning({ id: commissionSplits.id });

			totalVoided += updated.length;
			console.log(
				`  [${orgName}] batch ${ci + 1}/${chunks.length} — updated ${updated.length} row(s) (running total: ${totalVoided})`,
			);
		}
	});

	return totalVoided;
}

// ---------------------------------------------------------------------------
// Per-tenant entry point
// ---------------------------------------------------------------------------

async function processTenant(
	org: { id: string; name: string; connectionString: string },
	opts: CliOptions,
): Promise<TenantResult> {
	const result: TenantResult = {
		orgId: org.id,
		orgName: org.name,
		scanned: 0,
		voided: 0,
		skipped: 0,
	};

	let tenantPool: Pool | null = null;

	try {
		const connectionString = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// --- Scan ---
		const qualifyingIds = await findQualifyingIds(tenantDb, opts.limit);
		result.scanned = qualifyingIds.length;

		if (opts.limit != null && qualifyingIds.length >= opts.limit) {
			// We hit the limit; real count may be higher
			result.skipped = 1; // Flag that limit was reached
			console.log(
				`  [${org.name}] limit reached at ${opts.limit} — there may be more rows beyond this cap`,
			);
		}

		if (qualifyingIds.length === 0) {
			console.log(`  [${org.name}] nothing to void`);
			return result;
		}

		console.log(
			`  [${org.name}] found ${qualifyingIds.length} row(s) to void`,
		);

		if (opts.dryRun) {
			// Do not write anything
			return result;
		}

		// --- Apply ---
		result.voided = await voidChunked(tenantDb, qualifyingIds, org.name);
	} catch (err) {
		result.error =
			err instanceof Error ? err.message : String(err);
		console.error(`  [${org.name}] ERROR: ${result.error}`);
	} finally {
		if (tenantPool) {
			try {
				await tenantPool.end();
			} catch {
				// ignore cleanup errors
			}
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const opts = parseArgs();

	if (opts.help) {
		printHelp();
		process.exit(0);
	}

	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("ERROR: DATABASE_URL is not set. Load .dev.vars or export the variable.");
		process.exit(1);
	}

	// Banner
	console.log("\nCommission-Rule Backfill — migration 0051 rule realignment");
	console.log("===========================================================");
	if (opts.dryRun) {
		console.log("MODE: DRY RUN — no changes written. Use --apply to commit.");
	} else {
		console.log("MODE: APPLY — changes will be committed.");
	}
	if (opts.tenantId) console.log(`FILTER: tenant ${opts.tenantId}`);
	if (opts.limit != null) console.log(`LIMIT: ${opts.limit} rows per tenant`);
	console.log("");

	// Build control-panel DB client directly (script context, not Cloudflare Workers)
	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	try {
		// Fetch all orgs (or just the target one)
		let orgs = await controlPanelDb.query.organizations.findMany({
			columns: { id: true, name: true, connectionString: true },
			orderBy: (t, { asc }) => asc(t.name),
		});

		if (opts.tenantId) {
			orgs = orgs.filter((o) => o.id === opts.tenantId);
			if (orgs.length === 0) {
				console.error(`ERROR: tenant ${opts.tenantId} not found in control panel`);
				process.exit(1);
			}
		}

		console.log(`Found ${orgs.length} tenant(s)\n`);

		// Process tenants sequentially (each gets its own connection + transaction)
		const results: TenantResult[] = [];
		for (const org of orgs) {
			console.log(`Processing: ${org.name} (${org.id})`);
			const r = await processTenant(org, opts);
			results.push(r);
		}

		// Summary table
		console.log("\n--- Summary ---\n");
		const colW = [36, 8, 8, 8, 10];
		const header = [
			"Tenant".padEnd(colW[0]!),
			"Scanned".padEnd(colW[1]!),
			"Voided".padEnd(colW[2]!),
			"Skipped".padEnd(colW[3]!),
			"Status".padEnd(colW[4]!),
		].join(" | ");
		console.log(header);
		console.log("-".repeat(header.length));

		for (const r of results) {
			const status = r.error ? "ERROR" : opts.dryRun ? "dry-run" : "ok";
			console.log(
				[
					r.orgName.slice(0, colW[0]!).padEnd(colW[0]!),
					String(r.scanned).padEnd(colW[1]!),
					String(opts.dryRun ? "-" : r.voided).padEnd(colW[2]!),
					String(r.skipped ? `yes (capped)` : "-").padEnd(colW[3]!),
					status.padEnd(colW[4]!),
				].join(" | "),
			);
		}

		const totalScanned = results.reduce((s, r) => s + r.scanned, 0);
		const totalVoided = results.reduce((s, r) => s + r.voided, 0);
		const errors = results.filter((r) => r.error);

		console.log(`\nTotal scanned: ${totalScanned}`);
		if (!opts.dryRun) {
			console.log(`Total voided:  ${totalVoided}`);
		}
		if (errors.length > 0) {
			console.log(`\nErrors (${errors.length}):`);
			for (const e of errors) {
				console.log(`  ${e.orgName}: ${e.error}`);
			}
		}

		if (opts.dryRun) {
			console.log(
				"\nDRY RUN — no changes written. Use --apply to commit.",
			);
		} else {
			console.log("\nDone.");
		}
	} finally {
		await controlPanelPool.end();
	}
}

if (import.meta.main) {
	main().then(() => process.exit(0)).catch((err) => {
		console.error("\nFatal error:", err);
		process.exit(1);
	});
}
