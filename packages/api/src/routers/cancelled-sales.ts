import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listCancelledSales,
	getCancelledSaleById,
	exportCancelledSalesCsv,
} from "@avantej-core/services";

export const cancelledSalesRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			return listCancelledSales(context.tenantDb, {
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			const row = await getCancelledSaleById(
				context.tenantDb,
				input.id,
				context.accessibleNodeIds,
			);

			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: `Cancelled sale not found: ${input.id}`,
				});
			}

			return row;
		}),

	exportCsv: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			return exportCancelledSalesCsv(context.tenantDb, {
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),
};
