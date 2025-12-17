/**
 * Invitation Router
 *
 * API endpoints for managing organization invitations.
 * Invitations are stored in tenant databases and link users to organizations.
 */

import {
  createInvitation,
  getInvitationByToken,
  validateInvitation,
  listInvitations,
  revokeInvitation,
  resendInvitation,
} from "@avantej-core/services";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq, and } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export const invitationRouter = {
  /**
   * Create invitation
   *
   * Creates a new invitation in the tenant database and returns it.
   * The caller (server) should send the invitation email with the returned token and organizationId.
   */
  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["admin", "trainer", "staff", "client"]),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission to invite members
      try {
        const { requirePermission } = await import("@avantej-core/services");
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Validate hierarchy scope access
      const { validateParentAccess } = await import("@avantej-core/services");
      await validateParentAccess(
        context.tenantDb,
        input.hierarchyScopeId,
        context.member.hierarchyScopeId,
        context.member.role
      );

      // Check if a pending invitation already exists
      const existingInvitation = await context.tenantDb.query.invitations.findFirst({
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

      // Check if user is already a member (by checking control panel users)
      // Note: We can't directly check by email in tenant DB, so we check control panel
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (controlPanelDb) {
        const { users } = await import("@avantej-core/db/schema/control-panel/users");
        const { organizationMembers } = await import("@avantej-core/db/schema/control-panel/organization-members");
        
        const existingUser = await controlPanelDb.query.users.findFirst({
          where: eq(users.email, input.email.toLowerCase()),
        });

        if (existingUser) {
          const existingOrgMember = await controlPanelDb.query.organizationMembers.findFirst({
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
    }),

  /**
   * Accept invitation
   *
   * Public endpoint (user may not be logged in yet).
   * If user is not logged in, returns error with redirect info.
   * If user is logged in, creates member record and marks invitation as accepted.
   */
  accept: publicProcedure
    .input(
      z.object({
        token: z.string(),
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      // Get invitation by token
      const invitation = await getInvitationByToken(input.token, context.tenantDb);

      // Validate invitation
      const validation = validateInvitation(invitation);
      if (!validation.isValid) {
        throw new ORPCError("BAD_REQUEST", {
          message: validation.error || "Invalid invitation",
        });
      }

      // Check if user is logged in
      if (!context.session?.user) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "Please sign up or log in to accept this invitation",
          // Frontend can redirect to: /signup?invitationToken={token}&orgId={organizationId}
        });
      }

      // Verify email matches invitation email
      if (
        context.session.user.email.toLowerCase() !== invitation!.email.toLowerCase()
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "This invitation was sent to a different email address",
        });
      }

      // Check if user is already a member
      const existingMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.userId, context.session.user.id),
      });

      if (existingMember) {
        throw new ORPCError("CONFLICT", {
          message: "You are already a member of this organization",
        });
      }

      // Get control panel database from context
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Create member (dual-write to control panel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.createMember({
        userId: context.session.user.id,
        organizationId: input.organizationId,
        role: invitation!.role,
        hierarchyScopeId: invitation!.hierarchyScopeId,
        invitationId: invitation!.id,
        tenantDb: context.tenantDb,
      });

      return {
        success: true,
        message: "Successfully joined organization",
        organizationId: input.organizationId,
      };
    }),

  /**
   * Get invitation by token
   *
   * Public endpoint to check invitation status before accepting.
   */
  getByToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      const invitation = await getInvitationByToken(input.token, context.tenantDb);

      if (!invitation) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invitation not found",
        });
      }

      const validation = validateInvitation(invitation);

      return {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          createdAt: invitation.createdAt,
        },
        isValid: validation.isValid,
        error: validation.error,
      };
    }),

  /**
   * List invitations
   *
   * Lists invitations in the organization with optional filtering.
   */
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: z.enum(["pending", "accepted", "declined", "expired"]).optional(),
        email: z.string().email().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        const { requirePermission } = await import("@avantej-core/services");
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const invitationList = await listInvitations({
        tenantDb: context.tenantDb,
        status: input.status,
        email: input.email,
        invitedBy: context.member.userId, // Optionally filter by inviter
      });

      return {
        invitations: invitationList.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          hierarchyScopeId: inv.hierarchyScopeId,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
          // Don't return token for security
        })),
      };
    }),

  /**
   * Revoke invitation
   *
   * Marks an invitation as declined/revoked.
   */
  revoke: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        invitationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        const { requirePermission } = await import("@avantej-core/services");
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "delete"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const revoked = await revokeInvitation(input.invitationId, context.tenantDb);

      return {
        success: true,
        invitation: {
          id: revoked.id,
          email: revoked.email,
          status: revoked.status,
        },
      };
    }),

  /**
   * Resend invitation
   *
   * Extends expiration date and returns invitation for resending email.
   */
  resend: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        invitationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        const { requirePermission } = await import("@avantej-core/services");
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const updated = await resendInvitation(input.invitationId, context.tenantDb);

      const organizationName = context.organization?.name || "the organization";

      return {
        invitation: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          hierarchyScopeId: updated.hierarchyScopeId,
          token: updated.token, // Return token so server can construct email link
          expiresAt: updated.expiresAt,
          createdAt: updated.createdAt,
        },
        organizationId: input.organizationId,
        organizationName,
        inviterName: context.session?.user?.name || undefined,
      };
    }),
};

