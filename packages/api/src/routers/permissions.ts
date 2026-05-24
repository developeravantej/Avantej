/**
 * Permissions Router
 *
 * API endpoint for listing available permissions.
 * Permissions are resource:action pairs (e.g., "user_management:read").
 */

import { permissions } from "@avantej-core/db/schema/tenant/permissions";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import { requirePermission } from "@avantej-core/services";

export const permissionsRouter = {
	/**
	 * List permissions, optionally filtered by resource
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				resource: z.string().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")

			const items = await context.tenantDb
				.select()
				.from(permissions)
				.where(
					input.resource
						? eq(permissions.resource, input.resource)
						: undefined
				);

			return items;
		}),
};
