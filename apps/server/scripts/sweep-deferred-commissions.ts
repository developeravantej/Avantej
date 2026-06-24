#!/usr/bin/env bun
/**
 * sweep-deferred-commissions.ts — surface POS service lines with stuck deferred commissions.
 *
 * BACKGROUND (Q-2 Option B follow-up)
 * ====================================
 * Migration 0051 introduced `commission_deferred = true` on `sales_order_items` for
 * service lines sold at POS. Commission splits for these lines are only created when
 * the linked appointment transitions to completed/cancelled. If the appointment is never
 * resolved (no-show, data entry error, integration gap), the commission is permanently
 * stuck — never earned, never surfaced.
 *
 * This script finds those stuck rows and surfaces them as a report so the team can
 * investigate and manually resolve. It does NOT auto-resolve or auto-create splits
 * (by design — see TODO below).
 *
 * STUCK CRITERIA (all must be true)
 * ==================================
 *   1. sales_order_items.commission_deferred = true
 *   2. sales_order_items.created_at < NOW() - INTERVAL '<days> days'  (default 30)
 *   3. The parent sales_order has NO commission_splits row pointing at it
 *      (i.e. no split has been generated for the order yet)
 *
 * NOTE: criterion 3 checks at order level (not item level) because commission_splits
 * links to sales_order_id, not sales_order_item_id.
 *
 * OUTPUT
 * ======
 * Per-tenant table:
 *   order_id | order_number | customer | service | age_days | order_total_cents
 *
 * Final summary:
 *   - Total stuck rows across all tenants
 *   - Estimated commission liability at default 10% (1000 bp)
 *
 * TODO: --apply mode
 *   v1 is report-only. A future --apply mode could:
 *   (a) Trigger commission generation for items whose appointment is now resolved, OR
 *   (b) Mark them as permanently excluded with an audit note (e.g. no-show with no pay).
 *   Requires a product decision before implementing.
 *
 * USAGE
 * =====
 *   cd apps/server
 *
 *   # Default: dry-run (report only) across the default test tenant
 *   bun run scripts/sweep-deferred-commissions.ts
 *
 *   # Specific tenant
 *   bun run scripts/sweep-deferred-commissions.ts --tenant=<orgId>
 *
 *   # Override age threshold
 *   bun run scripts/sweep-deferred-commissions.ts --days 60
 *
 *   # All tenants
 *   bun run scripts/sweep-deferred-commissions.ts --all
 *
 *   # Help
 *   bun run scripts/sweep-deferred-commissions.ts --help
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
/** Default 10% rate in basis points — used for estimated liability calculation only */
const DEFAULT_RATE_BPS = 1000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	tenantId: string | null;
	allOrgs: boolean;
	days: number;
	help: boolean;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const opts: CliOptions = {
		tenantId: null,
		allOrgs: false,
		days: 30,
		help: false,
	};

	const valueOf = (i: number, arg: string): string | undefined => {
		const eq = arg.indexOf("=");
		return eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;
		if (arg === "--help" || arg === "-h") {
			opts.help = true;
		} else if (arg === "--all") {
			opts.allOrgs = true;
		} else if (arg === "--tenant" || arg.startsWith("--tenant=")) {
			opts.tenantId = valueOf(i, arg) ?? null;
			if (!arg.includes("=")) i++;
			if (!opts.tenantId) {
				console.error("ERROR: --tenant requires an organization id");
				process.exit(1);
			}
		} else if (arg === "--days" || arg.startsWith("--days=")) {
			const raw = valueOf(i, arg);
			if (!arg.includes("=")) i++;
			const n = raw ? parseInt(raw, 10) : NaN;
			if (!isNaN(n) && n > 0) {
				opts.days = n;
			} else {
				console.error(`ERROR: --days must be a positive integer, got: ${raw}`);
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
sweep-deferred-commissions.ts — find POS service lines with stuck deferred commissions.

USAGE
  bun run scripts/sweep-deferred-commissions.ts [options]

OPTIONS
  --tenant <id>  Restrict to one organization ID (default: test tenant)
  --all          Scan all tenants
  --days <n>     Age threshold in days (default: 30)
  --help         Show this message

NOTE
  This script is report-only (v1). No data is modified.
  See the TODO comment in the script for planned --apply mode.

EXAMPLES
  # Report stuck rows older than 30 days for the default test tenant
  bun run scripts/sweep-deferred-commissions.ts

  # Report for all tenants, threshold = 60 days
  bun run scripts/sweep-deferred-commissions.ts --all --days 60

  # Target a specific tenant
  bun run scripts/sweep-deferred-commissions.ts --tenant=996febce-aaad-4ded-8f47-02d2b566c8ee
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
// Types
// ---------------------------------------------------------------------------

interface StuckRow {
	orderId: string;
	orderNumber: string;
	customerName: string;
	serviceDescription: string;
	ageDays: number;
	orderTotalCents: number;
	itemTotalCents: number;
}

interface TenantSummary {
	orgId: string;
	orgName: string;
	stuckCount: number;
	totalItemCents: number;
	estimatedLiabilityCents: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Core query
// ---------------------------------------------------------------------------

/**
 * Find sales_order_items rows where:
 *   1. commission_deferred = true  (uses partial index sales_order_items_commission_deferred_idx)
 *   2. created_at < NOW() - INTERVAL '<days> days'
 *   3. The parent sales_order has NO commission_splits row linked to it
 *
 * Returns one row per stuck item (a single order can have multiple stuck items).
 */
async function findStuckItems(
	tenantDb: ReturnType<typeof drizzle<typeof tenantSchema>>,
	days: number,
): Promise<StuckRow[]> {
	const result = await tenantDb.execute<{
		order_id: string;
		order_number: string;
		customer_name: string;
		service_description: string;
		age_days: string;
		order_total_cents: string;
		item_total_cents: string;
	}>(sql`
		SELECT
			so.id                        AS order_id,
			so.sales_order_number        AS order_number,
			so.customer_name             AS customer_name,
			soi.description              AS service_description,
			EXTRACT(DAY FROM NOW() - soi.created_at)::int  AS age_days,
			so.total_amount              AS order_total_cents,
			soi.total_price              AS item_total_cents
		FROM sales_order_items soi
		JOIN sales_orders so
			ON  so.id = soi.sales_order_id
		WHERE
			-- Uses partial index: sales_order_items_commission_deferred_idx
			-- (ON created_at WHERE commission_deferred = true)
			soi.commission_deferred = true
			AND soi.created_at < NOW() - MAKE_INTERVAL(days => ${days})
			-- No commission_splits row exists for the parent order yet
			AND NOT EXISTS (
				SELECT 1
				FROM commission_splits cs
				WHERE cs.sales_order_id = so.id
			)
		ORDER BY soi.created_at ASC
	`);

	return result.rows.map((r) => ({
		orderId: r.order_id,
		orderNumber: r.order_number,
		customerName: r.customer_name,
		serviceDescription: r.service_description,
		ageDays: Number(r.age_days),
		orderTotalCents: Number(r.order_total_cents),
		itemTotalCents: Number(r.item_total_cents),
	}));
}

// ---------------------------------------------------------------------------
// Per-tenant processing
// ---------------------------------------------------------------------------

async function processTenant(
	org: { id: string; name: string; connectionString: string },
	days: number,
): Promise<TenantSummary> {
	const summary: TenantSummary = {
		orgId: org.id,
		orgName: org.name,
		stuckCount: 0,
		totalItemCents: 0,
		estimatedLiabilityCents: 0,
	};

	let tenantPool: Pool | null = null;

	try {
		tenantPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		const stuckRows = await findStuckItems(tenantDb, days);
		summary.stuckCount = stuckRows.length;

		if (stuckRows.length === 0) {
			console.log(
				`  [${org.name}] No stuck items found (threshold: ${days} days).`,
			);
			return summary;
		}

		// Per-tenant detail table
		console.log(`\n  [${org.name}] ${stuckRows.length} stuck item(s):\n`);

		const colW = [38, 16, 20, 30, 9, 14];
		const detailHeader = [
			"Order #".padEnd(colW[0]!),
			"Customer".padEnd(colW[1]!),
			"Service".padEnd(colW[2]!),
			"Age (days)".padEnd(colW[3]!),
			"Item (RM)".padEnd(colW[4]!),
			"Order Total".padEnd(colW[5]!),
		].join(" | ");
		console.log(`  ${detailHeader}`);
		console.log(`  ${"-".repeat(detailHeader.length)}`);

		for (const row of stuckRows) {
			summary.totalItemCents += row.itemTotalCents;

			const line = [
				row.orderNumber.slice(0, colW[0]!).padEnd(colW[0]!),
				row.customerName.slice(0, colW[1]!).padEnd(colW[1]!),
				row.serviceDescription.slice(0, colW[2]!).padEnd(colW[2]!),
				String(row.ageDays).padEnd(colW[3]!),
				formatRM(row.itemTotalCents).padEnd(colW[4]!),
				formatRM(row.orderTotalCents).padEnd(colW[5]!),
			].join(" | ");
			console.log(`  ${line}`);
		}

		// Estimated liability: default 10% of item total (rough — does not account for
		// tier-specific rates, caps, floors, or weightage splits).
		summary.estimatedLiabilityCents = Math.floor(
			(summary.totalItemCents * DEFAULT_RATE_BPS) / 10000,
		);
	} catch (err) {
		summary.error = err instanceof Error ? err.message : String(err);
		console.error(`  [${org.name}] ERROR: ${summary.error}`);
	} finally {
		if (tenantPool) {
			try {
				await tenantPool.end();
			} catch {
				// ignore cleanup errors
			}
		}
	}

	return summary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRM(cents: number): string {
	return `RM ${(cents / 100).toFixed(2)}`;
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
		console.error(
			"ERROR: DATABASE_URL is not set. Load .dev.vars or export the variable.",
		);
		process.exit(1);
	}

	// Banner
	console.log("\nDeferred Commission Sweeper — Report Only");
	console.log("==========================================");
	console.log(`Age threshold : ${opts.days} days`);
	console.log(
		`Scope         : ${opts.allOrgs ? "all tenants" : (opts.tenantId ?? DEFAULT_ORG_ID)}`,
	);
	console.log("");

	const controlPanelPool = new Pool({ connectionString: databaseUrl });
	const controlPanelDb = drizzle({
		client: controlPanelPool,
		schema: controlPanelSchema,
	});

	try {
		let orgs: Array<{ id: string; name: string; connectionString: string }>;

		if (opts.allOrgs) {
			orgs = await controlPanelDb.query.organizations.findMany({
				columns: { id: true, name: true, connectionString: true },
				orderBy: (t, { asc }) => asc(t.name),
			});
		} else {
			const targetId = opts.tenantId ?? DEFAULT_ORG_ID;
			const org = await controlPanelDb.query.organizations.findFirst({
				where: (o, { eq }) => eq(o.id, targetId),
				columns: { id: true, name: true, connectionString: true },
			});
			if (!org) {
				console.error(`ERROR: tenant ${targetId} not found in control panel`);
				process.exit(1);
			}
			orgs = [org];
		}

		console.log(`Found ${orgs.length} tenant(s)\n`);

		const summaries: TenantSummary[] = [];
		for (const org of orgs) {
			console.log(`Scanning: ${org.name} (${org.id})`);
			const s = await processTenant(org, opts.days);
			summaries.push(s);
			console.log("");
		}

		// Cross-tenant summary
		console.log("=== Cross-Tenant Summary ===\n");
		const colW2 = [36, 8, 16, 22, 10];
		const summaryHeader = [
			"Tenant".padEnd(colW2[0]!),
			"Stuck".padEnd(colW2[1]!),
			"Item Total".padEnd(colW2[2]!),
			"Est. Liability (10%)".padEnd(colW2[3]!),
			"Status".padEnd(colW2[4]!),
		].join(" | ");
		console.log(summaryHeader);
		console.log("-".repeat(summaryHeader.length));

		for (const s of summaries) {
			const status = s.error ? "ERROR" : "ok";
			console.log(
				[
					s.orgName.slice(0, colW2[0]!).padEnd(colW2[0]!),
					String(s.stuckCount).padEnd(colW2[1]!),
					formatRM(s.totalItemCents).padEnd(colW2[2]!),
					formatRM(s.estimatedLiabilityCents).padEnd(colW2[3]!),
					status.padEnd(colW2[4]!),
				].join(" | "),
			);
		}

		const totalStuck = summaries.reduce((acc, s) => acc + s.stuckCount, 0);
		const totalItemCents = summaries.reduce(
			(acc, s) => acc + s.totalItemCents,
			0,
		);
		const totalLiabilityCents = summaries.reduce(
			(acc, s) => acc + s.estimatedLiabilityCents,
			0,
		);
		const errors = summaries.filter((s) => s.error);

		console.log(`\nTotal stuck rows       : ${totalStuck}`);
		console.log(`Total item value       : ${formatRM(totalItemCents)}`);
		console.log(
			`Est. commission liability (${DEFAULT_RATE_BPS / 100}%): ${formatRM(totalLiabilityCents)}`,
		);
		console.log(
			"\nNote: liability is estimated at a flat 10% rate. Actual amounts depend on tier rates,",
		);
		console.log(
			"      weightage splits, caps, and floors — this is a conservative planning figure only.",
		);

		if (errors.length > 0) {
			console.log(`\nErrors (${errors.length}):`);
			for (const e of errors) {
				console.log(`  ${e.orgName}: ${e.error}`);
			}
		}

		console.log(
			"\nThis script is report-only. See TODO in script for planned --apply mode.",
		);
	} finally {
		await controlPanelPool.end();
	}
}

if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("\nFatal error:", err);
			process.exit(1);
		});
}
