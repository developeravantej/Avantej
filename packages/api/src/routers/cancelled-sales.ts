import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listCancelledSales,
	getCancelledSaleById,
	exportCancelledSalesCsv,
} from "@avantej-core/services";

function requireTenantMember(context: { tenantDb?: unknown; member?: unknown }) {
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
}

export const cancelledSalesRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
				limit: z.number().int().min(1).max(200).default(50),
				offset: z.number().int().min(0).default(0),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			await requirePermissionOrpc(context.tenantDb, context.member, "sales", "read");

			return listCancelledSales(context.tenantDb!, {
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			await requirePermissionOrpc(context.tenantDb, context.member, "sales", "read");

			const row = await getCancelledSaleById(
				context.tenantDb!,
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

	exportCsv: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			requireTenantMember(context);

			await requirePermissionOrpc(context.tenantDb, context.member, "sales", "read");

			return exportCancelledSalesCsv(context.tenantDb!, {
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),
};
