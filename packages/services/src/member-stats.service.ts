/**
 * Member Stats Service
 *
 * Provides aggregate member statistics for dashboard widgets.
 *
 * newToday: count and top-3 most recent members who joined since the start
 * of today (UTC), scoped by accessibleNodeIds (branchId via hierarchyScopeId).
 *
 * RBAC: callers must have member_management:read. This service performs no
 * auth checks — the router layer is responsible.
 */

import { and, desc, gte, inArray, sql } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewMemberEntry {
	id: string;
	userId: string;
	joinedAt: Date;
}

export interface NewTodayResult {
	count: number;
	recent: NewMemberEntry[];
}

// ---------------------------------------------------------------------------
// 1.32 — newToday
// ---------------------------------------------------------------------------

/**
 * Returns the count of members who joined today (UTC) plus the 3 most recent.
 *
 * Scoping:
 * - When accessibleNodeIds is empty (admin sees all), no hierarchy filter.
 * - When accessibleNodeIds is non-empty, restricts to members whose
 *   hierarchyScopeId is in the accessible set.
 * - branchId (optional) further narrows to a single branch node.
 *
 * All filters applied in SQL — no in-memory filtering.
 */
export async function getMembersNewToday(
	tenantDb: TenantDb,
	options: {
		accessibleNodeIds: string[];
		branchId?: string;
	},
): Promise<NewTodayResult> {
	const { accessibleNodeIds, branchId } = options;

	// Start of today in UTC
	const todayStart = sql<Date>`date_trunc('day', NOW() AT TIME ZONE 'UTC')`;

	const conditions = [gte(members.joinedAt, todayStart)];

	// Hierarchy scope filter
	const scopeIds = branchId ? [branchId] : accessibleNodeIds;

	if (scopeIds.length > 0) {
		conditions.push(inArray(members.hierarchyScopeId, scopeIds));
	}

	const whereClause = and(...conditions);

	const [countResult, recentRows] = await Promise.all([
		// Total count for today
		tenantDb
			.select({ cnt: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(members)
			.where(whereClause),

		// Top 3 most recent by joinedAt DESC
		tenantDb
			.select({
				id: members.id,
				userId: members.userId,
				joinedAt: members.joinedAt,
			})
			.from(members)
			.where(whereClause)
			.orderBy(desc(members.joinedAt))
			.limit(3),
	]);

	return {
		count: countResult[0]?.cnt ?? 0,
		recent: recentRows.map((r) => ({
			id: r.id,
			userId: r.userId,
			joinedAt: r.joinedAt,
		})),
	};
}
