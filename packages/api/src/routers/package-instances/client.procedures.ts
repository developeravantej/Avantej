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

export const packageInstancesClientProcedures = {
	/**
   * List package instances for the current user (client view). Uses session user id as client_id.
   */
  listForClient: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: statusSchema.optional(),
        source: sourceSchema.optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const clientId = context.session?.user?.id;
      if (!clientId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listPackageInstancesForClient(context.tenantDb, {
        clientId,
        status: input.status,
        source: input.source,
        limit: input.limit,
      });

      return items;
    }),

	getActiveForClient: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
      

      const clientId = context.session?.user?.id;
      if (!clientId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const items = await listPackageInstancesForClient(context.tenantDb, {
        clientId,
        status: "active",
        limit: 1,
      });

      return items[0] ?? null;
    }),

	getById: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const instance = await getPackageInstanceById(context.tenantDb, input.id);
      if (!instance) {
        throw new ORPCError("NOT_FOUND", {
          message: "Package instance not found",
        });
      }

      const clientId = context.session?.user?.id;
      const isClient = clientId && instance.clientId === clientId;
      const isStaff = context.member;

      if (!isClient && !isStaff) {
        throw new ORPCError("FORBIDDEN", {
          message: "Access denied",
        });
      }

      if (isStaff && !isClient) {
        await requirePermissionOrpc(context.tenantDb, context.member, "service_management", "read");
      }

      // Enrich with assigned trainer name when present
      let assignedTrainerName: string | null = null;
      if (instance.assignedTrainerId) {
        try {
          const controlPanelDb = getControlPanelDb(context);
          // Resolve member → userId → user.name
          const [trainerMember] = await context.tenantDb
            .select({ userId: members.userId })
            .from(members)
            .where(eq(members.id, instance.assignedTrainerId));
          if (trainerMember) {
            const [trainerUser] = await controlPanelDb
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, trainerMember.userId));
            assignedTrainerName = trainerUser?.name ?? null;
          }
        } catch {
          // Non-critical — proceed without name
        }
      }

      // Enrich with preferred trainer name when present
      let preferredTrainerName: string | null = null;
      if (instance.preferredTrainerId) {
        try {
          const controlPanelDb = getControlPanelDb(context);
          const [prefMember] = await context.tenantDb
            .select({ userId: members.userId })
            .from(members)
            .where(eq(members.id, instance.preferredTrainerId));
          if (prefMember) {
            const [prefUser] = await controlPanelDb
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, prefMember.userId));
            preferredTrainerName = prefUser?.name ?? null;
          }
        } catch {
          // Non-critical — proceed without name
        }
      }

      return { ...instance, assignedTrainerName, preferredTrainerName };
    })
};
