import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
} from "../../guards";
import { listInvoices, getPaymentStatusHistory } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { getControlPanelDb } from "../../lib/context-helpers";
import { encodeCursor, parseCursor } from "../../lib/cursor";
import { guardInvoiceSalesOrderBranch } from "./shared";

export const invoicesListProcedures = {
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
