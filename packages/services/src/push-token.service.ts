/**
 * Push Token Service
 *
 * Manages Expo push notification token storage per device per user.
 * Tokens live in tenant DBs and are upserted on registration (unique on token).
 *
 * Usage:
 * ```typescript
 * import {
 *   registerPushToken,
 *   unregisterPushToken,
 *   getPushTokensForUser,
 * } from "@avantej-core/services";
 * ```
 */

import { eq } from "drizzle-orm";
import { pushTokens } from "@avantej-core/db/schema/tenant/push-tokens";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type RegisterPushTokenParams = {
	userId: string;
	token: string;
	platform: "ios" | "android";
	deviceId?: string;
};

/**
 * Register (upsert) a push token. Unique on token — re-registering
 * the same token updates the row (userId / platform / deviceId / updatedAt).
 */
export async function registerPushToken(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: RegisterPushTokenParams,
): Promise<{ id: string }> {
	const { userId, token, platform, deviceId } = params;

	const [row] = await tenantDb
		.insert(pushTokens)
		.values({
			userId,
			token,
			platform,
			deviceId: deviceId ?? null,
		})
		.onConflictDoUpdate({
			target: pushTokens.token,
			set: {
				userId,
				platform,
				deviceId: deviceId ?? null,
				updatedAt: new Date(),
			},
		})
		.returning({ id: pushTokens.id });

	if (!row) {
		throw new Error("Failed to register push token: no row returned");
	}
	return { id: row.id };
}

/**
 * Unregister a push token (delete by token). Used on logout.
 */
export async function unregisterPushToken(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	token: string,
): Promise<{ success: true }> {
	await tenantDb.delete(pushTokens).where(eq(pushTokens.token, token));
	return { success: true };
}

/**
 * List all push tokens for a user. Used by push delivery service to fan out
 * a notification to every registered device.
 */
export async function getPushTokensForUser(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	userId: string,
): Promise<(typeof pushTokens.$inferSelect)[]> {
	return tenantDb.query.pushTokens.findMany({
		where: eq(pushTokens.userId, userId),
	});
}
