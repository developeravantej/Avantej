/**
 * GHL Sync Router
 *
 * Read-only access to the tenant's GoHighLevel webhook sync events
 * (ghl_sync_events) for in-app observability. Requires user_management:read.
 */

import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

export type GhlSyncEventRow = {
	id: string;
	eventType: string;
	ghlContactId: string | null;
	email: string | null;
	status: string;
	errorMessage: string | null;
	rawPayload: unknown;
	createdAt: Date;
};

export const ghlSyncRouter = {
	/**
	 * List recent GHL sync events for the current tenant, newest first.
	 * Returns the raw payload for inspection alongside status/error metadata.
	 */
	listEvents: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).default(25),
			}),
		)
		.handler(async ({ context, input }): Promise<GhlSyncEventRow[]> => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
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
				"user_management",
				"read",
			);
			const rows = await context.tenantDb
				.select({
					id: ghlSyncEvents.id,
					eventType: ghlSyncEvents.eventType,
					ghlContactId: ghlSyncEvents.ghlContactId,
					email: ghlSyncEvents.email,
					status: ghlSyncEvents.status,
					errorMessage: ghlSyncEvents.errorMessage,
					rawPayload: ghlSyncEvents.rawPayload,
					createdAt: ghlSyncEvents.createdAt,
				})
				.from(ghlSyncEvents)
				.orderBy(desc(ghlSyncEvents.createdAt))
				.limit(input.limit);
			return rows as GhlSyncEventRow[];
		}),
};
