/**
 * Members Router
 *
 * API endpoints for managing organization members.
 * Members are stored in tenant databases and linked to users in the control panel.
 */

import { createMember, getMembersNewToday } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user } from "@avantej-core/db/schema/auth";
import { desc, eq, and, inArray, asc, isNull, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, resolveAccessibleNodeIds } from "../../guards";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getDescendantNodeIds,
 validateParentAccess } from "@avantej-core/services";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { deactivateMember } from "@avantej-core/services/member.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";

// Shared GHL staff sync dispatcher result type (Phase 7.4 wiring). The
// dispatcher itself is env-bound by `dbMiddleware` in apps/server and looked
// up via `context.honoContext.get("dispatchStaffSync")`. The function type is
// declared locally per handler since it references `typeof context.tenantDb`.
type GhlSyncResult = {
  status: "synced" | "skipped" | "error";
  reason?: string;
  ghlUserId?: string;
  error?: string;
};

export const membersScopeProcedures = {
	/**
   * Update member's hierarchy scope (branch reassignment)
   *
   * Moves a member to a different branch by updating `member.hierarchyScopeId`
   * in the tenant database. Wired to `dispatchStaffSync({ operation: "update" })`
   * — the dispatcher detects the branch change against the existing
   * `ghl_user_links.branchNodeId` and routes via the GHL PUT path with new
   * locationIds, updating the link row.
   * Requires user_management.update permission.
   */
  updateScope: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "update")

      // Get the member to update
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Compute accessible nodes once for both checks below
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      // Check if current user can access target member (admins bypass)
      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to update this member",
          });
        }

        // And actor must have access to the destination scope as well
        try {
          validateParentAccess(input.newHierarchyScopeId, accessibleNodeIds);
        } catch (error) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error
                ? error.message
                : "Hierarchy scope not accessible",
          });
        }
      }

      const previousScopeId = member.hierarchyScopeId;

      // Update hierarchyScopeId in tenant DB
      await context.tenantDb
        .update(members)
        .set({ hierarchyScopeId: input.newHierarchyScopeId })
        .where(eq(members.id, input.memberId));

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      // Audit log entry. Note: branchId reflects the NEW scope so the audit row
      // is filterable from the destination branch's perspective.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.scope_change",
        entityType: "member",
        entityId: input.memberId,
        branchId: input.newHierarchyScopeId,
        summary: `Moved member from branch "${previousScopeId}" to "${input.newHierarchyScopeId}"`,
        changes: { from: previousScopeId, to: input.newHierarchyScopeId },
      });

      // Best-effort GHL staff sync. The dispatcher detects the branch change
      // (existing ghl_user_links.branchNodeId vs the now-updated member scope)
      // and routes via the PUT path with new locationIds.
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
          operation: "update",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return {
        success: true,
        member: {
          id: updatedMember!.id,
          userId: updatedMember!.userId,
          role: updatedMember!.role,
          hierarchyScopeId: updatedMember!.hierarchyScopeId,
          status: updatedMember!.status,
          joinedAt: updatedMember!.joinedAt,
        },
        ghlSync,
      };
    })
};
