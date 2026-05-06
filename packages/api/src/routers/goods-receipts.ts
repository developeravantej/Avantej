import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	cancelReceipt,
	createReceipt,
	createSupplierInvoice,
	getReceiptById,
	listReceiptsForPo,
	listSupplierInvoices,
	markInvoiceMatched,
	requirePermission,
} from "@avantej-core/services";

export const goodsReceiptsRouter = {
	listForPo: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				purchaseOrderId: z.string().uuid(),
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
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			return listReceiptsForPo(context.tenantDb, input.purchaseOrderId);
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
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			const result = await getReceiptById(context.tenantDb, input.id);
			if (!result) {
				throw new ORPCError("NOT_FOUND", {
					message: `Goods receipt not found: ${input.id}`,
				});
			}
			return result;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				purchaseOrderId: z.string().uuid(),
				branchId: z.string().uuid(),
				receivedAt: z.string().datetime(),
				notes: z.string().optional(),
				items: z
					.array(
						z.object({
							purchaseOrderItemId: z.string().uuid(),
							productId: z.string().uuid(),
							quantityReceived: z.number().int().positive(),
							quantityDamaged: z.number().int().nonnegative().optional(),
							notes: z.string().optional(),
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
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			try {
				return await createReceipt(context.tenantDb, {
					purchaseOrderId: input.purchaseOrderId,
					branchId: input.branchId,
					receivedAt: new Date(input.receivedAt),
					receivedBy: context.member.userId,
					notes: input.notes,
					items: input.items,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to create receipt",
				});
			}
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
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			try {
				return await cancelReceipt(context.tenantDb, input.id);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to cancel receipt",
				});
			}
		}),

	createInvoice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceNumber: z.string().min(1),
				supplierId: z.string().uuid(),
				purchaseOrderId: z.string().uuid().optional(),
				goodsReceiptId: z.string().uuid().optional(),
				totalCents: z.number().int().nonnegative(),
				taxCents: z.number().int().nonnegative().optional(),
				invoiceDate: z.string().datetime(),
				dueDate: z.string().datetime().optional(),
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
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			return createSupplierInvoice(context.tenantDb, {
				invoiceNumber: input.invoiceNumber,
				supplierId: input.supplierId,
				purchaseOrderId: input.purchaseOrderId,
				goodsReceiptId: input.goodsReceiptId,
				totalCents: input.totalCents,
				taxCents: input.taxCents,
				invoiceDate: new Date(input.invoiceDate),
				dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
			});
		}),

	listInvoices: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				supplierId: z.string().uuid().optional(),
				status: z.string().optional(),
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
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			return listSupplierInvoices(context.tenantDb, {
				supplierId: input.supplierId,
				status: input.status,
			});
		}),

	matchInvoice: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
				toleranceCents: z.number().int().nonnegative().optional(),
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
						error instanceof Error ? error.message : "Permission denied",
				});
			}
			try {
				return await markInvoiceMatched(context.tenantDb, {
					invoiceId: input.invoiceId,
					matchedBy: context.member.userId,
					toleranceCents: input.toleranceCents,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to match invoice",
				});
			}
		}),
};
