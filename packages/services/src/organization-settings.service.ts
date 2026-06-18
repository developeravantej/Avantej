/**
 * Organization Settings Service
 *
 * Key/value store for tenant-level configuration.
 * Used for settings like grace period days, feature flags, etc.
 */

import { eq } from "drizzle-orm";
import { organizationSettings } from "@avantej-core/db/schema/tenant/organization-settings";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

/**
 * Get a setting value by key. Returns null if not found.
 */
export async function getSetting(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	key: string,
): Promise<string | null> {
	const row = await tenantDb.query.organizationSettings.findFirst({
		where: eq(organizationSettings.key, key),
	});
	return row?.value ?? null;
}

/**
 * Upsert a setting. Creates if not exists, updates if exists.
 */
export async function upsertSetting(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	key: string,
	value: string,
	updatedBy?: string,
): Promise<{ key: string; value: string }> {
	const now = new Date();
	const [row] = await tenantDb
		.insert(organizationSettings)
		.values({
			key,
			value,
			updatedBy: updatedBy ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: organizationSettings.key,
			set: {
				value,
				updatedBy: updatedBy ?? null,
				updatedAt: now,
			},
		})
		.returning();

	if (!row) throw new Error("Failed to upsert setting");
	return { key: row.key, value: row.value };
}
