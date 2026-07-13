import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { createInvoice, updateInvoice } from "@avantej-core/services";
import { invoiceStatusEnum } from "./shared";

export const invoicesWriteProcedures = {
	create: tenantProcedure
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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"create",
			);

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

	update: tenantProcedure
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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"update",
			);

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
