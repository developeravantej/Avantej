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

import { eq, and, desc, inArray } from "drizzle-orm";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { getAncestorNodeIds } from "./hierarchy.service";
import { sendPushToUser } from "./push.service";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type NotifyOptions = {
  /** Skip Expo push delivery (notification row is still inserted). */
  skipPush?: boolean;
};

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

// ─── Package-approval-flow helpers ────────────────────────────────────────────

/**
 * Fan out a "package_pending_review" notification to every admin + trainer
 * (status: active) in the package's branch when a customer-purchased package
 * lands in `pending` status.
 *
 * Branch resolution chain (first non-null wins):
 *  1. service.branchId — preferred. Most accurate.
 *  2. customer's member.hierarchyScopeId — fallback. Org-wide services
 *     (services created with `branchId: null` via the web form) still notify
 *     the customer's own branch staff.
 *
 * Returns the number of notification rows inserted (= staff count in branch).
 * If no branch can be resolved at all, returns 0 silently.
 */
export async function notifyStaffOfPendingPackage(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  packageInstanceId: string,
  options?: NotifyOptions,
): Promise<number> {
  // 1. Load the package + its service
  const pkg = await tenantDb.query.packageInstances.findFirst({
    where: eq(packageInstances.id, packageInstanceId),
  });
  if (!pkg) return 0;

  const svc = await tenantDb.query.services.findFirst({
    where: eq(services.id, pkg.serviceId),
  });

  // 2. Resolve branchId: service first, then customer's home branch
  let branchId = svc?.branchId ?? null;
  if (!branchId && pkg.clientId) {
    const clientMember = await tenantDb.query.members.findFirst({
      where: eq(members.userId, pkg.clientId),
      columns: { hierarchyScopeId: true },
    });
    branchId = clientMember?.hierarchyScopeId ?? null;
  }
  if (!branchId) {
    // Neither service nor customer has a branch scope — nowhere to fan out.
    return 0;
  }

  // 3. Resolve the set of scope IDs that should match: the branch itself
  //    PLUS every ancestor (area, region, country, organization). Staff
  //    scoped at higher levels (e.g. franchise admin scoped to org) supervise
  //    the branch and should be notified too.
  const ancestorIds = await getAncestorNodeIds(tenantDb, branchId);
  const scopeIds = ancestorIds.length > 0 ? ancestorIds : [branchId];

  // 4. List active admins + trainers in any of those scopes
  const staff = await tenantDb.query.members.findMany({
    where: and(
      inArray(members.hierarchyScopeId, scopeIds),
      eq(members.status, "active"),
      inArray(members.role, ["admin", "trainer"]),
    ),
    columns: { userId: true },
  });
  if (staff.length === 0) return 0;

  // 5. One notification row per staff member
  const title = "Package needs trainer assignment";
  const message = `A new ${svc?.name ?? "package"} was purchased and is awaiting trainer assignment.`;
  await tenantDb.insert(notifications).values(
    staff.map((s) => ({
      userId: s.userId,
      type: "package_pending_review",
      title,
      message,
      relatedId: packageInstanceId,
      relatedType: "package_instance",
    })),
  );

  // 6. Fan-out push notifications (one per staff). Acceptable for v1 — staff
  //    primarily use the web dashboard so most rows return zero tokens. Errors
  //    are swallowed inside sendPushToUser.
  if (!options?.skipPush) {
    for (const s of staff) {
      await sendPushToUser(tenantDb, s.userId, {
        title,
        body: message,
        data: {
          type: "package_pending_review",
          referenceId: packageInstanceId,
          referenceType: "package_instance",
        },
      });
    }
  }
  return staff.length;
}

/**
 * Insert a customer notification when their pending package is assigned to a
 * trainer (auto-approved).
 */
export async function notifyCustomerPackageAssigned(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: {
    packageInstanceId: string;
    customerUserId: string;
    serviceName: string;
    trainerName: string;
  },
  options?: NotifyOptions,
): Promise<void> {
  const title = "Your trainer has been assigned";
  const message = `Your trainer for ${params.serviceName} is ${params.trainerName}. You can start booking sessions now.`;
  await tenantDb.insert(notifications).values({
    userId: params.customerUserId,
    type: "package_assigned",
    title,
    message,
    relatedId: params.packageInstanceId,
    relatedType: "package_instance",
  });
  if (!options?.skipPush) {
    await sendPushToUser(tenantDb, params.customerUserId, {
      title,
      body: message,
      data: {
        type: "package_assigned",
        referenceId: params.packageInstanceId,
        referenceType: "package_instance",
      },
    });
  }
}

/**
 * Insert a customer notification when their pending package is rejected.
 */
export async function notifyCustomerPackageRejected(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  params: {
    packageInstanceId: string;
    customerUserId: string;
    serviceName: string;
    reason?: string | null;
  },
  options?: NotifyOptions,
): Promise<void> {
  const reasonSuffix = params.reason ? ` Reason: ${params.reason}` : "";
  const title = "Your package purchase was cancelled";
  const message = `Your purchase of ${params.serviceName} was cancelled.${reasonSuffix}`;
  await tenantDb.insert(notifications).values({
    userId: params.customerUserId,
    type: "package_rejected",
    title,
    message,
    relatedId: params.packageInstanceId,
    relatedType: "package_instance",
  });
  if (!options?.skipPush) {
    await sendPushToUser(tenantDb, params.customerUserId, {
      title,
      body: message,
      data: {
        type: "package_rejected",
        referenceId: params.packageInstanceId,
        referenceType: "package_instance",
      },
    });
  }
}

/**
 * Mark "package_pending_review" notifications for a given package as read,
 * across every staff member they were sent to. Called after the package is
 * assigned or rejected so the notification clears from staff bell icons.
 */
export async function clearPendingReviewNotifications(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  packageInstanceId: string,
): Promise<number> {
  const result = await tenantDb
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(notifications.type, "package_pending_review"),
        eq(notifications.relatedId, packageInstanceId),
        eq(notifications.isRead, false),
      ),
    );
  return result.rowCount ?? 0;
}
