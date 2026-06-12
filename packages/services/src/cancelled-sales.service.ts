import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CancelledSaleRow = {
	id: string;
	cancellationNumber: string | null;
	salesOrderId: string;
	cancellationDate: Date | null;
	cancelledAmount: number;
	cancellationReason: string | null;
	cancellationReasonCategory: string | null;
	cancelledBy: string | null;
	customerId: string | null;
	customerName: string;
	customerType: string;
	createdAt: Date;
	lineItems: LineItemRow[];
	repeatOffenderCount: number;
};

export type LineItemRow = {
	id: string;
	description: string;
	quantity: number;
	unitPrice: number;
	totalPrice: number;
	taxRateBps: number | null;
	taxRateCode: string | null;
};

export type ListCancelledSalesParams = {
	customerId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds?: string[];
	limit?: number;
	offset?: number;
	cursor?: { cancellationDate: Date; id: string } | null;
};

/**
 * List cancelled sales orders with line items and repeat-offender count.
 * Walk-in customers have NULL customerId — LEFT JOINs are used throughout to
 * avoid dropping walk-in rows (§6.4 of plan).
 */
export async function listCancelledSales(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: ListCancelledSalesParams = {},
): Promise<{ rows: CancelledSaleRow[]; total: number }> {
	const {
		customerId,
		from,
		to,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	if (accessibleNodeIds !== undefined && accessibleNodeIds.length === 0) {
		return { rows: [], total: 0 };
	}

	const conditions = [eq(salesOrders.status, "cancelled")];

	if (customerId) {
		conditions.push(eq(salesOrders.customerId, customerId));
	}
	if (from) {
		conditions.push(gte(salesOrders.cancellationDate, from));
	}
	if (to) {
		conditions.push(lte(salesOrders.cancellationDate, to));
	}
	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(salesOrders.branchId, accessibleNodeIds));
	}

	const where = and(...conditions);

	// Count query
	const [countResult] = await tenantDb
		.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
		.from(salesOrders)
		.where(where);

	const total = countResult?.total ?? 0;

	// Main rows
	const orderRows = await tenantDb
		.select()
		.from(salesOrders)
		.where(where)
		.orderBy(desc(salesOrders.cancellationDate), desc(salesOrders.id))
		.limit(limit)
		.offset(offset);

	if (orderRows.length === 0) {
		return { rows: [], total };
	}

	const orderIds = orderRows.map((r) => r.id);

	// Fetch all line items for these orders in one query (LEFT JOIN semantics via
	// separate query — avoids row explosion from cross-joining the correlated subquery).
	const itemRows = await tenantDb
		.select({
			salesOrderId: salesOrderItems.salesOrderId,
			id: salesOrderItems.id,
			description: salesOrderItems.description,
			quantity: salesOrderItems.quantity,
			unitPrice: salesOrderItems.unitPrice,
			totalPrice: salesOrderItems.totalPrice,
			taxRateBps: salesOrderItems.taxRateBps,
			taxRateCode: salesOrderItems.taxRateCode,
		})
		.from(salesOrderItems)
		.where(inArray(salesOrderItems.salesOrderId, orderIds));

	// Group line items by order
	const itemsByOrder = new Map<string, LineItemRow[]>();
	for (const item of itemRows) {
		const list = itemsByOrder.get(item.salesOrderId) ?? [];
		list.push({
			id: item.id,
			description: item.description,
			quantity: item.quantity,
			unitPrice: item.unitPrice,
			totalPrice: item.totalPrice,
			taxRateBps: item.taxRateBps ?? null,
			taxRateCode: item.taxRateCode ?? null,
		});
		itemsByOrder.set(item.salesOrderId, list);
	}

	// Compute repeat-offender count per row.
	// Correlated: COUNT of cancelled orders for same customer in last 30 days, capped at 99.
	// Walk-in customers have NULL customerId — their count is always 0 (no tracking across walk-ins).
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const customerIds = [
		...new Set(
			orderRows
				.map((r) => r.customerId)
				.filter((id): id is string => id !== null),
		),
	];

	const repeatCounts = new Map<string, number>();
	if (customerIds.length > 0) {
		const repeatRows = await tenantDb
			.select({
				customerId: salesOrders.customerId,
				cnt: sql<number>`LEAST(COUNT(*), 99)`.mapWith(Number),
			})
			.from(salesOrders)
			.where(
				and(
					eq(salesOrders.status, "cancelled"),
					inArray(salesOrders.customerId, customerIds),
					gte(salesOrders.createdAt, thirtyDaysAgo),
				),
			)
			.groupBy(salesOrders.customerId);

		for (const row of repeatRows) {
			if (row.customerId !== null) {
				repeatCounts.set(row.customerId, row.cnt);
			}
		}
	}

	const rows: CancelledSaleRow[] = orderRows.map((row) => ({
		id: row.id,
		cancellationNumber: row.cancellationNumber,
		salesOrderId: row.id,
		cancellationDate: row.cancellationDate,
		cancelledAmount: row.cancelledAmount ?? row.totalAmount,
		cancellationReason: row.cancellationReason,
		cancellationReasonCategory: row.cancellationReasonCategory ?? null,
		cancelledBy: row.cancelledBy,
		customerId: row.customerId,
		customerName: row.customerName,
		customerType: row.customerType,
		createdAt: row.createdAt,
		lineItems: itemsByOrder.get(row.id) ?? [],
		repeatOffenderCount:
			row.customerId !== null ? (repeatCounts.get(row.customerId) ?? 0) : 0,
	}));

	return { rows, total };
}

