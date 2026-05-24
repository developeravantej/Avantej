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
