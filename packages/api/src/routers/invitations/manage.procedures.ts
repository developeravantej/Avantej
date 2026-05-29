import { listInvitations, resendInvitation, revokeInvitation } from "@avantej-core/services";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, assertTenantContext } from "../../guards";

export const invitationsManageProcedures = {
	/**
   * List invitations
   *
   * Lists invitations in the organization with optional filtering.
   */
  list: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        status: z
          .enum(["pending", "accepted", "declined", "expired"])
          .optional(),
        email: z.string().email().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
		assertTenantContext(context);
      // Check permission
      try {

        await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const invitationList = await listInvitations({
        tenantDb: context.tenantDb,
        status: input.status,
        email: input.email,
      });

      return {
        invitations: invitationList.map(
          (inv: typeof invitations.$inferSelect) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            hierarchyScopeId: inv.hierarchyScopeId,
            status: inv.status,
            expiresAt: inv.expiresAt,
            createdAt: inv.createdAt,
            // Don't return token for security
          })
        ),
      };
    }),

	/**
   * Revoke invitation
   *
   * Marks an invitation as declined/revoked.
   */
  revoke: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        invitationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
		assertTenantContext(context);
      // Check permission
      try {

        await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "delete");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const revoked = await revokeInvitation(
        input.invitationId,
        context.tenantDb
      );

      return {
        success: true,
        invitation: {
          id: revoked.id,
          email: revoked.email,
          status: revoked.status,
        },
      };
    }),

	resend: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        invitationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
		assertTenantContext(context);
      // Check permission
      try {

        await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "create");
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      let updated;
      try {
        updated = await resendInvitation(input.invitationId, context.tenantDb);
      } catch (error) {
        // Rate-limit cooldown: resendInvitation throws InvitationResendCooldownError
        // when the invitation was resent within the cooldown window.
        if (error instanceof Error && error.name === "InvitationResendCooldownError") {
          throw new ORPCError("TOO_MANY_REQUESTS", {
            message: error.message,
          });
        }
        throw error;
      }

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
    })
};
