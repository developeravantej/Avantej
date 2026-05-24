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

export const membersRoleProcedures = {
	/**
   * Update member role
   *
   * Updates a member's role in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  updateRole: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newRole: z.enum(["admin", "trainer", "staff", "client"]),
        // Wave 3a Agent 2.1 (Journey J1): optional FK to custom/system role row.
        // When provided, written to members.role_id alongside the legacy text role.
        // Pass null to explicitly clear the FK (revert to text-role only).
        roleId: z.string().uuid().nullable().optional(),
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

      // Check if current user can access this member
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

      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to update this member",
          });
        }
      }

      // Get control panel database
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      const previousRole = member.role;
      const previousRoleId = member.roleId;

      // Update role using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.updateMemberRole({
        userId: member.userId,
        organizationId: input.organizationId,
        newRole: input.newRole,
        tenantDb: context.tenantDb,
      });

      // Wave 3a Agent 2.1 (Journey J1): MembershipService only writes the legacy
      // text `role` column. Write the new nullable `roleId` FK separately when the
      // caller supplies it (or explicit null to clear). Skipped when undefined so
      // legacy callers are unaffected.
      if (input.roleId !== undefined) {
        await context.tenantDb
          .update(members)
          .set({ roleId: input.roleId })
          .where(eq(members.id, input.memberId));
      }

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after role update",
        });
      }

      // DEVIATION from §4.8: MembershipService does a dual-write (controlPanel + tenant)
      // and does not expose a tx hook. Audit is written after the fact on a separate query.
      // Rare orphan window: if process dies between role update and this write, the audit
      // row is missing but the role change succeeded.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.role_change",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Changed member role from "${previousRole}" to "${input.newRole}"`,
        changes: {
          from: previousRole,
          to: input.newRole,
          ...(input.roleId !== undefined
            ? { roleIdFrom: previousRoleId, roleIdTo: input.roleId }
            : {}),
        },
      });

      // Best-effort GHL staff sync (Phase 7.4 wiring). See members.create for
      // the rationale; same defensive pattern applies here.
      type DispatchStaffSyncFn = (args: {
        controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
        tenantDb: typeof context.tenantDb;
        organizationId: string;
        memberId: string;
        operation: "create" | "update" | "delete";
      }) => Promise<GhlSyncResult>;

      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

      let ghlSync: GhlSyncResult | undefined;
      if (dispatchStaffSync) {
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
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          roleId: updatedMember.roleId,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
        },
        ghlSync,
      };
    })
};
