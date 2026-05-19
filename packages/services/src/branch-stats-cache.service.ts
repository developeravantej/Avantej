/**
 * Branch Stats Cache Service
 *
 * Write-through cache for branch-level aggregates (member counts, revenue).
 * Provides a debounced `refresh` function that coalesces bursts within a 2-second
 * window before executing a single UPSERT into `branch_stats_cache`.
 *
 * Design decisions:
 * - Module-scope pending Set coalesces bursts (e.g. 20 sales in 2s → 1 refresh).
 * - Service is INTERNAL — not exposed as an oRPC procedure.
 * - Revenue counts confirmed + completed sales for the current calendar month.
 * - Members counts status='active' only.
 * - Staff counts role IN ('admin','staff','trainer').
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { branchStatsCache } from "@avantej-core/db/schema/tenant/branch-stats-cache";
import { members } from "@avantej-core/db/schema/tenant/members";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { eq, and, inArray, gte, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type StatKind = "members" | "staff" | "revenue";

/** Module-scope debounce registry: key = `${nodeId}:${kind}` */
const pending = new Set<string>();

/**
 * Debounced branch stats refresh.
 *
 * Calling this multiple times within 2 seconds for the same (nodeId, kind)
 * results in exactly one UPSERT. Safe to call fire-and-forget (void).
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId   - UUID of the hierarchy node (branch)
 * @param kind     - Which aggregate to recompute
 */
export function refresh(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	nodeId: string,
	kind: StatKind,
): void {
	const key = `${nodeId}:${kind}`;
	if (pending.has(key)) return; // already scheduled — coalesce

	pending.add(key);

	setTimeout(async () => {
		pending.delete(key);
		try {
			await executeRefresh(tenantDb, nodeId, kind);
		} catch (err) {
			// Refresh failures must not crash the caller — log and continue
			console.error(
				JSON.stringify({
					event: "branch_stats_refresh_failed",
					nodeId,
					kind,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}, 2_000);
}

/**
 * Immediate (non-debounced) refresh — used by the backfill script.
 * Resolves when the UPSERT is committed.
 */
export async function refreshNow(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	nodeId: string,
	kind: StatKind,
): Promise<void> {
	await executeRefresh(tenantDb, nodeId, kind);
}

async function executeRefresh(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	nodeId: string,
	kind: StatKind,
): Promise<void> {
	const now = new Date();

	if (kind === "members") {
		const [row] = await tenantDb
			.select({ count: sql<string>`COUNT(*)` })
			.from(members)
			.where(
				and(
					eq(members.hierarchyScopeId, nodeId),
					eq(members.status, "active"),
				),
			);
		const count = Number(row?.count ?? 0);

		await tenantDb
			.insert(branchStatsCache)
			.values({
				hierarchyNodeId: nodeId,
				membersCount: count,
				staffCount: 0,
				monthRevenueCents: 0,
				monthRevenuePeriodStart: now,
				computedAt: now,
			})
			.onConflictDoUpdate({
				target: branchStatsCache.hierarchyNodeId,
				set: {
					membersCount: count,
					computedAt: now,
				},
			});
		return;
	}

	if (kind === "staff") {
		const [row] = await tenantDb
			.select({ count: sql<string>`COUNT(*)` })
			.from(members)
			.where(
				and(
					eq(members.hierarchyScopeId, nodeId),
					inArray(members.role, ["admin", "staff", "trainer"]),
				),
			);
		const count = Number(row?.count ?? 0);

		await tenantDb
			.insert(branchStatsCache)
			.values({
				hierarchyNodeId: nodeId,
				membersCount: 0,
				staffCount: count,
				monthRevenueCents: 0,
				monthRevenuePeriodStart: now,
				computedAt: now,
			})
			.onConflictDoUpdate({
				target: branchStatsCache.hierarchyNodeId,
				set: {
					staffCount: count,
					computedAt: now,
				},
			});
		return;
	}

	// kind === "revenue"
	const periodStart = sql<Date>`date_trunc('month', NOW())`;

	const [revRow] = await tenantDb
		.select({ total: sql<string>`COALESCE(SUM(total_amount), 0)` })
		.from(salesOrders)
		.where(
			and(
				eq(salesOrders.branchId, nodeId),
				inArray(salesOrders.status, ["confirmed", "completed"]),
				gte(salesOrders.date, sql`date_trunc('month', NOW())`),
			),
		);
	const revenueCents = Number(revRow?.total ?? 0);

	await tenantDb
		.insert(branchStatsCache)
		.values({
			hierarchyNodeId: nodeId,
			membersCount: 0,
			staffCount: 0,
			monthRevenueCents: revenueCents,
			monthRevenuePeriodStart: sql`date_trunc('month', NOW())`,
			computedAt: now,
		})
		.onConflictDoUpdate({
			target: branchStatsCache.hierarchyNodeId,
			set: {
				monthRevenueCents: revenueCents,
				monthRevenuePeriodStart: periodStart,
				computedAt: now,
			},
		});
}
