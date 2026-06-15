/**
 * commission-tracks — list (read) procedures.
 *
 * Permission: commission_track_management:read
 */

import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../../guards";
import { listTracksForCategory } from "@avantej-core/services/commission-tracks.service";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"read",
		);

		return listTracksForCategory(context.tenantDb, input.categoryId);
	});

export const commissionTracksListProcedures = {
	list,
};