/**
 * Fetch a single cancelled sale by ID, scoped to the caller's accessible nodes.
 * Returns null if not found or out of scope.
 */
export async function getCancelledSaleById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	accessibleNodeIds?: string[],
): Promise<CancelledSaleRow | null> {
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length === 0) {
		return null;
	}

	const conditions = [
		eq(salesOrders.status, "cancelled"),
		eq(salesOrders.id, id),
	];
	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(salesOrders.branchId, accessibleNodeIds));
	}

	const rows = await tenantDb
		.select()
		.from(salesOrders)
		.where(and(...conditions))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	const itemRows = await tenantDb
		.select({
			salesOrderId: salesOrderItems.salesOrderId,
			id: salesOrderItems.id,
			description: salesOrderItems.description,
			quantity: salesOrderItems.quantity,
			unitPrice: salesOrderItems.unitPrice,
			totalPrice: salesOrderItems.totalPrice,
			taxRateBps: salesOrderItems.taxRateBps,
			taxRateCode: salesOrderItems.taxRateCode,
		})
		.from(salesOrderItems)
		.where(eq(salesOrderItems.salesOrderId, row.id));

	const lineItems: LineItemRow[] = itemRows.map((item) => ({
		id: item.id,
		description: item.description,
		quantity: item.quantity,
		unitPrice: item.unitPrice,
		totalPrice: item.totalPrice,
		taxRateBps: item.taxRateBps ?? null,
		taxRateCode: item.taxRateCode ?? null,
	}));

	// Repeat offender count
	let repeatOffenderCount = 0;
	if (row.customerId) {
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		const [repeatRow] = await tenantDb
			.select({ cnt: sql<number>`LEAST(COUNT(*), 99)`.mapWith(Number) })
			.from(salesOrders)
			.where(
				and(
					eq(salesOrders.status, "cancelled"),
					eq(salesOrders.customerId, row.customerId),
					gte(salesOrders.createdAt, thirtyDaysAgo),
				),
			);
		repeatOffenderCount = repeatRow?.cnt ?? 0;
	}

	return {
		id: row.id,
		cancellationNumber: row.cancellationNumber,
		salesOrderId: row.id,
		cancellationDate: row.cancellationDate,
		cancelledAmount: row.cancelledAmount ?? row.totalAmount,
		cancellationReason: row.cancellationReason,
		cancellationReasonCategory: row.cancellationReasonCategory ?? null,
		cancelledBy: row.cancelledBy,
		customerId: row.customerId,
		customerName: row.customerName,
		customerType: row.customerType,
		createdAt: row.createdAt,
		lineItems,
		repeatOffenderCount,
	};
}

export type CancelledSaleCsvRow = {
	id: string;
	cancellationNumber: string | null;
	cancellationDate: Date | null;
	customerName: string;
	customerType: string;
	customerId: string | null;
	cancelledAmount: number;
	cancellationReason: string | null;
	cancellationReasonCategory: string | null;
	cancelledBy: string | null;
	branchId: string;
	createdAt: Date;
};

export type ExportCancelledSalesCsvParams = {
	customerId?: string;
	from?: Date;
	to?: Date;
	accessibleNodeIds?: string[];
};

const CSV_CHUNK = 500;
const CSV_MAX_ROWS = 50_000;

