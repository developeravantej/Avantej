import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
import {
	getDashboardKpis,
	getStaffPerformance,
	getRevenueSeries,
	getMemberCountSeries,
	getChurnSeries,
	getLtvSeries,
	getClassFillRateSeries,
} from "@avantej-core/services/analytics.service";

const getDashboardKpisHandler = protectedProcedure
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"reports",
				"read",
			);
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}

		return getDashboardKpis(context.tenantDb, {
			period: input.period,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getStaffPerformanceHandler = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			period: z.enum(["today", "this_week", "this_month", "this_year"]),
			branchId: z.string().uuid().optional(),
		}),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"reports",
				"read",
			);
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}

		return getStaffPerformance(context.tenantDb, {
			period: input.period,
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

const getRevenueSeriesHandler = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			days: z.number().int().min(1).max(365),
			branchId: z.string().uuid().optional(),
		}),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"reports",
				"read",
			);
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}

		return getRevenueSeries(context.tenantDb, {
			days: input.days,
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

// ── Series input schema (reused across all 4 series procedures) ───────────────

const seriesInput = z.object({
	organizationId: z.string().uuid(),
	days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

// ── getMemberCountSeries ──────────────────────────────────────────────────────

const getMemberCountSeriesHandler = protectedProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}
		try {
			await requirePermission(context.tenantDb, context.member, "reports", "read");
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}
		return getMemberCountSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

// ── getChurnSeries ────────────────────────────────────────────────────────────

const getChurnSeriesHandler = protectedProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}
		try {
			await requirePermission(context.tenantDb, context.member, "reports", "read");
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}
		return getChurnSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

// ── getLtvSeries ──────────────────────────────────────────────────────────────

const getLtvSeriesHandler = protectedProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}
		try {
			await requirePermission(context.tenantDb, context.member, "reports", "read");
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}
		return getLtvSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

// ── getClassFillRateSeries ────────────────────────────────────────────────────

const getClassFillRateSeriesHandler = protectedProcedure
	.input(seriesInput)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available. Ensure organization context is set.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}
		try {
			await requirePermission(context.tenantDb, context.member, "reports", "read");
		} catch (e) {
			throw new ORPCError("FORBIDDEN", {
				message: e instanceof Error ? e.message : "Permission denied",
			});
		}
		return getClassFillRateSeries(context.tenantDb, {
			days: input.days,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
		});
	});

export const analyticsRouter = {
	getDashboardKpis: getDashboardKpisHandler,
	getStaffPerformance: getStaffPerformanceHandler,
	getRevenueSeries: getRevenueSeriesHandler,
	getMemberCountSeries: getMemberCountSeriesHandler,
	getChurnSeries: getChurnSeriesHandler,
	getLtvSeries: getLtvSeriesHandler,
	getClassFillRateSeries: getClassFillRateSeriesHandler,
};
