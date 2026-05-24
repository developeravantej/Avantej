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

export const membersCreateProcedures = {
	/**
   * Create a new member in the organization
   *
   * Creates a member record in both control panel and tenant databases.
   * Requires user_management.create permission.
   */
  create: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["admin", "trainer", "staff", "client"]),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission to create members
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "create")

      // Get control panel database from context
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Validate hierarchy scope access
      const {
        tenantDb,
        member,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;

      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Skip validation for admins (they have access to all nodes)
      if (member.role !== "admin") {
        try {
          validateParentAccess(input.hierarchyScopeId, accessibleNodeIds);
        } catch (error) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error ? error.message : "Hierarchy scope not accessible",
          });
        }
      }

      // Find user by email in control panel database
      const targetUser = await controlPanelDb.query.user.findFirst({
        where: eq(user.email, input.email.toLowerCase()),
      });

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", {
          message: `User with email ${input.email} not found. User must be registered first.`,
        });
      }

      // Check if user is already a member
      const existingMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.userId, targetUser.id),
      });

      if (existingMember) {
        throw new ORPCError("CONFLICT", {
          message: "User is already a member of this organization",
        });
      }

      // Create member (dual-write to control panel + tenant)
      await createMember(
        controlPanelDb,
        context.tenantDb,
        {
          userId: targetUser.id,
          organizationId: input.organizationId,
          role: input.role,
          hierarchyScopeId: input.hierarchyScopeId,
        }
      );

      // Return the created member record
      const createdMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.userId, targetUser.id),
      });

      if (!createdMember) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Member created but could not be retrieved",
        });
      }

      // Best-effort GHL staff sync (Phase 7.4 wiring). The dispatcher is
      // env-bound by `dbMiddleware` in apps/server. It's optional — older
      // clients / environments without GHL configured simply skip.
      // The dispatcher itself is soft-fail; the .catch is defense-in-depth.
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
          memberId: createdMember.id,
          operation: "create",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return {
        success: true,
        member: {
          id: createdMember.id,
          userId: createdMember.userId,
          role: createdMember.role,
          hierarchyScopeId: createdMember.hierarchyScopeId,
          status: createdMember.status,
          joinedAt: createdMember.joinedAt,
        },
        ghlSync,
      };
    })
};
