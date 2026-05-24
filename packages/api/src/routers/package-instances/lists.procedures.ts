/**
 * Package Instances Router
 *
 * API endpoints for package instances (client assignments/purchases).
 * getActiveForClient / listForUser: client view (session user). create: staff or purchase flow.
 */

import {
  listPackageInstancesForClient,
  getPackageInstanceById,
  createPackageInstance,
  createInstallmentSchedule,

  getPackageInstanceStatusHistory,
  cancelPackageInstance,
  freezePackageInstance,
  unfreezePackageInstance,
  extendPackageInstance,
} from "@avantej-core/services";
import { listMemberships, listAssignedToMember } from "@avantej-core/services/package-instance.service";
import { getSetting } from "@avantej-core/services/organization-settings.service";
import {
  notifyStaffOfPendingPackage,
  notifyCustomerPackageAssigned,
  notifyCustomerPackageRejected,
  clearPendingReviewNotifications,
} from "@avantej-core/services/notification.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import { appendPackageInstanceStatusHistory } from "@avantej-core/services/status-history.helper";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstanceStaff } from "@avantej-core/db/schema/tenant/package-instance-staff";
import { services } from "@avantej-core/db/schema/tenant/services";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { installmentPlans } from "@avantej-core/db/schema/tenant/installment-plans";
import { user, user as cpUsers } from "@avantej-core/db/schema/auth";
import { desc, and, eq, inArray } from "drizzle-orm";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

const sourceSchema = z.enum(["assigned", "purchased"]);
const paymentStatusSchema = z.enum(["pending", "paid", "failed", "refunded", "partially_paid"]);
const statusSchema = z.enum([
  "pending",
  "active",
  "frozen",
  "completed",
  "expired",
  "exhausted",
  "cancelled",
]);

// Org setting that gates customer-purchased packages behind an admin/trainer
// approval. When "true" (default), `source: "purchased"` packages start in
// `status: "pending"` and require trainer assignment before being usable.
const PACKAGE_APPROVAL_REQUIRED_KEY = "package_approval.required";

export const packageInstancesListsProcedures = {
	/**
   * List memberships (package_instances) for the retention / membership view.
   *
   * Filter values:
   *   active       — status='active' AND expiresAt > NOW()
   *   expiring_7d  — status='active' AND expiresAt within 7 days
   *   expiring_30d — status='active' AND expiresAt within 30 days
   *   expired      — status='expired' OR expiresAt < NOW()
   *   frozen       — isLocked = TRUE
   *   all          — no additional predicate
   *
   * Requires: service_management:read permission.
   * RBAC: results scoped to caller's accessibleNodeIds via members.hierarchyScopeId.
   */
  listMemberships: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        filter: z
          .enum(["active", "expiring_7d", "expiring_30d", "expired", "frozen", "all"])
          .default("active"),
        branchId: z.string().uuid().optional(),
        serviceCategoryId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .handler(async ({ context, input }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read");

      // Pre-check: if caller supplied a branchId, it must be within their accessible scope
      if (
        input.branchId &&
        !(context.accessibleNodeIds ?? []).includes(input.branchId)
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "Requested branch is outside your accessible scope",
        });
      }

      const controlPanelDb = getControlPanelDb(context);

      return listMemberships(controlPanelDb, context.tenantDb, {
        filter: input.filter,
        branchId: input.branchId,
        serviceCategoryId: input.serviceCategoryId,
        accessibleNodeIds: context.accessibleNodeIds ?? [],
        limit: input.limit,
        offset: input.offset,
      });
    }),

	/**
   * List expiring memberships within a given window (7 or 30 days).
   * Used by dashboard widgets to surface members whose packages are about to expire.
   * Requires: reports:read permission.
   */
  listExpiring: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        within: z.union([z.literal(7), z.literal(30)]),
      }),
    )
    .handler(async ({ context, input }) => {
      
      
		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "reports", "read");

      const controlPanelDb = getControlPanelDb(context);
      return listExpiringMemberships(context.tenantDb, controlPanelDb, {
        within: input.within,
        accessibleNodeIds: context.accessibleNodeIds ?? [],
      });
    }),

	listAll: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        clientId: z.string().optional(),
        status: statusSchema.optional(),
        source: sourceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional().default(100),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read")

      // Build filter conditions dynamically
      const conditions = [];
      if (input.clientId) conditions.push(eq(packageInstances.clientId, input.clientId));
      if (input.status) conditions.push(eq(packageInstances.status, input.status));
      if (input.source) conditions.push(eq(packageInstances.source, input.source));

      const rows = await context.tenantDb
        .select()
        .from(packageInstances)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(packageInstances.createdAt))
        .limit(input.limit);

      // Cross-DB: batch-lookup client names from control panel
      const controlPanelDb = getControlPanelDb(context);
      let userMap = new Map<string, string>();
      const clientIds = [...new Set(rows.map((r: any) => r.clientId).filter((id: any): id is string => id != null))];
      if (clientIds.length > 0) {
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, clientIds as string[]));
        userMap = new Map(userRows.map((u) => [u.id, u.name]));
      }

      return rows.map((row: any) => ({
        ...row,
        clientName: row.clientId ? (userMap.get(row.clientId) ?? null) : null,
      }));
    }),

	/**
   * List package instances assigned to the calling trainer.
   *
   * Accessible to any authenticated member — returns only rows where
   * assignedTrainerId = context.member.id, so no extra permission is needed.
   *
   * Index: package_instances_assigned_trainer_status_idx (assigned_trainer_id, status)
   * — added in migration 0051_sales_pipeline_fixes.
   */
  listAssignedToMe: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(["active", "frozen", "all"]).default("active"),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      const limit = input.limit;

      // Decode cursor: "createdAt|id" shape (matches encodeCursor).
      const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;
      // parseCursor returns { changedAt, id } but we reuse the same encoding for createdAt.
      const cursor = parsedCursor
        ? { createdAt: parsedCursor.changedAt, id: parsedCursor.id }
        : null;

      const controlPanelDb = getControlPanelDb(context);

      // Fetch limit+1 rows so we can detect whether a next page exists.
      const rows = await listAssignedToMember(controlPanelDb, context.tenantDb, {
        memberId: context.member.id,
        status: input.status,
        cursor,
        limit: limit + 1,
      });

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && lastItem
          ? encodeCursor(lastItem.createdAt, lastItem.id)
          : null;

      return { items, nextCursor };
    })
};
