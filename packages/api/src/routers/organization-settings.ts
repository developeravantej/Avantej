/**
 * Organization Settings Router
 *
 * API endpoints for reading and upserting key-value organization settings.
 * Get is available to all authenticated members; upsert is admin-only.
 */

import { getSetting, upsertSetting } from "@avantej-core/services";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch, requirePermissionOrpc } from "../guards";

export const organizationSettingsRouter = {
	get: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid(), key: z.string() }))
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
						const value = await getSetting(context.tenantDb, input.key);
			if (value === null) return null;
			return { key: input.key, value };
		}),

	upsert: tenantProcedure
		.input(z.object({ organizationId: z.string().uuid(), key: z.string(), value: z.string() }))
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "organization_settings", "update");
			return upsertSetting(context.tenantDb, input.key, input.value, context.member.userId);
		}),
};
