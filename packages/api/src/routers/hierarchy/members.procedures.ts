import {
	getDescendantNodeIds,
	getMembersByHierarchyScope,
	updateMemberHierarchyScope,
	bulkUpdateMemberHierarchyScope,
	getAllOrganizationMembersWithUserDetails,
} from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import type { ControlPanelDb } from "../../lib/context-helpers";

export const hierarchyMembersProcedures = {
	/**
   * List members assigned to a hierarchy node
   */
  listMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check if user can access this hierarchy node
      if (!accessibleNodeIds.includes(input.hierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this hierarchy node",
        });
      }

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "read");

      try {
        const memberList = await getMembersByHierarchyScope(
          tenantDb,
          input.hierarchyScopeId
        );
        return { members: memberList };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to list members",
        });
      }
    }),

	/**
   * Reassign a member to a new hierarchy scope
   */
  reassignMember: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "update");

      // Check if user can access the target hierarchy node
      if (!accessibleNodeIds.includes(input.newHierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to the target hierarchy node",
        });
      }

      // Get the member being reassigned to check current scope
      const memberToReassign = await tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!memberToReassign) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found",
        });
      }

      // Check if user can access the member's current scope (for admin override)
      if (
        !accessibleNodeIds.includes(memberToReassign.hierarchyScopeId) &&
        member.role !== "admin"
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to reassign this member",
        });
      }

      try {
        const updatedMember = await updateMemberHierarchyScope(
          tenantDb,
          input.memberId,
          input.newHierarchyScopeId
        );
        return { member: updatedMember };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to reassign member",
        });
      }
    }),

	/**
   * Bulk reassign members to a new hierarchy scope
   */
  bulkReassignMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberIds: z.array(z.string().uuid()),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "update");

      // Check if user can access the target hierarchy node
      if (!accessibleNodeIds.includes(input.newHierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to the target hierarchy node",
        });
      }

      try {
        const updatedMembers = await bulkUpdateMemberHierarchyScope(
          tenantDb,
          input.memberIds,
          input.newHierarchyScopeId
        );
        return { members: updatedMembers };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to bulk reassign members",
        });
      }
    }),

	/**
   * List all members in the organization with user details
   * Returns members with their names and emails from the control panel database
   */
  listAllMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        includeInactive: z.boolean().optional().default(false),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      const { tenantDb, member } = context;

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "read");

      // Get control panel database from Hono context
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as ControlPanelDb | undefined;
      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      try {
        const membersWithDetails = await getAllOrganizationMembersWithUserDetails(
          tenantDb,
          controlPanelDb,
          input.organizationId,
          input.includeInactive
        );
        return { members: membersWithDetails };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to list all members",
        });
      }
    })
};
