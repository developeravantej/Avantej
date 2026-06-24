/**
 * Push Delivery Service
 *
 * Fire-and-forget Expo Push API delivery. Reads push tokens for a user from
 * the tenant DB and dispatches notifications via expo-server-sdk. Respects
 * the user's `pushEnabled` notification preference. Errors are swallowed —
 * push delivery must never block or fail the notification DB insert.
 *
 * Usage:
 * ```typescript
 * import { sendPushToUser } from "@avantej-core/services";
 * await sendPushToUser(tenantDb, userId, { title, body, data });
 * ```
 */

import { eq } from "drizzle-orm";
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { notificationPreferences } from "@avantej-core/db/schema/tenant/notification-preferences";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getPushTokensForUser } from "./push-token.service";

// Module-singleton — Expo SDK is HTTP-based (fetch under the hood), safe for
// Cloudflare Workers and safe to reuse across requests.
const expo = new Expo();

export type SendPushParams = {
	title: string;
	body: string;
	data?: Record<string, unknown>;
};

/**
 * Send a push notification to every registered device for a user.
 * No-ops if the user has disabled push or has no tokens. Errors are caught
 * and logged but never thrown.
 */
export async function sendPushToUser(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	userId: string,
	notification: SendPushParams,
): Promise<void> {
	try {
		// 1. Respect pushEnabled preference.
		const prefs = await tenantDb.query.notificationPreferences.findFirst({
			where: eq(notificationPreferences.userId, userId),
		});
		if (prefs && !prefs.pushEnabled) return;

		// 2. Load all push tokens for this user.
		const tokens = await getPushTokensForUser(tenantDb, userId);
		if (tokens.length === 0) return;

		// 3. Build Expo messages, filtering invalid tokens.
		const messages: ExpoPushMessage[] = tokens
			.filter((t) => Expo.isExpoPushToken(t.token))
			.map((t) => ({
				to: t.token,
				title: notification.title,
				body: notification.body,
				data: notification.data ?? {},
				sound: "default" as const,
			}));
		if (messages.length === 0) return;

		// 4. Send in chunks. Swallow per-chunk errors so one bad chunk doesn't
		//    block the others.
		const chunks = expo.chunkPushNotifications(messages);
		for (const chunk of chunks) {
			try {
				await expo.sendPushNotificationsAsync(chunk);
			} catch (err) {
				console.error("[push.service] sendPushNotificationsAsync failed:", err);
			}
		}
	} catch (err) {
		// Outer guard: anything else (DB lookup failure, etc.) must not throw.
		console.error("[push.service] sendPushToUser failed:", err);
	}
}
