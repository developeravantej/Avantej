import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listPurchaseOrders,
	getPurchaseOrderById,
	createPurchaseOrder,
	approvePurchaseOrder,
	receiveItems,
	cancelPurchaseOrder,
} from "@avantej-core/services/purchase-orders.service";
import { requirePermission } from "@avantej-core/services";

export const purchaseOrdersRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				supplierId: z.string().uuid().optional(),
				branchId: z.string().uuid().optional(),
				status: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
				limit: z.number().int().positive().optional(),
				offset: z.number().int().nonnegative().optional(),
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
					"purchase_order_management",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			return listPurchaseOrders(context.tenantDb, {
				supplierId: input.supplierId,
				branchId: input.branchId,
				status: input.status,
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
					"purchase_order_management",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			const result = await getPurchaseOrderById(
				context.tenantDb,
				input.id,
			);
			if (!result) {
				throw new ORPCError("NOT_FOUND", {
					message: `Purchase order not found: ${input.id}`,
				});
			}
			return result;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				supplierId: z.string().uuid(),
				branchId: z.string().uuid(),
				orderDate: z.string().datetime(),
				expectedDeliveryDate: z.string().datetime().optional(),
				notes: z.string().optional(),
				items: z
					.array(
						z.object({
							productId: z.string().uuid(),
							orderedQty: z.number().int().positive(),
							unitCost: z.number().int().nonnegative(),
						}),
					)
					.min(1),
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
					"purchase_order_management",
					"create",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			return createPurchaseOrder(context.tenantDb, {
				supplierId: input.supplierId,
				branchId: input.branchId,
				orderDate: new Date(input.orderDate),
				expectedDeliveryDate: input.expectedDeliveryDate
					? new Date(input.expectedDeliveryDate)
					: undefined,
				notes: input.notes,
				createdBy: context.member.userId,
				items: input.items,
			});
		}),

	approve: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
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
					"purchase_order_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			try {
				return await approvePurchaseOrder(context.tenantDb, input.id, {
					userId: context.member.userId,
					memberId: context.member.id,
					role: context.member.role,
					branchId: context.member.hierarchyScopeId ?? undefined,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to approve purchase order",
				});
			}
		}),

	receiveItems: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				purchaseOrderId: z.string().uuid(),
				items: z.array(
					z.object({
						itemId: z.string().uuid(),
						receivedQty: z.number().int().positive(),
					}),
				),
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
					"purchase_order_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			return receiveItems(
				context.tenantDb,
				input.purchaseOrderId,
				input.items,
			);
		}),

	cancel: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
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
					"purchase_order_management",
					"delete",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error
							? error.message
							: "Permission denied",
				});
			}

			try {
				return await cancelPurchaseOrder(context.tenantDb, input.id, {
					userId: context.member.userId,
					memberId: context.member.id,
					role: context.member.role,
					branchId: context.member.hierarchyScopeId ?? undefined,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to cancel purchase order",
				});
			}
		}),
};
