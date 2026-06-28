import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
	guardStoredBranchForContext,
	resolveAccessibleNodeIds,
} from "../guards";
import {
	listInvoices,
	getInvoiceById,
	getInvoiceWithItems,
	createInvoice,
	updateInvoice,
	getPaymentStatusHistory,
} from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { getControlPanelDb } from "../lib/context-helpers";
import { encodeCursor, parseCursor } from "../lib/cursor";

const invoiceStatusEnum = z.enum([
	"draft",
	"sent",
	"paid",
	"partially_paid",
	"overdue",
	"cancelled",
]);

/**
 * Enforce salesOrder branch scope for a by-id invoice read, mirroring how
 * `listInvoices` scopes its result set (`invoice.service.ts`):
 *
 * - listInvoices innerJoins salesOrders and filters
 *   `inArray(salesOrders.branchId, accessibleNodeIds)` ONLY when the caller has a
 *   non-empty scope. That JOIN hides from scoped staff both (a) invoices with no
 *   sales order and (b) invoices whose sales order's branch is outside scope.
 * - Admins / unscoped callers (empty accessibleNodeIds) bypass the JOIN entirely
 *   and see every invoice, orphans included.
 *
 * This helper reproduces that exactly: a scoped caller (non-empty scope) gets
 * NOT_FOUND for the orphan/null-branch class (no sales order, missing sales
 * order, or null branchId) so the row is hidden with no enumeration; a branch
 * that exists but is out of scope is rejected by `guardStoredBranchForContext`
 * (FORBIDDEN). Unscoped callers fall through and are allowed.
 */
async function guardInvoiceSalesOrderBranch(
	context: Parameters<typeof guardStoredBranchForContext>[0],
	salesOrderId: string | null | undefined,
	notFoundId: string,
): Promise<void> {
	const order = salesOrderId
		? await context.tenantDb.query.salesOrders.findFirst({
				where: eq(salesOrders.id, salesOrderId),
				columns: { branchId: true },
			})
		: undefined;
	const branchId = order?.branchId ?? null;

	if (!branchId) {
		// Orphan / null-branch: hidden from scoped staff, allowed for unscoped admins.
		const accessibleNodeIds = await resolveAccessibleNodeIds(context);
		if (accessibleNodeIds.length > 0) {
			throw new ORPCError("NOT_FOUND", {
				message: `Not found: ${notFoundId}`,
			});
		}
		return;
	}
	await guardStoredBranchForContext(context, branchId);
}

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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

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
				...new Set(
					invoiceRows
						.map((r) => r.createdBy)
						.filter((id): id is string => !!id),
				),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				createdByIds.length > 0
					? await cpDb
							.select({
								id: cpUsers.id,
								name: cpUsers.name,
								email: cpUsers.email,
							})
							.from(cpUsers)
							.where(inArray(cpUsers.id, createdByIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown"]),
			);

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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			const invoice = await getInvoiceById(context.tenantDb, input.id);
			if (!invoice) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			// Branch scope lives on the linked sales order (invoices have no branchId).
			// Mirror listInvoices: scoped staff get NOT_FOUND for the orphan/null-branch
			// class; an out-of-scope branch is FORBIDDEN; unscoped admins see everything.
			await guardInvoiceSalesOrderBranch(
				context,
				invoice.salesOrderId,
				input.id,
			);
			return invoice;
		}),

	/**
	 * Fetch an invoice with its line-item breakdown for PDF rendering. The web
	 * client builds the actual PDF (jsPDF, mirroring reports/export-pdf.ts) from
	 * this payload — the server stays presentation-free. Same read permission +
	 * hierarchy scope as getById/list.
	 */
	getDetail: tenantProcedure
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
				"payments",
				"read",
			);

			const detail = await getInvoiceWithItems(context.tenantDb, input.id);
			if (!detail) {
				throw new ORPCError("NOT_FOUND", {
					message: `Invoice not found: ${input.id}`,
				});
			}
			assertTenantContext(context);
			// Same salesOrder-branch scope as getById (mirrors listInvoices): scoped
			// staff get NOT_FOUND for orphan/null-branch, out-of-scope is FORBIDDEN.
			await guardInvoiceSalesOrderBranch(
				context,
				detail.invoice.salesOrderId,
				input.id,
			);
			return detail;
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

	paymentStatusHistory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				paymentId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"payments",
				"read",
			);

			assertTenantContext(context);
			// payments carry no branchId; resolve scope via the invoice that owns this
			// paymentId → its sales order branch. The orphan/null-branch class (no
			// linked invoice, no sales order, or null branchId) is hidden from scoped
			// staff with NOT_FOUND (no enumeration) and allowed for unscoped admins —
			// mirroring listInvoices.
			const linkedInvoice = await context.tenantDb.query.invoices.findFirst({
				where: eq(invoices.paymentId, input.paymentId),
				columns: { salesOrderId: true },
			});
			await guardInvoiceSalesOrderBranch(
				context,
				linkedInvoice?.salesOrderId,
				input.paymentId,
			);

			const limit = input.limit ?? 50;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getPaymentStatusHistory(
				context.tenantDb,
				input.paymentId,
				{
					parsedCursor,
					limit,
				},
			);

			const hasMore = rawRows.length > limit;
			const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

			const userIds = [
				...new Set(
					pageRows.map((r) => r.changedBy).filter((id) => id !== "system"),
				),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				userIds.length > 0
					? await cpDb
							.select({
								id: cpUsers.id,
								name: cpUsers.name,
								email: cpUsers.email,
							})
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
