import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

export const membersStatusProcedures = {
	/**
   * Suspend member
   *
   * Suspends a member in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  suspend: tenantProcedure
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

      // Get the member to suspend
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
            message: "User does not have access to suspend this member",
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

      // Suspend member using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.suspendMember({
        userId: member.userId,
        organizationId: input.organizationId,
        tenantDb: context.tenantDb,
      });

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after status update",
        });
      }

      // DEVIATION from §4.8: MembershipService does a dual-write and does not expose a tx hook.
      // Audit is written after the fact. Rare orphan window if process dies between writes.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.suspend",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Suspended member ${input.memberId}`,
        changes: { statusBefore: member.status, statusAfter: "suspended" },
      });

      return {
        success: true,
        member: {
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
        },
      };
    }),

	/**
   * Reactivate member
   *
   * Reactivates a suspended member in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  reactivate: tenantProcedure
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

      // Get the member to reactivate
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
            message: "User does not have access to reactivate this member",
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

      // Reactivate member using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.reactivateMember({
        userId: member.userId,
        organizationId: input.organizationId,
        tenantDb: context.tenantDb,
      });

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after status update",
        });
      }

      // DEVIATION from §4.8: MembershipService does a dual-write and does not expose a tx hook.
      // Audit is written after the fact. Rare orphan window if process dies between writes.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.reactivate",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Reactivated member ${input.memberId}`,
        changes: { statusBefore: member.status, statusAfter: "active" },
      });

      return {
        success: true,
        member: {
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
        },
      };
    })
};
