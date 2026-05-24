/**
 * Organization Settings Router
 *
 * API endpoints for reading and upserting key-value organization settings.
 * Get is available to all authenticated members; upsert is admin-only.
 */

import { getSetting, upsertSetting } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";

export const organizationSettingsRouter = {
	get: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid(), key: z.string() }))
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB" });
			const value = await getSetting(context.tenantDb, input.key);
			if (value === null) return null;
			return { key: input.key, value };
		}),

	upsert: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid(), key: z.string(), value: z.string() }))
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "No tenant DB" });
			if (!context.member) throw new ORPCError("FORBIDDEN", { message: "Not a member" });
			if (context.member.role !== "admin") throw new ORPCError("FORBIDDEN", { message: "Admin only" });
			return upsertSetting(context.tenantDb, input.key, input.value, context.member.userId);
		}),
};
