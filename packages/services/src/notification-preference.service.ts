/**
 * Notification Preference Service
 *
 * Handles user notification preferences (get/upsert by user_id) in tenant databases.
 *
 * Usage:
 * ```typescript
 * import { getNotificationPreferences, upsertNotificationPreferences } from "@avantej-core/services";
 * const prefs = await getNotificationPreferences(tenantDb, userId);
 * ```
 */

import { eq } from "drizzle-orm";
import { notificationPreferences } from "@avantej-core/db/schema/tenant/notification-preferences";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type UpsertNotificationPreferencesParams = {
	userId: string;
	emailEnabled?: boolean;
	smsEnabled?: boolean;
	pushEnabled?: boolean;
	bookingReminders?: boolean;
	bookingConfirmations?: boolean;
	promotionalEmails?: boolean;
	packageExpiry?: boolean;
};

/**
 * Get notification preferences for a user. Creates default row if not found.
 */
export async function getNotificationPreferences(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	userId: string,
): Promise<typeof notificationPreferences.$inferSelect | null> {
	const row = await tenantDb.query.notificationPreferences.findFirst({
		where: eq(notificationPreferences.userId, userId),
	});
	return row ?? null;
}

/**
 * Upsert notification preferences for a user.
 */
export async function upsertNotificationPreferences(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: UpsertNotificationPreferencesParams,
): Promise<typeof notificationPreferences.$inferSelect> {
	const existing = await getNotificationPreferences(tenantDb, params.userId);

	const values = {
		emailEnabled: params.emailEnabled ?? existing?.emailEnabled ?? true,
		smsEnabled: params.smsEnabled ?? existing?.smsEnabled ?? false,
		pushEnabled: params.pushEnabled ?? existing?.pushEnabled ?? true,
		bookingReminders:
			params.bookingReminders ?? existing?.bookingReminders ?? true,
		bookingConfirmations:
			params.bookingConfirmations ?? existing?.bookingConfirmations ?? true,
		promotionalEmails:
			params.promotionalEmails ?? existing?.promotionalEmails ?? true,
		packageExpiry: params.packageExpiry ?? existing?.packageExpiry ?? true,
		updatedAt: new Date(),
	};

	if (existing) {
		const [row] = await tenantDb
			.update(notificationPreferences)
			.set(values)
			.where(eq(notificationPreferences.userId, params.userId))
			.returning();
		if (!row) throw new Error("Failed to update notification preferences");
		return row;
	}

	const [row] = await tenantDb
		.insert(notificationPreferences)
		.values({
			userId: params.userId,
			...values,
		})
		.returning();
	if (!row) throw new Error("Failed to create notification preferences");
	return row;
}
