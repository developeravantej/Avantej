import {
	getMembersNewToday,
	getDescendantNodeIds,
} from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	resolveAccessibleNodeIds,
	guardInputBranchForContext,
} from "../../guards";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";

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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			// Check permission
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"user_management",
				"read",
			);

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
				member.hierarchyScopeId,
			);

			// Get user details from control panel
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;

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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"user_management",
				"read",
			);

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			// Tenant isolation: a requested branchId must be within the caller's
			// scope. Without this, member-stats.service line 65 lets branchId
			// REPLACE accessibleNodeIds, leaking any branch's new-member stats.
			await guardInputBranchForContext(context, input.branchId);

			return getMembersNewToday(context.tenantDb, {
				accessibleNodeIds,
				branchId: input.branchId,
			});
		}),
};
