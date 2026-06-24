/**
 * commission-incentives router (UAT §12 — incentive thresholds).
 *
 * Rules CRUD + award list + an admin-triggered period sweep. The sweep is also
 * run by the daily cron; the procedure here lets an admin re-run it on demand
 * (idempotent — re-running never double-pays).
 *
 * Permission: reuses commission_track_management (read | create | update).
 */

import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../guards";
import {
	createIncentive,
	deactivateIncentive,
	evaluateIncentivesForPeriod,
	listIncentiveAwards,
	listIncentives,
} from "@avantej-core/services/commission-incentive.service";
import type { CommissionRoleType } from "@avantej-core/types";

const ROLE_TYPE_VALUES: [CommissionRoleType, ...CommissionRoleType[]] = [
	"trainer",
	"sales",
	"marketing",
	"referrer",
];

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			name: z.string().min(1).max(200),
			roleType: z.enum(ROLE_TYPE_VALUES),
			trainerTierId: z.string().uuid().nullable().optional(),
			thresholdCents: z.number().int().min(0),
			bonusType: z.enum(["fixed", "pct"]),
			/** Cents (fixed) or basis points (pct, 0..10000). */
			bonusValue: z.number().int().min(0).max(100_000_000),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"create",
		);
		return createIncentive(context.tenantDb, {
			name: input.name,
			roleType: input.roleType,
			trainerTierId: input.trainerTierId,
			thresholdCents: input.thresholdCents,
			bonusType: input.bonusType,
			bonusValue: input.bonusValue,
		});
	});

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			activeOnly: z.boolean().optional(),
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
		return listIncentives(context.tenantDb, { activeOnly: input.activeOnly });
	});

const deactivate = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"update",
		);
		await deactivateIncentive(context.tenantDb, input.id);
		return { success: true };
	});

const listAwards = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			periodKey: z.string().min(1).optional(),
			staffId: z.string().min(1).optional(),
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
		return listIncentiveAwards(context.tenantDb, {
			periodKey: input.periodKey,
			staffId: input.staffId,
		});
	});

const evaluate = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			periodStart: z.string().datetime(),
			periodEnd: z.string().datetime(),
			periodKey: z.string().min(1).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"update",
		);
		return evaluateIncentivesForPeriod(context.tenantDb, {
			periodStart: new Date(input.periodStart),
			periodEnd: new Date(input.periodEnd),
			periodKey: input.periodKey,
		});
	});

export const commissionIncentivesRouter = {
	create,
	list,
	deactivate,
	listAwards,
	evaluate,
};
