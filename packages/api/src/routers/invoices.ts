import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {

	listInvoices,
	getInvoiceById,
	createInvoice,
	updateInvoice,
	getPaymentStatusHistory,
} from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../lib/context-helpers";
import { encodeCursor, parseCursor } from "../lib/cursor";

const invoiceStatusEnum = z.enum(["draft", "sent", "paid", "partially_paid", "overdue", "cancelled"]);

export const invoicesRouter = {
	list: tenantProcedure
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "payments", "read")

			const invoiceRows = await listInvoices(context.tenantDb, {
				status: input.status,
				customerId: input.customerId,
				salesOrderId: input.salesOrderId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
			});

			if (invoiceRows.length === 0) return invoiceRows;

			// Batch-resolve createdBy IDs → display names
			const createdByIds = [
				...new Set(invoiceRows.map((r) => r.createdBy).filter((id): id is string => !!id)),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				createdByIds.length > 0
					? await cpDb
							.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
							.from(cpUsers)
							.where(inArray(cpUsers.id, createdByIds))
					: [];
			const nameMap = new Map(userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]));

			return invoiceRows.map((r) => ({
				...r,
				createdByName: r.createdBy ? (nameMap.get(r.createdBy) ?? null) : null,
			}));
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "payments", "read")

			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			return invoice;
		}),

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
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "payments", "create")

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
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "payments", "update")

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

	paymentStatusHistory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				paymentId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "payments", "read")

			const limit = input.limit ?? 50;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getPaymentStatusHistory(context.tenantDb, input.paymentId, {
				parsedCursor,
				limit,
			});

			const hasMore = rawRows.length > limit;
			const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

			const userIds = [
				...new Set(pageRows.map((r) => r.changedBy).filter((id) => id !== "system")),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				userIds.length > 0
					? await cpDb
							.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
							.from(cpUsers)
							.where(inArray(cpUsers.id, userIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
			);

			const rows = pageRows.map(({ changedBy, ...rest }) => ({
				...rest,
				changedByName:
					changedBy === "system"
						? "System"
						: (nameMap.get(changedBy) ?? "Unknown User"),
			}));

			return { rows, nextCursor };
		}),
};
