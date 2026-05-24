import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { and, eq, inArray, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

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
