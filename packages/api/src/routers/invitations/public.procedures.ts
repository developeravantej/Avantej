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

export const invitationsPublicProcedures = {
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
      

		assertOrgContextMatch(context, input);
      // Get invitation by token
      const invitation = await getInvitationByToken(
        input.token,
        context.tenantDb
      );

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

      // Verify email matches invitation email (case-insensitive)
      const userEmail = context.session.user.email?.toLowerCase();
      if (!invitation!.email) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This invitation has no associated email — use the branch self-signup flow instead.",
        });
      }
      const invitationEmail = invitation!.email.toLowerCase();

      if (userEmail !== invitationEmail) {
        throw new ORPCError("FORBIDDEN", {
          message: `This invitation was sent to ${invitation!.email}. Please sign up or log in with that email address.`,
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
      const controlPanelDb = context.honoContext?.get("controlPanelDb") as
        | NeonDatabase<typeof controlPanelSchema>
        | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Mark user's email as verified (invitation acceptance proves email ownership)
      await controlPanelDb
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, context.session.user.id));

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
   * Verify invited email (pre-verify)
   *
   * Public endpoint to mark the invited email as verified in the control-panel DB.
   * This enables existing-but-unverified users to log in and accept the invitation.
   *
   * If the user account does not exist yet, this is a no-op.
   */
  verifyEmailByToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      // Get control panel database from context
      const controlPanelDb = context.honoContext?.get("controlPanelDb") as
        | NeonDatabase<typeof controlPanelSchema>
        | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Get invitation by token
      const invitation = await getInvitationByToken(
        input.token,
        context.tenantDb
      );

      // Validate invitation (status/expiry)
      const validation = validateInvitation(invitation);
      if (!validation.isValid) {
        throw new ORPCError("BAD_REQUEST", {
          message: validation.error || "Invalid invitation",
        });
      }

      if (!invitation!.email) {
        throw new ORPCError("BAD_REQUEST", {
          message: "This invitation has no associated email — use the branch self-signup flow instead.",
        });
      }
      const invitationEmail = invitation!.email.toLowerCase();

      // If user exists, mark email as verified
      const existingUser = await controlPanelDb.query.user.findFirst({
        where: eq(user.email, invitationEmail),
      });

      if (!existingUser) {
        return { success: true, updated: false };
      }

      if (existingUser.emailVerified) {
        return { success: true, updated: false };
      }

      await controlPanelDb
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, existingUser.id));

      return { success: true, updated: true };
    }),

	/**
   * Get invitation by token
   *
   * Public endpoint to check invitation status before accepting.
   */
  /**
   * Decline invitation
   *
   * Public procedure that allows a user to decline an invitation using the token.
   * Updates invitation status to "declined".
   */
  decline: publicProcedure
    .input(
      z.object({
        token: z.string(),
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      // Get invitation by token
      const invitation = await context.tenantDb.query.invitations.findFirst({
        where: eq(invitations.token, input.token),
      });

      if (!invitation) {
        throw new ORPCError("NOT_FOUND", {
          message: "Invitation not found",
        });
      }

      // Validate invitation (check expiration and status)
      const validation = validateInvitation(invitation);

      if (!validation.isValid) {
        throw new ORPCError("BAD_REQUEST", {
          message: validation.error || "Invalid invitation",
        });
      }

      // Check if already declined or accepted
      if (invitation.status === "declined") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invitation has already been declined",
        });
      }

      if (invitation.status === "accepted") {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invitation has already been accepted",
        });
      }

      // Update invitation status to declined
      const [updated] = await context.tenantDb
        .update(invitations)
        .set({ status: "declined" })
        .where(eq(invitations.id, invitation.id))
        .returning();

      if (!updated) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to decline invitation",
        });
      }

      return {
        success: true,
        invitation: {
          id: updated.id,
          email: updated.email,
          status: updated.status,
        },
      };
    }),

	getByToken: publicProcedure
    .input(
      z.object({
        token: z.string(),
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

		assertOrgContextMatch(context, input);
      const invitation = await getInvitationByToken(
        input.token,
        context.tenantDb
      );

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
    })
};
