import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { deactivateMember } from "@avantej-core/services/member.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { GhlSyncResult } from "./shared";

export const membersArchiveProcedures = {
	/**
   * Deactivate member
   *
   * Sets a member's status to "inactive" directly in the tenant database.
   * Unlike suspend (which dual-writes to control panel via MembershipService),
   * this is a simpler tenant-only status change.
   * Requires user_management.update permission.
   */
  deactivate: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")

      const actor = {
        userId: context.session!.user.id,
        memberId: context.member.id,
        role: context.member.role,
      };

      let result: Awaited<ReturnType<typeof deactivateMember>>;
      try {
        result = await deactivateMember(context.tenantDb, input.memberId, actor);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }
        throw error;
      }

      // Best-effort GHL staff sync (Phase 7.4 wiring). Operation=delete; the
      // dispatcher itself enforces the deactivate-skip rule (e.g. when GHL
      // policy is to keep the user but revoke access). Soft-fail like create.
      type DispatchStaffSyncFn = (args: {
        controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
        tenantDb: typeof context.tenantDb;
        organizationId: string;
        memberId: string;
        operation: "create" | "update" | "delete";
      }) => Promise<GhlSyncResult>;

      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;
      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

      let ghlSync: GhlSyncResult | undefined;
      if (dispatchStaffSync && controlPanelDb) {
        ghlSync = await dispatchStaffSync({
          controlPanelDb,
          tenantDb: context.tenantDb,
          organizationId: input.organizationId,
          memberId: input.memberId,
          operation: "delete",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return { ...result, ghlSync };
    }),

	/**
   * Soft-delete a member (admin-scoped). Mirrors `customerProfiles.softDelete`
   * but additive to the existing `deactivate` flow:
   *   - `deactivate` flips `members.status='inactive'` (reversible via
   *     `reactivate`, also fires GHL DELETE through the dispatcher).
   *   - `softDelete` stamps `members.deletedAt = now()` (reversible via
   *     `restore`). It is a GHL no-op — staff GHL state is governed by the
   *     deactivate flow; soft-delete is an Avantej-only marker that hides
   *     the row from default listings.
   *
   * Requires user_management.delete permission. Hierarchy access enforced
   * via `accessibleNodeIds`.
   */
  softDelete: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ context, input }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "delete")

      const target = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Row-level RBAC: non-admins can only soft-delete members in their scope.
      if (context.member.role !== "admin") {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (await getDescendantNodeIds(
            context.tenantDb,
            context.member.hierarchyScopeId
          ));
        if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "Target member is outside your accessible scope",
          });
        }
      }

      const now = new Date();
      const [updated] = await context.tenantDb
        .update(members)
        .set({ deletedAt: now })
        .where(eq(members.id, input.memberId))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      return { ok: true, memberId: updated.id };
    }),

	/**
   * Restore a soft-deleted member. Flips `members.deletedAt` back to null.
   * GHL no-op (mirrors `softDelete`). Throws BAD_REQUEST when the member
   * is not actually soft-deleted, mirroring `customerProfiles.restore`.
   *
   * Requires user_management.update permission.
   */
  restore: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ context, input }) => {
      
      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")

      const target = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });
      if (!target) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      if (context.member.role !== "admin") {
        const accessibleNodeIds =
          context.accessibleNodeIds ??
          (await getDescendantNodeIds(
            context.tenantDb,
            context.member.hierarchyScopeId
          ));
        if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "Target member is outside your accessible scope",
          });
        }
      }

      if (target.deletedAt === null) {
        throw new ORPCError("BAD_REQUEST", { message: "not-deleted" });
      }

      const [updated] = await context.tenantDb
        .update(members)
        .set({ deletedAt: null })
        .where(eq(members.id, input.memberId))
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      return { ok: true, memberId: updated.id };
    })
};
