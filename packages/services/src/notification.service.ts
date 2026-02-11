/**
 * Notification Service
 *
 * Handles user notifications (list, mark read) in tenant databases.
 *
 * Usage:
 * ```typescript
 * import { listNotifications, markNotificationRead } from "@avantej-core/services";
 * const notifications = await listNotifications(tenantDb, { userId, isRead: false });
 * ```
 */

import { eq, and, desc } from "drizzle-orm";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type ListNotificationsParams = {
  userId: string;
  isRead?: boolean;
  type?: string;
  limit?: number;
};

/**
 * List notifications for a user.
 */
export async function listNotifications(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: ListNotificationsParams
): Promise<(typeof notifications.$inferSelect)[]> {
  const { userId, isRead, type, limit = 50 } = params;

  const conditions = [eq(notifications.userId, userId)];
  if (isRead !== undefined) {
    conditions.push(eq(notifications.isRead, isRead));
  }
  if (type) {
    conditions.push(eq(notifications.type, type));
  }

  return tenantDb.query.notifications.findMany({
    where: and(...conditions),
    orderBy: [desc(notifications.createdAt)],
    limit: Math.min(limit, 200),
  });
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  userId: string
): Promise<number> {
  const rows = await tenantDb.query.notifications.findMany({
    where: and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
    columns: { id: true },
  });
  return rows.length;
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  id: string,
  userId: string
): Promise<(typeof notifications.$inferSelect) | null> {
  const [row] = await tenantDb
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Mark all notifications for a user as read.
 */
export async function markAllNotificationsRead(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  userId: string
): Promise<number> {
  const result = await tenantDb
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return result.rowCount ?? 0;
}
