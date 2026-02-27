import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	requirePermission,
	listInvoices,
	getInvoiceById,
	createInvoice,
	updateInvoice,
} from "@avantej-core/services";

const invoiceStatusEnum = z.enum(["draft", "sent", "paid", "partially_paid", "overdue", "cancelled"]);

export const invoicesRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z.string().optional(),
				customerId: z.string().optional(),
				salesOrderId: z.string().uuid().optional(),
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
				await requirePermission(context.tenantDb, context.member, "payments", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return listInvoices(context.tenantDb, {
				status: input.status,
				customerId: input.customerId,
				salesOrderId: input.salesOrderId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
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
				await requirePermission(context.tenantDb, context.member, "payments", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			return invoice;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid().optional(),
				paymentId: z.string().uuid().optional(),
				date: z.string().datetime(),
				dueDate: z.string().datetime().optional(),
				customerId: z.string().optional(),
				customerName: z.string().min(1),
				createdBy: z.string().min(1),
				paymentMode: z.string().optional(),
				totalAmount: z.number().int(),
				amountPaid: z.number().int().optional(),
				status: invoiceStatusEnum,
				eInvoiceStatus: z.string().optional(),
				eInvoiceId: z.string().optional(),
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
				await requirePermission(context.tenantDb, context.member, "payments", "create");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createInvoice(context.tenantDb, {
				salesOrderId: input.salesOrderId,
				paymentId: input.paymentId,
				date: new Date(input.date),
				dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
				customerId: input.customerId,
				customerName: input.customerName,
				createdBy: input.createdBy,
				paymentMode: input.paymentMode,
				totalAmount: input.totalAmount,
				amountPaid: input.amountPaid,
				status: input.status,
				eInvoiceStatus: input.eInvoiceStatus,
				eInvoiceId: input.eInvoiceId,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				salesOrderId: z.string().uuid().optional(),
				paymentId: z.string().uuid().optional(),
				date: z.string().datetime().optional(),
				dueDate: z.string().datetime().optional(),
				customerId: z.string().optional(),
				customerName: z.string().optional(),
				paymentMode: z.string().optional(),
				totalAmount: z.number().int().optional(),
				amountPaid: z.number().int().optional(),
				status: invoiceStatusEnum.optional(),
				eInvoiceStatus: z.string().optional(),
				eInvoiceId: z.string().optional(),
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
				await requirePermission(context.tenantDb, context.member, "payments", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return updateInvoice(context.tenantDb, input.id, {
				salesOrderId: input.salesOrderId,
				paymentId: input.paymentId,
				date: input.date ? new Date(input.date) : undefined,
				dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
				customerId: input.customerId,
				customerName: input.customerName,
				paymentMode: input.paymentMode,
				totalAmount: input.totalAmount,
				amountPaid: input.amountPaid,
				status: input.status,
				eInvoiceStatus: input.eInvoiceStatus,
				eInvoiceId: input.eInvoiceId,
			});
		}),
};
