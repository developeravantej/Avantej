/**
 * User Activity Log Service
 *
 * Handles listing user activity for "Recent Activity" dashboard widget.
 *
 * Usage:
 * ```typescript
 * import { listUserActivityLog } from "@avantej-core/services";
 * const activities = await listUserActivityLog(tenantDb, { userId, limit: 10 });
 * ```
 */

import { eq, and, desc } from "drizzle-orm";
import { userActivityLog } from "@avantej-core/db/schema/tenant/user-activity-log";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListUserActivityLogParams = {
	userId: string;
	activityType?: string;
	limit?: number;
};

/**
 * List activity log entries for a user.
 */
export async function listUserActivityLog(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: ListUserActivityLogParams,
): Promise<(typeof userActivityLog.$inferSelect)[]> {
	const { userId, activityType, limit = 20 } = params;

	const conditions = [eq(userActivityLog.userId, userId)];
	if (activityType) {
		conditions.push(eq(userActivityLog.activityType, activityType));
	}

	return tenantDb.query.userActivityLog.findMany({
		where:
			conditions.length > 1
				? and(...conditions)
				: eq(userActivityLog.userId, userId),
		orderBy: [desc(userActivityLog.createdAt)],
		limit: Math.min(limit, 100),
	});
}
