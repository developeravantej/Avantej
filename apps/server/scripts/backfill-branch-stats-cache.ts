/**
 * Script: Backfill Branch Stats Cache
 *
 * Computes initial branch_stats_cache values for every hierarchy_nodes row
 * across all tenant databases. Idempotent — safe to run multiple times.
 *
 * Usage (from apps/server):
 *   bun run scripts/backfill-branch-stats-cache.ts [options]
 *
 * Options:
 *   --dry-run          List tenants without writing any cache rows
 *   --concurrency=N    Parallel tenants (default: 5)
 *   --filter=slug      Only process tenants matching the slug substring
 *
 * Behaviour:
 *   For every hierarchy_nodes row, computes:
 *     membersCount  — COUNT(members) WHERE hierarchyScopeId = nodeId AND status = 'active'
 *     staffCount    — COUNT(members) WHERE hierarchyScopeId = nodeId AND role IN ('admin','staff','trainer')
 *     monthRevenueCents — SUM(total_amount) on sales_orders WHERE branchId = nodeId
 *                         AND status IN ('confirmed','completed')
 *                         AND date >= date_trunc('month', NOW())
 *   UPSERTs all three into branch_stats_cache in one pass per node.
 */

import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { branchStatsCache } from "@avantej-core/db/schema/tenant/branch-stats-cache";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { and, eq, inArray, gte, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	dryRun: boolean;
	concurrency: number;
	filter: string | null;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = { dryRun: false, concurrency: 5, filter: null };
	for (const arg of args) {
		if (arg === "--dry-run") options.dryRun = true;
		else if (arg.startsWith("--concurrency=")) {
			const v = parseInt(arg.split("=")[1] ?? "5", 10);
			if (!isNaN(v) && v > 0) options.concurrency = v;
		} else if (arg.startsWith("--filter=")) {
			options.filter = arg.split("=")[1] ?? null;
		}
	}
	return options;
}

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const [key, ...valueParts] = trimmed.split("=");
			if (key && valueParts.length > 0) {
				const value = valueParts
					.join("=")
					.trim()
					.replace(/^["']|["']$/g, "");
				process.env[key.trim()] = value;
			}
		}
	} catch {
		console.warn("Could not load .dev.vars — using existing env vars");
	}
}

// ---------------------------------------------------------------------------
// Per-tenant backfill
// ---------------------------------------------------------------------------

interface BackfillResult {
	organizationId: string;
	organizationName: string;
	slug: string;
	success: boolean;
	nodesProcessed: number;
	error?: string;
}

