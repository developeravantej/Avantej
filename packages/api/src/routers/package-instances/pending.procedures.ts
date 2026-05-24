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

export const packageInstancesPendingProcedures = {
	/**
   * List packages awaiting trainer assignment. Returns enriched rows with
   * customer name (control-panel join), service name, branch name, and
   * purchase timestamp.
   *
   * - Admin: sees all pending packages in their accessible branches.
   * - Trainer: by default sees pending packages in their own branch.
   * - scope: "assignable_to_me" filters to caller's branch (default for trainers).
   */
  listPending: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
        scope: z.enum(["all", "assignable_to_me"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      
      
		assertOrgContextMatch(context, input);
      const callerRole = context.member.role;
      if (callerRole !== "admin" && callerRole !== "trainer") {
        throw new ORPCError("FORBIDDEN", {
          message: "Only admins and trainers can view pending packages",
        });
      }

      // Determine branch filter
      const accessibleNodeIds = context.accessibleNodeIds ?? [];
      const scope =
        input.scope ??
        (callerRole === "trainer" ? "assignable_to_me" : "all");

      const branchFilterIds: string[] | null = (() => {
        if (input.branchId) return [input.branchId];
        if (scope === "assignable_to_me") {
          // scope expanded 2026-05-12 — match notification fan-out (sales-pipeline-fixes session)
          // Previously filtered to context.member.hierarchyScopeId (single node), causing
          // parent-region trainers to receive notifications but see an empty queue.
          // Now uses accessibleNodeIds (full descendant set), matching notifyStaffOfPendingPackage.
          return accessibleNodeIds.length > 0 ? accessibleNodeIds : [context.member.hierarchyScopeId];
        }
        return accessibleNodeIds.length > 0 ? accessibleNodeIds : null;
      })();

      // Pull pending+purchased packages joined to service for name + branch.
      // We don't filter by branch in SQL because services with branchId=null
      // (org-wide services) would be excluded by inArray. Resolve the
      // effective branch per row in JS using the same fallback as
      // notifyStaffOfPendingPackage: service.branchId, else customer's
      // member.hierarchyScopeId.
      const rows = await context.tenantDb
        .select({
          id: packageInstances.id,
          clientId: packageInstances.clientId,
          serviceId: packageInstances.serviceId,
          totalPrice: packageInstances.totalPrice,
          creditsTotal: packageInstances.creditsTotal,
          createdAt: packageInstances.createdAt,
          preferredTrainerId: packageInstances.preferredTrainerId,
          serviceName: services.name,
          branchId: services.branchId,
          paymentMethod: packageInstances.paymentMethod,
          paymentStatus: packageInstances.paymentStatus,
        })
        .from(packageInstances)
        .leftJoin(services, eq(packageInstances.serviceId, services.id))
        .where(
          and(
            eq(packageInstances.status, "pending"),
            eq(packageInstances.source, "purchased"),
          ),
        )
        .orderBy(desc(packageInstances.createdAt))
        .limit(input.limit ?? 50);

      // Hydrate customer name (cross-DB) + customer's tenant member branch
      const controlPanelDb = getControlPanelDb(context);
      type PendingRow = (typeof rows)[number];
      const clientIds: string[] = [
        ...new Set<string>(
          rows
            .map((r: PendingRow) => r.clientId)
            .filter((id: string | null): id is string => !!id),
        ),
      ];
      let customerMap = new Map<string, { name: string; email: string }>();
      if (clientIds.length > 0) {
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, clientIds));
        customerMap = new Map(
          userRows.map((u) => [u.id, { name: u.name, email: u.email }]),
        );
      }

      let memberBranchMap = new Map<string, string>();
      if (clientIds.length > 0) {
        const memberRows = await context.tenantDb
          .select({
            userId: members.userId,
            scopeId: members.hierarchyScopeId,
          })
          .from(members)
          .where(inArray(members.userId, clientIds));
        memberBranchMap = new Map(
          memberRows.map((m: { userId: string; scopeId: string }) => [
            m.userId,
            m.scopeId,
          ]),
        );
      }

      // Apply branch-filter in JS using the resolved effective branch.
      const filtered =
        branchFilterIds && branchFilterIds.length > 0
          ? rows.filter((r: PendingRow) => {
              const effectiveBranch =
                r.branchId ??
                (r.clientId ? memberBranchMap.get(r.clientId) : null);
              return effectiveBranch
                ? branchFilterIds.includes(effectiveBranch)
                : false;
            })
          : rows;

      // Batch-resolve preferred trainer names: members.id → members.userId → user.name
      const preferredTrainerIds: string[] = [
        ...new Set<string>(
          filtered
            .map((r: PendingRow) => r.preferredTrainerId)
            .filter((id: string | null): id is string => !!id),
        ),
      ];
      const preferredTrainerNameMap = new Map<string, string>();
      if (preferredTrainerIds.length > 0) {
        const trainerMemberRows = await context.tenantDb
          .select({ id: members.id, userId: members.userId })
          .from(members)
          .where(inArray(members.id, preferredTrainerIds));
        const trainerUserIds = trainerMemberRows.map(
          (m: { id: string; userId: string }) => m.userId,
        );
        if (trainerUserIds.length > 0) {
          const trainerUserRows = await controlPanelDb
            .select({ id: user.id, name: user.name })
            .from(user)
            .where(inArray(user.id, trainerUserIds));
          const userIdToName = new Map(
            trainerUserRows.map((u) => [u.id, u.name]),
          );
          for (const m of trainerMemberRows) {
            const name = userIdToName.get(m.userId);
            if (name) preferredTrainerNameMap.set(m.id, name);
          }
        }
      }

      return filtered.map((r: PendingRow) => ({
        ...r,
        customerName: r.clientId
          ? (customerMap.get(r.clientId)?.name ?? null)
          : null,
        customerEmail: r.clientId
          ? (customerMap.get(r.clientId)?.email ?? null)
          : null,
        preferredTrainerName: r.preferredTrainerId
          ? (preferredTrainerNameMap.get(r.preferredTrainerId) ?? null)
          : null,
      }));
    })
};
