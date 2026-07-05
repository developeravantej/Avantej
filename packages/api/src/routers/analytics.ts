import { z } from "zod";
import { resolveScopeNodeIds } from "@avantej-core/services";
import { tenantProcedure } from "../index";
import {
	assertOrgContextMatch,
	guardBranchAccessible,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
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
	branchId: z.string().uuid().optional(),
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
		// Resolve the RBAC ceiling once. Prefer context.accessibleNodeIds, but
		// fall back to the member's hierarchy subtree when it is empty
		// (defense-in-depth: a degraded empty context must not skip the
		// FORBIDDEN guard or silently widen scope). When context.accessibleNodeIds
		// is non-empty this returns it verbatim, so behavior is unchanged.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		guardBranchAccessible(input.branchId, accessibleNodeIds);
		const nodeIds = input.branchId
			? await resolveScopeNodeIds(
					context.tenantDb,
					input.branchId,
					accessibleNodeIds,
				)
			: accessibleNodeIds;
		return getMemberCountSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: nodeIds,
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
		// Resolve the RBAC ceiling once. Prefer context.accessibleNodeIds, but
		// fall back to the member's hierarchy subtree when it is empty
		// (defense-in-depth: a degraded empty context must not skip the
		// FORBIDDEN guard or silently widen scope). When context.accessibleNodeIds
		// is non-empty this returns it verbatim, so behavior is unchanged.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		guardBranchAccessible(input.branchId, accessibleNodeIds);
		const nodeIds = input.branchId
			? await resolveScopeNodeIds(
					context.tenantDb,
					input.branchId,
					accessibleNodeIds,
				)
			: accessibleNodeIds;
		return getChurnSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: nodeIds,
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
		// Resolve the RBAC ceiling once. Prefer context.accessibleNodeIds, but
		// fall back to the member's hierarchy subtree when it is empty
		// (defense-in-depth: a degraded empty context must not skip the
		// FORBIDDEN guard or silently widen scope). When context.accessibleNodeIds
		// is non-empty this returns it verbatim, so behavior is unchanged.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		guardBranchAccessible(input.branchId, accessibleNodeIds);
		const nodeIds = input.branchId
			? await resolveScopeNodeIds(
					context.tenantDb,
					input.branchId,
					accessibleNodeIds,
				)
			: accessibleNodeIds;
		return getLtvSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: nodeIds,
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
		// Resolve the RBAC ceiling once. Prefer context.accessibleNodeIds, but
		// fall back to the member's hierarchy subtree when it is empty
		// (defense-in-depth: a degraded empty context must not skip the
		// FORBIDDEN guard or silently widen scope). When context.accessibleNodeIds
		// is non-empty this returns it verbatim, so behavior is unchanged.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		guardBranchAccessible(input.branchId, accessibleNodeIds);
		const nodeIds = input.branchId
			? await resolveScopeNodeIds(
					context.tenantDb,
					input.branchId,
					accessibleNodeIds,
				)
			: accessibleNodeIds;
		return getClassFillRateSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: nodeIds,
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
