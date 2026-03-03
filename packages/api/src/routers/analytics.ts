import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
import {
	getDashboardKpis,
	getStaffPerformance,
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
			period: z.enum(["this_week", "this_month", "this_year"]),
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

export const analyticsRouter = {
	getDashboardKpis: getDashboardKpisHandler,
	getStaffPerformance: getStaffPerformanceHandler,
};
