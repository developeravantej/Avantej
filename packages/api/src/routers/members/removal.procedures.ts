import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

export const membersRemovalProcedures = {
	/**
   * Remove member
   *
   * Removes a member from both control panel and tenant databases.
   * Validates that the last admin cannot be removed.
   * Requires user_management.delete permission.
   */
  remove: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "delete")

      // Get the member to remove
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
            message: "User does not have access to remove this member",
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

      // Remove member using MembershipService (validates last admin check)
      const membershipService = new MembershipService(controlPanelDb);
      try {
        await membershipService.removeMember({
          userId: member.userId,
          organizationId: input.organizationId,
          tenantDb: context.tenantDb,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Cannot remove last admin")
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
          });
        }
        throw error;
      }

      return {
        success: true,
        message: "Member removed successfully",
      };
    })
};
