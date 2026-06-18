import { protectedProcedure } from "@avantej-core/api";
import { requirePermission } from "@avantej-core/services";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";

export const ghlProcedures = {
	/**
	 * Manually retry GHL customer sync for a customer profile.
	 *
	 * Mirrors `members.retryGhlSync`. Resolves the customer profile, then
	 * re-fires `fireCustomerSync` with operation='update' (the dispatcher
	 * reconciles existing vs. missing GHL contact via the deleted-link
	 * guard in the orchestrator). Permission-gated by customer_management:update.
	 */
	retryGhlSync: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"update",
			);

			const profile = await context.tenantDb.query.customerProfiles.findFirst({
				where: eq(customerProfiles.id, input.customerProfileId),
			});
			if (!profile) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}
			// Phase 4: dependent profiles (account_group members) have no user_id
			// and therefore no Avantej login or GHL sync surface.
			if (!profile.userId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Cannot retry GHL sync for a dependent customer profile",
				});
			}

			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, profile.userId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer member not found",
				});
			}
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			const ghlSync = await fireCustomerSync({
				honoContext: context.honoContext,
				tenantDb: context.tenantDb,
				organizationId: input.organizationId,
				userId: profile.userId,
				customerProfile: profile,
				operation: profile.isDeleted ? "delete" : "update",
			}).catch((err: unknown) => ({
				status: "error" as const,
				error: err instanceof Error ? err.message : String(err),
			}));

			return { ghlSync };
		}),
};
