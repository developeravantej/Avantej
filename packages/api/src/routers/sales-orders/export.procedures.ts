/**
 * Sales Orders Router — CSV export procedure
 *
 * Mirrors `salesOrders.list` filters (branch scope, status, refund status,
 * date range) and the `cancelledSales.exportCsv` response contract:
 * { csv, truncated, totalMatching }. Kept in its own file to respect the
 * 400-LOC router CI cap on query.procedures.ts.
 */

import { inArray } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import { listSalesOrders } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../lib/context-helpers";
import { salesOrderStatusEnum, refundStatusEnum } from "./_shared";

const CSV_CHUNK = 500;
const CSV_MAX_ROWS = 10_000;

const CSV_HEADER =
	"sales_order_number,date,customer_name,customer_type,status,total_amount_cents,refund_status,branch_id,created_by,notes\n";

/** RFC-4180 escape: wrap in quotes when the value contains , " or newlines. */
function csvEscape(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "";
	const s = String(value);
	if (/[",\r\n]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

export const salesOrderExportProcedures = {
	/**
	 * Export the filtered sales-order list as CSV. Amounts stay in integer
	 * cents (schema convention) — no float formatting server-side.
	 */
	exportCsv: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				status: salesOrderStatusEnum.optional(),
				refundStatus: refundStatusEnum.optional(),
				customerId: z.string().optional(),
				from: z.string().datetime().optional(),
				to: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"read",
			);

			const filters = {
				branchId: input.branchId,
				status: input.status,
				refundStatus: input.refundStatus,
				customerId: input.customerId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds,
			};

			// Page through the same service the list procedure uses so RBAC scope
			// and subtree expansion behave identically to the on-screen list.
			type SalesOrderRow = Awaited<
				ReturnType<typeof listSalesOrders>
			>["rows"][number];
			const rows: SalesOrderRow[] = [];
			let totalMatching = 0;
			let truncated = false;
			let offset = 0;

			while (true) {
				const remaining = CSV_MAX_ROWS - rows.length;
				if (remaining <= 0) {
					truncated = true;
					break;
				}
				const chunkSize = Math.min(CSV_CHUNK, remaining);
				const page = await listSalesOrders(context.tenantDb, {
					...filters,
					limit: chunkSize,
					offset,
				});
				totalMatching = page.total;
				rows.push(...page.rows);
				offset += page.rows.length;
				if (page.rows.length < chunkSize) break; // last page
			}
			if (rows.length < totalMatching && rows.length >= CSV_MAX_ROWS) {
				truncated = true;
			}

			// Batch-resolve createdBy user ids → display names (one CP query).
			const createdByIds = [
				...new Set(rows.map((r) => r.createdBy).filter(Boolean)),
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

			let csvBody = "";
			for (const r of rows) {
				csvBody +=
					[
						csvEscape(r.salesOrderNumber),
						csvEscape(r.date ? r.date.toISOString() : ""),
						csvEscape(r.customerName),
						csvEscape(r.customerType),
						csvEscape(r.status),
						csvEscape(r.totalAmount),
						csvEscape(r.refundStatus ?? "none"),
						csvEscape(r.branchId),
						csvEscape(nameMap.get(r.createdBy) ?? r.createdBy),
						csvEscape(r.notes),
					].join(",") + "\n";
			}

			return { csv: CSV_HEADER + csvBody, truncated, totalMatching };
		}),
};
