import { eq, desc, and, gte, lte } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";

export const cancelledSalesRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
			})
		)
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
				await requirePermission(context.tenantDb, context.member, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const conditions = [eq(salesOrders.status, "cancelled")];
			if (input.customerId) {
				conditions.push(eq(salesOrders.customerId, input.customerId));
			}
			if (input.from) {
				conditions.push(gte(salesOrders.cancellationDate, new Date(input.from)));
			}
			if (input.to) {
				conditions.push(lte(salesOrders.cancellationDate, new Date(input.to)));
			}

			const rows = await context.tenantDb
				.select()
				.from(salesOrders)
				.where(and(...conditions))
				.orderBy(desc(salesOrders.cancellationDate));

			return rows.map((row) => ({
				id: row.id,
				cancellationNumber: row.cancellationNumber,
				salesOrderId: row.id,
				cancellationDate: row.cancellationDate,
				cancelledAmount: row.cancelledAmount ?? row.totalAmount,
				cancellationReason: row.cancellationReason,
				cancelledBy: row.cancelledBy,
				customerId: row.customerId,
				customerName: row.customerName,
				createdAt: row.createdAt,
			}));
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
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
				await requirePermission(context.tenantDb, context.member, "sales", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const row = await context.tenantDb.query.salesOrders.findFirst({
				where: and(
					eq(salesOrders.id, input.id),
					eq(salesOrders.status, "cancelled")
				),
			});

			if (!row) {
				throw new ORPCError("NOT_FOUND", {
					message: `Cancelled sale not found: ${input.id}`,
				});
			}

			return {
				id: row.id,
				cancellationNumber: row.cancellationNumber,
				salesOrderId: row.id,
				cancellationDate: row.cancellationDate,
				cancelledAmount: row.cancelledAmount ?? row.totalAmount,
				cancellationReason: row.cancellationReason,
				cancelledBy: row.cancelledBy,
				customerId: row.customerId,
				customerName: row.customerName,
				createdAt: row.createdAt,
			};
		}),
};
