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
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { requirePermission } from "@avantej-core/services";

export const permissionsRouter = {
	/**
	 * List permissions, optionally filtered by resource
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				resource: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
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
