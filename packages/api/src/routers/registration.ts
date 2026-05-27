import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { user } from "@avantej-core/db/schema/auth";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { members } from "@avantej-core/db/schema/tenant/members";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { and, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";

function getControlPanelDb(context: {
	honoContext?: any;
}): NeonDatabase<typeof controlPanelSchema> | null {
	return context.honoContext?.get("controlPanelDb") as NeonDatabase<
		typeof controlPanelSchema
	> | null;
}

export const registrationRouter = {
	/**
	 * List distinct countries that have branches registered
	 * Public endpoint - no auth required (used during registration)
	 */
	listCountries: publicProcedure.handler(async ({ context }) => {
		const controlPanelDb = getControlPanelDb(context);
		if (!controlPanelDb) {
			throw new Error("Control panel database not available");
		}

		const rows = await controlPanelDb
			.selectDistinct({ country: organizationBranches.country })
			.from(organizationBranches)
			.where(isNotNull(organizationBranches.country));

		return rows
			.filter((r) => r.country != null)
			.map((r) => r.country as string);
	}),

	/**
	 * List branches for a given country
	 * Public endpoint - no auth required (used during registration)
	 */
	listBranches: publicProcedure
		.input(z.object({ country: z.string().min(1) }))
		.handler(async ({ input, context }) => {
			const controlPanelDb = getControlPanelDb(context);
			if (!controlPanelDb) {
				throw new Error("Control panel database not available");
			}

			const rows = await controlPanelDb
				.select({
					id: organizationBranches.id,
					name: organizationBranches.name,
					address: organizationBranches.address,
					organizationId: organizationBranches.organizationId,
				})
				.from(organizationBranches)
				.where(eq(organizationBranches.country, input.country));

			return rows;
		}),

	/**
	 * Complete user registration
	 * Requires auth - user must be signed up and logged in (role is null).
	 * Updates user profile, creates org membership (dual-write), sets role to "user".
	 */
	complete: protectedProcedure
		.input(
			z.object({
				// Branch self-signup invite token — required to prove the user was
				// issued a valid invite for this org. Prevents unauthenticated cross-org joins.
				inviteToken: z.string().min(1),
				// Personal details
				phone: z.string().min(1),
				idPassportNo: z.string().min(1),
				addressType: z.enum(["home", "work"]),
				streetAddress: z.string().min(1),
				city: z.string().min(1),
				state: z.string().min(1),
				country: z.string().min(1),
				postalCode: z.string().min(1),
				dateOfBirth: z.string().min(1), // ISO date string
				// Emergency contact
				emergencyContactName: z.string().min(1),
				emergencyContactRelationship: z.string().min(1),
				emergencyContactPhone: z.string().min(1),
				// Branch selection
				branchId: z.string().uuid(),
				organizationId: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			const controlPanelDb = getControlPanelDb(context);
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available",
				});
			}

			const userId = context.session.user.id;

			// 1. Look up the selected branch to get tenantNodeId (hierarchyScopeId)
			const branch = await controlPanelDb
				.select({
					tenantNodeId: organizationBranches.tenantNodeId,
					organizationId: organizationBranches.organizationId,
				})
				.from(organizationBranches)
				.where(eq(organizationBranches.id, input.branchId))
				.limit(1);

			if (!branch[0]) {
				throw new ORPCError("NOT_FOUND", {
					message: "Selected branch not found",
				});
			}

			if (branch[0].organizationId !== input.organizationId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Branch does not belong to the selected organization",
				});
			}

			// 2. Ensure tenant DB is available (set by orpcTenantMiddleware)
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			// 3. Validate & atomically redeem the branch invite (CAS pattern).
			//    A single UPDATE with the full validation predicate in the WHERE clause
			//    prevents TOCTOU races: two concurrent calls on a maxUses=1 invite
			//    both matching the read-then-validate pattern would each succeed,
			//    producing useCount=2. This collapses validate + increment into one
			//    round-trip whose result confirms success or failure atomically.
			const [redeemedInvite] = await context.tenantDb
				.update(invitations)
				.set({ usesCount: sql`${invitations.usesCount} + 1` })
				.where(
					and(
						eq(invitations.token, input.inviteToken),
						eq(invitations.kind, "branch_self_signup"),
						eq(invitations.isActive, true),
						// maxUses null = unlimited; otherwise require usesCount < maxUses
						or(
							isNull(invitations.maxUses),
							sql`${invitations.usesCount} < ${invitations.maxUses}`
						),
						gt(invitations.expiresAt, sql`now()`),
						// Invite must be scoped to the same branch the user selected
						eq(invitations.hierarchyScopeId, branch[0].tenantNodeId),
					)
				)
				.returning({ id: invitations.id, hierarchyScopeId: invitations.hierarchyScopeId });

			if (!redeemedInvite) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Invite token is invalid, expired, fully redeemed, or does not belong to this branch.",
				});
			}

			// 4. Check user is not already a member of this organization
			const existingMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, userId),
			});

			if (existingMember) {
				throw new ORPCError("CONFLICT", {
					message: "You are already a member of this organization",
				});
			}

			// 5. Create member first (dual-write: control panel + tenant)
			//    Done before user update so that if this fails, user stays in registration state
			const membershipService = new MembershipService(controlPanelDb);
			await membershipService.createMember({
				userId,
				organizationId: input.organizationId,
				role: "client",
				hierarchyScopeId: redeemedInvite.hierarchyScopeId,
				invitationId: redeemedInvite.id,
				tenantDb: context.tenantDb,
			});

			// 6. Update user profile fields and set role to "user" (marks registration as complete)
			await controlPanelDb
				.update(user)
				.set({
					phone: input.phone,
					idPassportNo: input.idPassportNo,
					addressType: input.addressType,
					streetAddress: input.streetAddress,
					city: input.city,
					state: input.state,
					country: input.country,
					postalCode: input.postalCode,
					dateOfBirth: input.dateOfBirth,
					emergencyContactName: input.emergencyContactName,
					emergencyContactRelationship: input.emergencyContactRelationship,
					emergencyContactPhone: input.emergencyContactPhone,
					role: "user",
				})
				.where(eq(user.id, userId));

			return {
				success: true,
				message: "Registration completed successfully",
				organizationId: input.organizationId,
			};
		}),
};
