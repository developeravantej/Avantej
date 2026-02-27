import { eq, desc, and, gte, lte } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";
import { cancelledSales } from "@avantej-core/db/schema/tenant/cancelled-sales";

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

			const conditions = [];
			if (input.customerId) {
				conditions.push(eq(cancelledSales.customerId, input.customerId));
			}
			if (input.from) {
				conditions.push(gte(cancelledSales.cancellationDate, new Date(input.from)));
			}
			if (input.to) {
				conditions.push(lte(cancelledSales.cancellationDate, new Date(input.to)));
			}

			return context.tenantDb.query.cancelledSales.findMany({
				where: conditions.length > 0 ? and(...conditions) : undefined,
				orderBy: [desc(cancelledSales.cancellationDate)],
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

			const record = await context.tenantDb.query.cancelledSales.findFirst({
				where: eq(cancelledSales.id, input.id),
			});

			if (!record) {
				throw new ORPCError("NOT_FOUND", {
					message: `Cancelled sale not found: ${input.id}`,
				});
			}
			return record;
		}),
};
