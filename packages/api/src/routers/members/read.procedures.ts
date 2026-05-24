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

export const membersReadProcedures = {
	/**
   * Get member by ID
   *
   * Returns member details including accessible node IDs.
   * Requires user_management.read permission.
   */
  getById: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")

      // Get the member
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member's hierarchy scope
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

      // Admins can access all members, others can only access members in their scope
      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this member",
          });
        }
      }

      // Get accessible node IDs for this member
      const memberAccessibleNodeIds = await getDescendantNodeIds(
        context.tenantDb,
        member.hierarchyScopeId
      );

      // Get user details from control panel
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      let userDetails = null;
      if (controlPanelDb) {
        const userRecord = await controlPanelDb.query.user.findFirst({
          where: eq(user.id, member.userId),
        });
        if (userRecord) {
          userDetails = {
            id: userRecord.id,
            name: userRecord.name,
            email: userRecord.email,
            emailVerified: userRecord.emailVerified,
          };
        }
      }

      return {
        member: {
          id: member.id,
          userId: member.userId,
          role: member.role,
          hierarchyScopeId: member.hierarchyScopeId,
          status: member.status,
          joinedAt: member.joinedAt,
        },
        accessibleNodeIds: memberAccessibleNodeIds,
        user: userDetails,
      };
    }),

	/**
   * Members joined today (UTC) — dashboard widget.
   *
   * Returns count + top-3 most-recent members.
   * Optionally scoped to a specific branchId.
   * Requires user_management.read permission.
   */
  newToday: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")

      const accessibleNodeIds = await resolveAccessibleNodeIds(context);

      return getMembersNewToday(context.tenantDb, {
        accessibleNodeIds,
        branchId: input.branchId,
      });
    })
};
