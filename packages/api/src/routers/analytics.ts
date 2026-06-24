import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	assertOrgContextMatch,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../guards";
import {
	getDashboardKpis,
	getStaffPerformance,
	getCommissionByTier,
	getRevenueSeries,
	getMemberCountSeries,
	getChurnSeries,
	getLtvSeries,
	getClassFillRateSeries,
} from "@avantej-core/services/analytics.service";

const getDashboardKpisHandler = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			period: z.enum([
				"today",
				"this_week",
				"this_month",
				"this_year",
				"custom",
			]),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds);

		return getDashboardKpis(context.tenantDb, {
			period: input.period,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getStaffPerformanceHandler = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			period: z.enum(["today", "this_week", "this_month", "this_year"]),
			branchId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds);

		return getStaffPerformance(context.tenantDb, {
			period: input.period,
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getCommissionByTierHandler = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			period: z.enum([
				"today",
				"this_week",
				"this_month",
				"this_year",
				"custom",
			]),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);

		return getCommissionByTier(context.tenantDb, {
			period: input.period,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getRevenueSeriesHandler = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			days: z.number().int().min(1).max(365),
			branchId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds);

		return getRevenueSeries(context.tenantDb, {
			days: input.days,
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const seriesInput = z.object({
	organizationId: z.string().uuid(),
	days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

const getMemberCountSeriesHandler = tenantProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		return getMemberCountSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getChurnSeriesHandler = tenantProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		return getChurnSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getLtvSeriesHandler = tenantProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		return getLtvSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getClassFillRateSeriesHandler = tenantProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"read",
		);
		return getClassFillRateSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

export const analyticsRouter = {
	getDashboardKpis: getDashboardKpisHandler,
	getStaffPerformance: getStaffPerformanceHandler,
	getCommissionByTier: getCommissionByTierHandler,
	getRevenueSeries: getRevenueSeriesHandler,
	getMemberCountSeries: getMemberCountSeriesHandler,
	getChurnSeries: getChurnSeriesHandler,
	getLtvSeries: getLtvSeriesHandler,
	getClassFillRateSeries: getClassFillRateSeriesHandler,
};
