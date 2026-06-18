/**
 * Preferred Time Service
 *
 * Handles preferred scheduling times for package instances (max 4 per instance).
 *
 * Usage:
 * ```typescript
 * import { listPreferredTimes, upsertPreferredTimes } from "@avantej-core/services";
 * const times = await listPreferredTimes(tenantDb, packageInstanceId);
 * ```
 */

import { eq } from "drizzle-orm";
import { preferredTimes } from "@avantej-core/db/schema/tenant/preferred-times";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type PreferredTimeInput = {
	dayOfWeek: string;
	time: string;
	priority: number;
};

const VALID_DAYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];
const MAX_PREFERRED_TIMES = 4;

/**
 * List preferred times for a package instance.
 */
export async function listPreferredTimes(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
): Promise<(typeof preferredTimes.$inferSelect)[]> {
	return tenantDb.query.preferredTimes.findMany({
		where: eq(preferredTimes.packageInstanceId, packageInstanceId),
		orderBy: [preferredTimes.priority],
	});
}

/**
 * Upsert preferred times for a package instance. Replaces existing; max 4.
 */
export async function upsertPreferredTimes(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	packageInstanceId: string,
	items: PreferredTimeInput[],
): Promise<(typeof preferredTimes.$inferSelect)[]> {
	if (items.length > MAX_PREFERRED_TIMES) {
		throw new Error(
			`Maximum ${MAX_PREFERRED_TIMES} preferred times per instance`,
		);
	}

	for (const item of items) {
		const day = item.dayOfWeek.toLowerCase();
		if (!VALID_DAYS.includes(day)) {
			throw new Error(`Invalid dayOfWeek: ${item.dayOfWeek}`);
		}
		if (item.priority < 1 || item.priority > MAX_PREFERRED_TIMES) {
			throw new Error(`Priority must be 1-${MAX_PREFERRED_TIMES}`);
		}
	}

	await tenantDb
		.delete(preferredTimes)
		.where(eq(preferredTimes.packageInstanceId, packageInstanceId));

	if (items.length === 0) {
		return [];
	}

	const rows = await tenantDb
		.insert(preferredTimes)
		.values(
			items.map((item) => ({
				packageInstanceId,
				dayOfWeek: item.dayOfWeek.toLowerCase(),
				time: item.time,
				priority: item.priority,
			})),
		)
		.returning();

	return rows;
}
