/**
 * Invitation Router
 *
 * API endpoints for managing organization invitations.
 * Invitations are stored in tenant databases and link users to organizations.
 */

import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import {
  createInvitation,
  getInvitationByToken,
  listInvitations,
  resendInvitation,
  revokeInvitation,
  validateInvitation,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { z } from "zod";
import { tenantProcedure, publicProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

export const invitationsCreateProcedures = {
	/**
   * Create invitation
   *
   * Creates a new invitation in the tenant database and returns it.
   * The caller (server) should send the invitation email with the returned token and organizationId.
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
      // Check permission to invite members
      try {

        await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "create");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Validate hierarchy scope access
      const { validateParentAccess, getDescendantNodeIds } = await import(
        "@avantej-core/services"
      );

      // Get accessible node IDs (use from context if available, otherwise calculate)
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
              error instanceof Error
                ? error.message
                : "Hierarchy scope not accessible",
          });
        }
      }

      // Check if a pending invitation already exists
      const existingInvitation =
        await context.tenantDb.query.invitations.findFirst({
          where: and(
            eq(invitations.email, input.email.toLowerCase()),
            eq(invitations.status, "pending")
          ),
        });

      if (existingInvitation) {
        throw new ORPCError("CONFLICT", {
          message: "A pending invitation already exists for this email address",
        });
      }

      // Hoist controlPanelDb fetch so both the soft-delete check and the
      // existing-org-member check can share the same connection.
      const controlPanelDb = context.honoContext?.get("controlPanelDb") as
        | NeonDatabase<typeof controlPanelSchema>
        | undefined;

      // Pre-flight: block re-invitation of a previously soft-deleted customer.
      // If the email maps to an existing user who is a client member with
      // is_deleted=true on their customer_profile, direct the admin to the
      // "Restore customer" flow instead of creating a broken invitation.
      if (controlPanelDb) {
        const { checkSoftDeletedCustomerBlock } = await import(
          "@avantej-core/services"
        );
        const blockCheck = await checkSoftDeletedCustomerBlock({
          tenantDb: context.tenantDb,
          controlPanelDb,
          email: input.email,
        });
        if (blockCheck.blocked) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "This person was deleted as a customer. Restore them instead of inviting.",
            data: {
              userId: blockCheck.userId,
              profileId: blockCheck.profileId,
              code: "ALREADY_DELETED",
            },
          });
        }
      }

      // Check if user is already a member (by checking control panel users)
      // Note: We can't directly check by email in tenant DB, so we check control panel
      if (controlPanelDb) {
        const { users } = await import(
          "@avantej-core/db/schema/control-panel/users"
        );
        const { organizationMembers } = await import(
          "@avantej-core/db/schema/control-panel/organization-members"
        );

        const existingUser = await controlPanelDb.query.users.findFirst({
          where: eq(users.email, input.email.toLowerCase()),
        });

        if (existingUser) {
          const existingOrgMember =
            await controlPanelDb.query.organizationMembers.findFirst({
              where: and(
                eq(organizationMembers.userId, existingUser.id),
                eq(organizationMembers.organizationId, input.organizationId)
              ),
            });

          if (existingOrgMember) {
            throw new ORPCError("CONFLICT", {
              message: "This user is already a member of this organization",
            });
          }
        }
      }

      // Create invitation
      const invitation = await createInvitation({
        email: input.email,
        role: input.role,
        hierarchyScopeId: input.hierarchyScopeId,
        invitedBy: context.member.userId,
        tenantDb: context.tenantDb,
      });

      // Get organization name for email (if available)
      const organizationName = context.organization?.name || "the organization";

      return {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          hierarchyScopeId: invitation.hierarchyScopeId,
          token: invitation.token, // Return token so server can construct email link
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        organizationId: input.organizationId,
        organizationName,
        inviterName: context.session?.user?.name || undefined,
      };
    })
};
