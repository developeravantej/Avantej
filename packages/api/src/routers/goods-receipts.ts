import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../guards";
import {
	cancelReceipt,
	createReceipt,
	createSupplierInvoice,
	updateSupplierInvoice,
	disputeInvoice,
	getInvoicePreview,
	getReceiptById,
	listReceiptsForPo,
	listSupplierInvoices,
	markInvoiceMatched,
	markInvoicePaid,

} from "@avantej-core/services";

export const goodsReceiptsRouter = {
	listForPo: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				purchaseOrderId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "read");
			return listReceiptsForPo(context.tenantDb, input.purchaseOrderId);
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
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "read");
			const result = await getReceiptById(context.tenantDb, input.id);
			if (!result) {
				throw new ORPCError("NOT_FOUND", {
					message: `Goods receipt not found: ${input.id}`,
				});
			}
			return result;
		}),

	create: tenantProcedure
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
			
			
		assertOrgContextMatch(context, input);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update");
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

	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update");
			try {
				return await cancelReceipt(context.tenantDb, input.id, {
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
							: "Failed to cancel receipt",
				});
			}
		}),

	createInvoice: tenantProcedure
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
			
			
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "create");
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

	// F-INV-04: edit a supplier invoice while pending/disputed.
	updateInvoice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
				invoiceNumber: z.string().min(1).optional(),
				totalCents: z.number().int().nonnegative().optional(),
				taxCents: z.number().int().nonnegative().optional(),
				invoiceDate: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update");
			try {
				return await updateSupplierInvoice(context.tenantDb, {
					invoiceId: input.invoiceId,
					invoiceNumber: input.invoiceNumber,
					totalCents: input.totalCents,
					taxCents: input.taxCents,
					invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : undefined,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error ? error.message : "Failed to update invoice",
				});
			}
		}),

	listInvoices: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				supplierId: z.string().uuid().optional(),
				status: z.string().optional(),
				purchaseOrderId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(200).optional(),
				offset: z.number().int().nonnegative().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "read");
			return listSupplierInvoices(context.tenantDb, {
				supplierId: input.supplierId,
				status: input.status,
				purchaseOrderId: input.purchaseOrderId,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	matchInvoice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
				toleranceCents: z.number().int().nonnegative().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			
			
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update");
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

	disputeInvoice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
				reason: z.string().min(1, "Dispute reason is required"),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
									await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update")
			try {
				return await disputeInvoice(context.tenantDb, { invoiceId: input.invoiceId, disputeReason: input.reason });
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Failed to dispute invoice" });
			}
		}),

	markInvoicePaid: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
				paymentReference: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
									await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "update")
			try {
				return await markInvoicePaid(context.tenantDb, input.invoiceId, context.member.userId, input.paymentReference);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Failed to mark invoice as paid" });
			}
		}),

	getInvoicePreview: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				invoiceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
									await requirePermissionOrpc(context.tenantDb, context.member, "purchase_order_management", "read")
			try {
				return await getInvoicePreview(context.tenantDb, input.invoiceId);
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", { message: error instanceof Error ? error.message : "Failed to get invoice preview" });
			}
		}),
};