async function backfillOneTenant(
	org: { id: string; name: string; slug: string; connectionString: string },
	dryRun: boolean,
): Promise<BackfillResult> {
	const result: BackfillResult = {
		organizationId: org.id,
		organizationName: org.name,
		slug: org.slug,
		success: false,
		nodesProcessed: 0,
	};

	const pool = new Pool({ connectionString: org.connectionString });
	try {
		const tenantDb = drizzle({ client: pool, schema: tenantSchema });

		// Fetch all hierarchy nodes
		const nodes = await tenantDb
			.select({ id: hierarchyNodes.id })
			.from(hierarchyNodes);

		if (nodes.length === 0) {
			result.success = true;
			return result;
		}

		const nodeIds = nodes.map((n) => n.id);
		const now = new Date();

		// Aggregate members (active count) per node
		const memberRows = await tenantDb
			.select({
				nodeId: members.hierarchyScopeId,
				count: sql<string>`COUNT(*)`,
			})
			.from(members)
			.where(
				and(
					inArray(members.hierarchyScopeId, nodeIds),
					eq(members.status, "active"),
				),
			)
			.groupBy(members.hierarchyScopeId);

		const memberMap = new Map(
			memberRows.map((r) => [r.nodeId, Number(r.count)]),
		);

		// Aggregate staff count per node
		const staffRows = await tenantDb
			.select({
				nodeId: members.hierarchyScopeId,
				count: sql<string>`COUNT(*)`,
			})
			.from(members)
			.where(
				and(
					inArray(members.hierarchyScopeId, nodeIds),
					inArray(members.role, ["admin", "staff", "trainer"]),
				),
			)
			.groupBy(members.hierarchyScopeId);

		const staffMap = new Map(staffRows.map((r) => [r.nodeId, Number(r.count)]));

		// Aggregate month revenue per node
		const revenueRows = await tenantDb
			.select({
				nodeId: salesOrders.branchId,
				total: sql<string>`COALESCE(SUM(total_amount), 0)`,
			})
			.from(salesOrders)
			.where(
				and(
					inArray(salesOrders.branchId, nodeIds),
					inArray(salesOrders.status, ["confirmed", "completed"]),
					gte(salesOrders.date, sql`date_trunc('month', NOW())`),
				),
			)
			.groupBy(salesOrders.branchId);

		const revenueMap = new Map(
			revenueRows.map((r) => [r.nodeId, Number(r.total)]),
		);

		if (dryRun) {
			console.log(
				`  [DRY RUN] ${org.name} (${org.slug}): would upsert ${nodes.length} node(s)`,
			);
			result.nodesProcessed = nodes.length;
			result.success = true;
			return result;
		}

		// UPSERT all nodes in a single batch
		const upsertValues = nodeIds.map((id) => ({
			hierarchyNodeId: id,
			membersCount: memberMap.get(id) ?? 0,
			staffCount: staffMap.get(id) ?? 0,
			monthRevenueCents: revenueMap.get(id) ?? 0,
			monthRevenuePeriodStart: sql`date_trunc('month', NOW())`,
			computedAt: now,
		}));

		// Process in chunks of 50 to avoid parameter limits
		const CHUNK_SIZE = 50;
		for (let i = 0; i < upsertValues.length; i += CHUNK_SIZE) {
			const chunk = upsertValues.slice(i, i + CHUNK_SIZE);
			await tenantDb
				.insert(branchStatsCache)
				.values(chunk)
				.onConflictDoUpdate({
					target: branchStatsCache.hierarchyNodeId,
					set: {
						membersCount: sql`excluded.members_count`,
						staffCount: sql`excluded.staff_count`,
						monthRevenueCents: sql`excluded.month_revenue_cents`,
						monthRevenuePeriodStart: sql`excluded.month_revenue_period_start`,
						computedAt: sql`excluded.computed_at`,
					},
				});
		}

		result.nodesProcessed = nodes.length;
		result.success = true;
	} catch (err) {
		result.error = err instanceof Error ? err.message : String(err);
	} finally {
		await pool.end();
	}

	return result;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function processBatches(
	orgs: { id: string; name: string; slug: string; connectionString: string }[],
	concurrency: number,
	dryRun: boolean,
): Promise<BackfillResult[]> {
	const results: BackfillResult[] = [];
	for (let i = 0; i < orgs.length; i += concurrency) {
		const batch = orgs.slice(i, i + concurrency);
		const batchNum = Math.floor(i / concurrency) + 1;
		const totalBatches = Math.ceil(orgs.length / concurrency);
		console.log(
			`\nBatch ${batchNum}/${totalBatches} (${batch.length} tenant(s))...`,
		);

		const settled = await Promise.allSettled(
			batch.map((org) => backfillOneTenant(org, dryRun)),
		);

		for (const s of settled) {
			if (s.status === "fulfilled") {
				const r = s.value;
				results.push(r);
				if (r.success) {
					console.log(
						`  [OK] ${r.organizationName} (${r.slug}): ${r.nodesProcessed} node(s)`,
					);
				} else {
					console.log(`  [FAIL] ${r.organizationName} (${r.slug}): ${r.error}`);
				}
			} else {
				console.log(`  [ERROR] Unexpected: ${s.reason}`);
			}
		}
	}
	return results;
}

async function main() {
	loadDevVars();
	const options = parseArgs();
	const controlPanelDb = getControlPanelDb();

	console.log("\nBranch Stats Cache Backfill");
	console.log("===========================");
	console.log(`Dry run: ${options.dryRun}`);
	console.log(`Concurrency: ${options.concurrency}`);
	if (options.filter) console.log(`Filter: ${options.filter}`);

	let allOrgs = await controlPanelDb.query.organizations.findMany({
		orderBy: (orgs, { asc }) => asc(orgs.name),
	});

	if (options.filter) {
		allOrgs = allOrgs.filter((o) => o.slug.includes(options.filter!));
	}

	if (allOrgs.length === 0) {
		console.log("\nNo organizations found.");
		return;
	}

	console.log(`\nFound ${allOrgs.length} organization(s)`);

	const orgsWithConn = allOrgs
		.filter((o) => o.connectionString)
		.flatMap((o) => {
			try {
				return [
					{
						id: o.id,
						name: o.name,
						slug: o.slug,
						connectionString: decrypt(o.connectionString!),
					},
				];
			} catch (err) {
				console.warn(
					`  [SKIP] ${o.name} (${o.slug}): ${(err as Error).message}`,
				);
				return [];
			}
		});

	const results = await processBatches(
		orgsWithConn,
		options.concurrency,
		options.dryRun,
	);

	const successful = results.filter((r) => r.success).length;
	const failed = results.filter((r) => !r.success).length;
	const totalNodes = results.reduce((s, r) => s + r.nodesProcessed, 0);

	console.log("\n--- Backfill Summary ---");
	console.log(`Tenants processed: ${results.length}`);
	console.log(`Successful: ${successful}`);
	console.log(`Failed: ${failed}`);
	console.log(`Total nodes upserted: ${totalNodes}`);

	if (failed > 0) {
		console.log("\nFailed tenants:");
		for (const r of results.filter((r) => !r.success)) {
			console.log(`  - ${r.organizationName} (${r.slug}): ${r.error}`);
		}
		process.exit(1);
	}
}

main()
	.then(() => {
		console.log("\nDone!");
		process.exit(0);
	})
	.catch((err) => {
		console.error("\nFatal error:", err);
		process.exit(1);
	});
