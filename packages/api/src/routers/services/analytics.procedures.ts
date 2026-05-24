import {
	avgSessionsSoldPerMonth,
	listServicesWithTrainerTiers,
	revenueShareByCategory,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
} from "../../guards";
import { schedulingTypeSchema, serviceTypeSchema } from "./schemas";

export const serviceAnalyticsProcedures = {
	revenueShareByCategory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				from: z.string().datetime(),
				to: z.string().datetime(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const from = new Date(input.from);
			const to = new Date(input.to);
			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			try {
				return await revenueShareByCategory(context.tenantDb, {
					from,
					to,
					accessibleNodeIds,
				});
			} catch (error) {
				if (
					error instanceof Error &&
					(error as NodeJS.ErrnoException & { code?: string }).code ===
						"BAD_REQUEST"
				) {
					throw new ORPCError("BAD_REQUEST", { message: error.message });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						error instanceof Error
							? error.message
							: "Failed to compute revenue share",
				});
			}
		}),

	avgSessionsSoldPerMonth: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}
			return avgSessionsSoldPerMonth(context.tenantDb, {
				serviceId: input.serviceId,
			});
		}),

	listWithTrainerTiers: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid().nullable().optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				type: serviceTypeSchema.optional(),
				schedulingType: schedulingTypeSchema.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			return listServicesWithTrainerTiers(context.tenantDb, {
				categoryId: input.categoryId ?? undefined,
				branchId: input.branchId ?? undefined,
				isActive: input.isActive,
				type: input.type,
				schedulingType: input.schedulingType,
				accessibleNodeIds,
			});
		}),
};