function escapeCsvField(value: string | null | undefined): string {
	if (value == null) return "";
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

function rowToCsvLine(row: CancelledSaleCsvRow): string {
	return [
		escapeCsvField(row.id),
		escapeCsvField(row.cancellationNumber),
		escapeCsvField(row.cancellationDate?.toISOString() ?? null),
		escapeCsvField(row.customerName),
		escapeCsvField(row.customerType),
		escapeCsvField(row.customerId),
		escapeCsvField(String(row.cancelledAmount)),
		escapeCsvField(row.cancellationReason),
		escapeCsvField(row.cancellationReasonCategory),
		escapeCsvField(row.cancelledBy),
		escapeCsvField(row.branchId),
		escapeCsvField(row.createdAt.toISOString()),
	].join(",");
}

const CSV_HEADER =
	"id,cancellation_number,cancellation_date,customer_name,customer_type,customer_id,cancelled_amount_cents,cancellation_reason,cancellation_reason_category,cancelled_by,branch_id,created_at\n";

/**
 * Stream-build a CSV of cancelled sales up to CSV_MAX_ROWS rows.
 * Returns { csv: string; truncated: boolean }.
 * Caller is responsible for wrapping in a Response with text/csv.
 */
export async function exportCancelledSalesCsv(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: ExportCancelledSalesCsvParams,
): Promise<{ csv: string; truncated: boolean; totalMatching: number }> {
	const { customerId, from, to, accessibleNodeIds } = params;

	if (accessibleNodeIds !== undefined && accessibleNodeIds.length === 0) {
		return { csv: CSV_HEADER, truncated: false, totalMatching: 0 };
	}

	const conditions = [eq(salesOrders.status, "cancelled")];
	if (customerId) {
		conditions.push(eq(salesOrders.customerId, customerId));
	}
	if (from) {
		conditions.push(gte(salesOrders.cancellationDate, from));
	}
	if (to) {
		conditions.push(lte(salesOrders.cancellationDate, to));
	}
	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(salesOrders.branchId, accessibleNodeIds));
	}

	const where = and(...conditions);

	// Count total matching rows first (for the truncated metadata)
	const [countResult] = await tenantDb
		.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
		.from(salesOrders)
		.where(where);
	const totalMatching = countResult?.total ?? 0;

	let csvBody = "";
	let totalFetched = 0;
	let truncated = false;
	let cursorOffset = 0;

	while (true) {
		const remaining = CSV_MAX_ROWS - totalFetched;
		if (remaining <= 0) {
			truncated = true;
			break;
		}

		const chunkSize = Math.min(CSV_CHUNK, remaining);

		const chunk = await tenantDb
			.select({
				id: salesOrders.id,
				cancellationNumber: salesOrders.cancellationNumber,
				cancellationDate: salesOrders.cancellationDate,
				customerName: salesOrders.customerName,
				customerType: salesOrders.customerType,
				customerId: salesOrders.customerId,
				cancelledAmount: salesOrders.cancelledAmount,
				totalAmount: salesOrders.totalAmount,
				cancellationReason: salesOrders.cancellationReason,
				cancellationReasonCategory: salesOrders.cancellationReasonCategory,
				cancelledBy: salesOrders.cancelledBy,
				branchId: salesOrders.branchId,
				createdAt: salesOrders.createdAt,
			})
			.from(salesOrders)
			.where(where)
			.orderBy(desc(salesOrders.cancellationDate), desc(salesOrders.id))
			.limit(chunkSize)
			.offset(cursorOffset);

		if (chunk.length === 0) break;

		for (const row of chunk) {
			csvBody += rowToCsvLine({
				id: row.id,
				cancellationNumber: row.cancellationNumber,
				cancellationDate: row.cancellationDate,
				customerName: row.customerName,
				customerType: row.customerType,
				customerId: row.customerId,
				cancelledAmount: row.cancelledAmount ?? row.totalAmount,
				cancellationReason: row.cancellationReason,
				cancellationReasonCategory: row.cancellationReasonCategory ?? null,
				cancelledBy: row.cancelledBy,
				branchId: row.branchId,
				createdAt: row.createdAt,
			});
			csvBody += "\n";
		}

		totalFetched += chunk.length;
		cursorOffset += chunk.length;

		if (chunk.length < chunkSize) break; // Last page
	}

	return { csv: CSV_HEADER + csvBody, truncated, totalMatching };
}
