/**
 * Branch Invites Router
 *
 * Admin CRUD for branch self-signup invitations (QR-code onboarding flow).
 * These invites are long-lived, multi-use, and email-less — any customer at a
 * branch can scan the QR and self-register.
 *
 * All procedures require `hierarchy_management` permission (the existing resource
 * for branch/hierarchy admin actions). `branch_management` does not exist in the
 * permission.service.ts Resource union.
 *
 * URL shape encoded in each token:
 *   ${WEB_URL}/onboarding/${token}?org=${organizationId}
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../guards";
import {
	createBranchInvite,
	listAllBranchInvites,
	listBranchInvites,
	revokeBranchInvite,
} from "@avantej-core/services/branch-invite.service";

function getWebUrl(): string {
	// Prefer CORS_ORIGIN (the frontend origin) as it matches how invitation emails are built.
	return (
		process.env.CORS_ORIGIN ||
		process.env.FRONTEND_URL ||
		"http://localhost:3001"
	);
}

export const branchInvitesRouter = {
	/**
	 * Create a new branch self-signup invite.
	 * Returns the invite record and the full QR-code URL.
	 */
	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid(),
				maxUses: z.number().int().positive().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			// Permission: hierarchy_management (existing resource for branch admin actions)
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"hierarchy_management",
				"create",
			);

			const invite = await createBranchInvite(context.tenantDb, {
				branchId: input.branchId,
				invitedBy: context.member.userId,
				maxUses: input.maxUses ?? null,
			});

			const webUrl = getWebUrl();
			const url = `${webUrl}/onboarding/${invite.token}?org=${input.organizationId}`;

			return {
				id: invite.id,
				token: invite.token,
				url,
				hierarchyScopeId: invite.hierarchyScopeId,
				usesCount: invite.usesCount,
				maxUses: invite.maxUses,
				isActive: invite.isActive,
				expiresAt: invite.expiresAt,
				createdAt: invite.createdAt,
			};
		}),

	/**
	 * List one row per accessible branch with its most recent active invite.
	 * Used by the Onboarding index page.
	 */
	listAll: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context }) => {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"hierarchy_management",
				"read",
			);
			const rows = await listAllBranchInvites(
				context.tenantDb,
				context.accessibleNodeIds ?? [],
				getWebUrl(),
			);
			// AC-A-06: strip token from list responses — only expose it on create/regenerate
			return rows.map((row) => ({
				...row,
				invite: row.invite
					? (({ token: _stripped, ...rest }) => rest)(row.invite)
					: null,
			}));
		}),

	/**
	 * List active branch self-signup invites scoped to a specific branch.
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			// Permission: hierarchy_management read
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"hierarchy_management",
				"read",
			);

			const invites = await listBranchInvites(context.tenantDb, input.branchId);

			const webUrl = getWebUrl();

			// AC-A-06: token is not returned in list responses to limit plaintext
			// token exposure. The raw token is only returned on create/regenerate
			// (one-time exposure). The QR URL still allows scanning without the token
			// being echoed back in bulk list responses.
			return invites.map((invite) => ({
				id: invite.id,
				url: `${webUrl}/onboarding/${invite.token}?org=${input.organizationId}`,
				hierarchyScopeId: invite.hierarchyScopeId,
				usesCount: invite.usesCount,
				maxUses: invite.maxUses,
				isActive: invite.isActive,
				expiresAt: invite.expiresAt,
				createdAt: invite.createdAt,
			}));
		}),

	/**
	 * Revoke a branch invite (soft delete via isActive=false).
	 */
	revoke: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Permission: hierarchy_management delete
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"hierarchy_management",
				"delete",
			);

			// Load invite first to validate branch access before mutating
			const { invitations: invitationsTable } = await import(
				"@avantej-core/db/schema/tenant/invitations"
			);
			const { eq: eqRevoke, and: andRevoke } = await import("drizzle-orm");
			const existingInvite = await context.tenantDb.query.invitations.findFirst(
				{
					where: andRevoke(
						eqRevoke(invitationsTable.id, input.id),
						eqRevoke(invitationsTable.kind, "branch_self_signup"),
					),
				},
			);

			if (!existingInvite) {
				throw new ORPCError("NOT_FOUND", {
					message: "Branch invite not found.",
				});
			}

			guardBranchAccessible(
				existingInvite.hierarchyScopeId,
				context.accessibleNodeIds ?? [],
			);

			const updated = await revokeBranchInvite(context.tenantDb, input.id);

			return {
				id: updated.id,
				isActive: updated.isActive,
				success: true,
			};
		}),

	/**
	 * Regenerate: revoke the current invite and create a fresh one.
	 * Atomic at the application level (sequential revoke + create in the same handler).
	 * Returns the new invite URL.
	 */
	regenerate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				maxUses: z.number().int().positive().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Permission: hierarchy_management create (creating a replacement)
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"hierarchy_management",
				"create",
			);

			// Look up old invite to get branchId
			const { invitations } = await import(
				"@avantej-core/db/schema/tenant/invitations"
			);
			const { eq, and } = await import("drizzle-orm");
			const oldInvite = await context.tenantDb.query.invitations.findFirst({
				where: and(
					eq(invitations.id, input.id),
					eq(invitations.kind, "branch_self_signup"),
				),
			});

			if (!oldInvite) {
				throw new ORPCError("NOT_FOUND", {
					message: "Branch invite not found.",
				});
			}

			// Guard: caller must have access to this invite's branch
			guardBranchAccessible(
				oldInvite.hierarchyScopeId,
				context.accessibleNodeIds ?? [],
			);

			// Revoke old
			await revokeBranchInvite(context.tenantDb, input.id);

			// Create new invite for the same branch
			const newInvite = await createBranchInvite(context.tenantDb, {
				branchId: oldInvite.hierarchyScopeId,
				invitedBy: context.member.userId,
				maxUses: input.maxUses ?? oldInvite.maxUses ?? null,
			});

			const webUrl = getWebUrl();
			const url = `${webUrl}/onboarding/${newInvite.token}?org=${input.organizationId}`;

			return {
				id: newInvite.id,
				token: newInvite.token,
				url,
				hierarchyScopeId: newInvite.hierarchyScopeId,
				usesCount: newInvite.usesCount,
				maxUses: newInvite.maxUses,
				isActive: newInvite.isActive,
				expiresAt: newInvite.expiresAt,
				createdAt: newInvite.createdAt,
				previousId: input.id,
			};
		}),
};
