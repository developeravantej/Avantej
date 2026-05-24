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

export const packageInstancesLifecycleProcedures = {
	/**
   * Cancel a package instance (admin only).
   *
   * Idempotency: already-cancelled → CONFLICT (not silent).
   * Branch-scope: caller's accessibleNodeIds must include the instance's service branch.
   */
  cancel: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      // Load instance to resolve branch for scope check
      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const cancellerUserId = context.session?.user?.id;
      if (!cancellerUserId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await cancelPackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: cancellerUserId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "CONFLICT") throw new ORPCError("CONFLICT", { message: e.message });
        }
        throw err;
      }
    }),

	/**
   * Freeze an active package instance (admin only).
   *
   * `until` is optional — null means indefinitely frozen.
   * Only `active` packages may be frozen.
   */
  freeze: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        until: z.string().datetime().optional(),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const freezerUserId = context.session?.user?.id;
      if (!freezerUserId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await freezePackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: freezerUserId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          until: input.until ? new Date(input.until) : undefined,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
        }
        throw err;
      }
    }),

	/**
   * Unfreeze a frozen package instance, returning it to `active` (admin only).
   */
  unfreeze: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const unfreezerId = context.session?.user?.id;
      if (!unfreezerId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await unfreezePackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: unfreezerId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
        }
        throw err;
      }
    }),

	/**
   * Extend a package instance's expiry date (admin only).
   *
   * `addDays` must be 1–365. Terminal packages (cancelled/expired/completed)
   * and non-expirable packages (null expiresAt) are rejected.
   */
  extend: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        addDays: z.number().int().min(1).max(365),
        reason: z.string().min(1).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "package_management", "update");

      const instance = await context.tenantDb.query.packageInstances.findFirst({
        where: eq(packageInstances.id, input.id),
      });
      if (!instance) {
        throw new ORPCError("NOT_FOUND", { message: "Package instance not found" });
      }

      const svc = await context.tenantDb.query.services.findFirst({
        where: eq(services.id, instance.serviceId),
      });
      if (svc?.branchId) {
        const accessibleNodeIds = context.accessibleNodeIds ?? [];
        if (!accessibleNodeIds.includes(svc.branchId)) {
          throw new ORPCError("FORBIDDEN", { message: "You do not have access to this branch" });
        }
      }

      // 7.5: Guard before writing to audit columns
      const extenderId = context.session?.user?.id;
      if (!extenderId) {
        throw new ORPCError("UNAUTHORIZED", { message: "Session user ID is required for this operation" });
      }

      try {
        return await extendPackageInstance(context.tenantDb, {
          id: input.id,
          actorUserId: extenderId,
          actorMemberId: context.member.id,
          actorRole: context.member.role,
          addDays: input.addDays,
          reason: input.reason,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code: string; message: string };
          if (e.code === "NOT_FOUND") throw new ORPCError("NOT_FOUND", { message: e.message });
          if (e.code === "BAD_REQUEST") throw new ORPCError("BAD_REQUEST", { message: e.message });
        }
        throw err;
      }
    })
};
