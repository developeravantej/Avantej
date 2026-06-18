import {
	eq,
	and,
	desc,
	count,
	gte,
	lte,
	sql,
	inArray,
	or,
	lt,
	ne,
} from "drizzle-orm";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrderStatusHistory } from "@avantej-core/db/schema/tenant/sales-order-status-history";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { writeAudit } from "./audit-log.service";
import { voidCommissionSplitsForSalesOrder } from "./commission-splits.service";
import { appendSalesOrderStatusHistory } from "./status-history.helper";

export const CANCELLATION_REASON_CATEGORIES = [
	"customer_changed_mind",
	"payment_failed",
	"wrong_item",
	"fraud_suspected",
	"system_error",
	"other",
] as const;
export type CancellationReasonCategory =
	(typeof CANCELLATION_REASON_CATEGORIES)[number];

export const SALES_ORDER_REFUND_STATUSES = [
	"none",
	"pending",
	"partial",
	"processed",
] as const;
export type SalesOrderRefundStatus =
	(typeof SALES_ORDER_REFUND_STATUSES)[number];

export type CreateSalesOrderParams = {
	date: Date;
	customerId?: string;
	customerName: string;
	createdBy: string;
	branchId: string;
	status?: "draft" | "confirmed" | "completed" | "cancelled";
	totalAmount: number;
	notes?: string;
};

export type UpdateSalesOrderParams = Partial<
	Omit<CreateSalesOrderParams, "createdBy" | "branchId">
>;

function formatDateYYYYMMDD(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}${m}${d}`;
}

async function generateSalesOrderNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	_date: Date,
): Promise<string> {
	// BE-M8: Use the dedicated sequence (created in migration 0026_pipeline_audit.sql)
	// instead of COUNT()+1 to prevent duplicate order numbers under concurrent inserts.
	const result = await tenantDb.execute(
		sql`SELECT nextval('tenant_sales_order_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: unknown }).seq);
	return `SO-${String(seq).padStart(6, "0")}`;
}

async function generateCancellationNumber(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	date: Date,
): Promise<string> {
	// BE-M8: Use the dedicated sequence (created in migration 0080) instead of
	// COUNT()+1 to prevent duplicate cancellation numbers under concurrent
	// cancellations, mirroring generateSalesOrderNumber above.
	const datePart = formatDateYYYYMMDD(date);
	const prefix = `CAN-${datePart}-`;

	const result = await tenantDb.execute(
		sql`SELECT nextval('tenant_cancellation_seq') AS seq`,
	);
	const seq = Number((result.rows[0] as { seq: unknown }).seq);
	return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface ListSalesOrdersResult {
	rows: (typeof salesOrders.$inferSelect)[];
	total: number;
}

export async function listSalesOrders(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		branchId?: string;
		status?: string;
		refundStatus?: SalesOrderRefundStatus;
		customerId?: string;
		from?: Date;
		to?: Date;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
): Promise<ListSalesOrdersResult> {
	const {
		branchId,
		status,
		refundStatus,
		customerId,
		from,
		to,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	// Early exit if RBAC scope is empty — user has no accessible nodes
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length === 0) {
		return { rows: [], total: 0 };
	}

	// Validate branchId is within the caller's accessible scope
	if (branchId && accessibleNodeIds && !accessibleNodeIds.includes(branchId)) {
		throw new Error("FORBIDDEN: branch not in accessible scope");
	}

	const conditions = [];
	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(salesOrders.branchId, accessibleNodeIds));
	}
	if (branchId) {
		conditions.push(eq(salesOrders.branchId, branchId));
	}
	if (status) {
		conditions.push(eq(salesOrders.status, status));
	}
	if (refundStatus) {
		conditions.push(eq(salesOrders.refundStatus, refundStatus));
	}
	if (customerId) {
		conditions.push(eq(salesOrders.customerId, customerId));
	}
	if (from) {
		conditions.push(gte(salesOrders.date, from));
	}
	if (to) {
		conditions.push(lte(salesOrders.date, to));
	}

	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const [countResult, rows] = await Promise.all([
		tenantDb.select({ total: count() }).from(salesOrders).where(where),
		tenantDb
			.select()
			.from(salesOrders)
			.where(where)
			.orderBy(desc(salesOrders.date), desc(salesOrders.id))
			.limit(limit)
			.offset(offset),
	]);

	return {
		rows,
		total: countResult[0]?.total ?? 0,
	};
}

export async function getSalesOrderById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
): Promise<typeof salesOrders.$inferSelect | null> {
	const row = await tenantDb.query.salesOrders.findFirst({
		where: eq(salesOrders.id, id),
	});
	return row ?? null;
}

export async function createSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateSalesOrderParams,
): Promise<typeof salesOrders.$inferSelect> {
	const salesOrderNumber = await generateSalesOrderNumber(
		tenantDb,
		params.date,
	);

	const [row] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber,
			date: params.date,
			customerId: params.customerId ?? null,
			customerName: params.customerName,
			createdBy: params.createdBy,
			branchId: params.branchId,
			status: params.status ?? "draft",
			totalAmount: params.totalAmount,
			notes: params.notes ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create sales order");
	}
	return row;
}

export async function updateSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateSalesOrderParams,
	actor?: { userId: string; reason?: string; notes?: string },
): Promise<typeof salesOrders.$inferSelect> {
	// Capture previous status for history if status is changing.
	let previousStatus: string | null = null;
	if (params.status !== undefined) {
		const [existing] = await tenantDb
			.select({ status: salesOrders.status })
			.from(salesOrders)
			.where(eq(salesOrders.id, id));
		previousStatus = existing?.status ?? null;
	}

	const [row] = await tenantDb
		.update(salesOrders)
		.set({
			...(params.date !== undefined && { date: params.date }),
			...(params.customerId !== undefined && { customerId: params.customerId }),
			...(params.customerName !== undefined && {
				customerName: params.customerName,
			}),
			...(params.status !== undefined && { status: params.status }),
			...(params.totalAmount !== undefined && {
				totalAmount: params.totalAmount,
			}),
			...(params.notes !== undefined && { notes: params.notes }),
			updatedAt: new Date(),
		})
		.where(eq(salesOrders.id, id))
		.returning();

	if (!row) {
		throw new Error("Sales order not found");
	}

	// Append status history if status actually changed.
	if (params.status !== undefined && params.status !== previousStatus) {
		await appendSalesOrderStatusHistory(tenantDb, id, {
			fromStatus: previousStatus,
			toStatus: params.status,
			changedBy: actor?.userId ?? "system",
			reason: actor?.reason,
			notes: actor?.notes,
		});
	}
	return row;
}

export async function cancelSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: {
		cancelledBy: string;
		reason?: string;
		refundAmount: number;
		cancellationReasonCategory?: CancellationReasonCategory;
	},
	actor: { userId: string; memberId: string; role: string },
): Promise<typeof salesOrders.$inferSelect> {
	const existing = await getSalesOrderById(tenantDb, id);
	if (!existing) {
		throw new Error("Sales order not found");
	}

	if (params.refundAmount < 0 || params.refundAmount > existing.totalAmount) {
		throw new Error(
			`refundAmount ${params.refundAmount} is out of range (order total: ${existing.totalAmount})`,
		);
	}

	const now = new Date();
	// An order never gets two cancellation numbers: reuse the existing one if this
	// order already has it set, and only mint a fresh sequence value when null.
	const cancellationNumber =
		existing.cancellationNumber ??
		(await generateCancellationNumber(tenantDb, now));

	return tenantDb
		.transaction(async (tx) => {
			const [updatedOrder] = await tx
				.update(salesOrders)
				.set({
					status: "cancelled",
					cancellationNumber,
					cancellationDate: now,
					cancellationReason: params.reason ?? null,
					cancellationReasonCategory: params.cancellationReasonCategory ?? null,
					cancelledBy: params.cancelledBy,
					cancelledAmount: params.refundAmount,
					updatedAt: now,
				})
				.where(eq(salesOrders.id, id))
				.returning();

			if (!updatedOrder) {
				throw new Error("Failed to cancel sales order");
			}

			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "sale.cancel",
				entityType: "sales_order",
				entityId: id,
				branchId: existing.branchId,
				summary: `Cancelled sales order ${existing.salesOrderNumber ?? id}`,
				changes: {
					refundAmount: params.refundAmount,
					reason: params.reason ?? null,
				},
			});

			await voidCommissionSplitsForSalesOrder(
				tx as unknown as NeonDatabase<typeof tenantSchema>,
				id,
				"Sale cancelled: " + (params.reason ?? "no reason given"),
				actor,
			);

			// Status history: same tx as the status mutation
			await appendSalesOrderStatusHistory(tx, id, {
				fromStatus: existing.status,
				toStatus: "cancelled",
				changedBy: params.cancelledBy,
				reason: params.reason ?? null,
			});

			// Cancel any package instances created from this sales order (F-POS-03)
			await tx
				.update(packageInstances)
				.set({
					status: "cancelled",
					cancellationReason: "Sale cancelled",
					updatedAt: now,
				})
				.where(
					and(
						eq(packageInstances.salesOrderId, id),
						ne(packageInstances.status, "cancelled"),
					),
				);

			return updatedOrder;
		})
		.then(async (result) => {
			// Branch stats cache: revenue retracts on cancellation. Fire-and-forget
			// (debounced; coalesces with other writes in the same 2s window).
			try {
				const branchStatsCache = await import("./branch-stats-cache.service");
				branchStatsCache.refresh(tenantDb, existing.branchId, "revenue");
			} catch (err) {
				console.warn(
					JSON.stringify({
						event: "branch_stats_refresh_failed",
						branchId: existing.branchId,
						error: err instanceof Error ? err.message : String(err),
					}),
				);
			}
			return result;
		});
}

// ---------------------------------------------------------------------------
// KPI Summary
// ---------------------------------------------------------------------------

export type KpiPeriod = "today" | "week" | "month" | { from: Date; to: Date };

export type SalesOrderKpiSummary = {
	// New fields
	totalSalesCents: number;
	totalRefundedCents: number;
	outstandingCents: number;
	salesCount: number;
	period: KpiPeriod;
	// Legacy fields — kept for backwards compatibility
	confirmedCount: number;
	cancelledCount: number;
	completedCount: number;
	totalRevenueCents: number;
	totalTaxCents: number;
	totalNetCents: number;
};

function resolvePeriodDates(period: KpiPeriod): { from: Date; to: Date } {
	const now = new Date();
	if (period === "today") {
		const from = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
		);
		const to = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
		);
		return { from, to };
	}
	if (period === "week") {
		// ISO week: Monday-based; fall back to rolling 7 days
		const day = now.getUTCDay(); // 0=Sun
		const mondayOffset = day === 0 ? -6 : 1 - day;
		const from = new Date(
			Date.UTC(
				now.getUTCFullYear(),
				now.getUTCMonth(),
				now.getUTCDate() + mondayOffset,
			),
		);
		const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
		return { from, to };
	}
	if (period === "month") {
		const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
		const to = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
		);
		return { from, to };
	}
	return { from: period.from, to: period.to };
}

export async function getSalesOrderKpiSummary(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		period?: KpiPeriod;
		branchId?: string;
		accessibleNodeIds?: string[];
	},
): Promise<SalesOrderKpiSummary> {
	const period = params.period ?? "month";
	const { from: periodStart, to: periodEnd } = resolvePeriodDates(period);

	const effectiveBranchIds: string[] | null = (() => {
		if (!params.branchId) return null;
		if (!params.accessibleNodeIds?.length) return [params.branchId];
		if (params.accessibleNodeIds.includes(params.branchId))
			return [params.branchId];
		return [];
	})();

	const zero: SalesOrderKpiSummary = {
		totalSalesCents: 0,
		totalRefundedCents: 0,
		outstandingCents: 0,
		salesCount: 0,
		period,
		confirmedCount: 0,
		cancelledCount: 0,
		completedCount: 0,
		totalRevenueCents: 0,
		totalTaxCents: 0,
		totalNetCents: 0,
	};

	if (effectiveBranchIds !== null && effectiveBranchIds.length === 0)
		return zero;
	if (
		params.accessibleNodeIds !== undefined &&
		params.accessibleNodeIds.length === 0
	)
		return zero;

	const orderConditions = [
		gte(salesOrders.date, periodStart),
		lte(salesOrders.date, periodEnd),
	];
	if (effectiveBranchIds !== null) {
		orderConditions.push(inArray(salesOrders.branchId, effectiveBranchIds));
	} else if (params.accessibleNodeIds?.length) {
		orderConditions.push(
			inArray(salesOrders.branchId, params.accessibleNodeIds),
		);
	}

	const { salesOrderItems: soiTable } = await import(
		"@avantej-core/db/schema/tenant/sales-order-items"
	);

	const [kpi] = await tenantDb
		.select({
			confirmedCount:
				sql<number>`COUNT(DISTINCT ${salesOrders.id}) FILTER (WHERE ${salesOrders.status} = 'confirmed')`.mapWith(
					Number,
				),
			cancelledCount:
				sql<number>`COUNT(DISTINCT ${salesOrders.id}) FILTER (WHERE ${salesOrders.status} = 'cancelled')`.mapWith(
					Number,
				),
			completedCount:
				sql<number>`COUNT(DISTINCT ${salesOrders.id}) FILTER (WHERE ${salesOrders.status} = 'completed')`.mapWith(
					Number,
				),
			totalRevenueCents:
				sql<number>`COALESCE(SUM(${salesOrders.totalAmount}) FILTER (WHERE ${salesOrders.status} = 'confirmed'), 0)`.mapWith(
					Number,
				),
			totalTaxCents:
				sql<number>`COALESCE(SUM(FLOOR(${soiTable.totalPrice}::numeric * COALESCE(${soiTable.taxRateBps}, 0) / 10000.0)) FILTER (WHERE ${salesOrders.status} = 'confirmed'), 0)`.mapWith(
					Number,
				),
			// New KPI fields
			totalSalesCents:
				sql<number>`COALESCE(SUM(${salesOrders.totalAmount}) FILTER (WHERE ${salesOrders.status} != 'cancelled' AND ${salesOrders.status} != 'draft'), 0)`.mapWith(
					Number,
				),
			salesCount:
				sql<number>`COUNT(DISTINCT ${salesOrders.id}) FILTER (WHERE ${salesOrders.status} != 'cancelled' AND ${salesOrders.status} != 'draft')`.mapWith(
					Number,
				),
			totalRefundedCents:
				sql<number>`COALESCE(SUM(${salesOrders.refundedAmountCents}), 0)`.mapWith(
					Number,
				),
		})
		.from(salesOrders)
		.leftJoin(soiTable, eq(soiTable.salesOrderId, salesOrders.id))
		.where(and(...orderConditions));

	// outstandingCents: sum of payment items with status pending/overdue for orders in period.
	// We store this inline rather than joining invoices — use refundStatus != 'processed'
	// as a lightweight proxy (orders with partial/pending refund = outstanding balance).
	// A more precise query would join payment_items; for now surface it as a derived metric.
	const outstandingCents = 0; // Placeholder: requires payment_items join wired by payment router

	const confirmedCount = kpi?.confirmedCount ?? 0;
	const cancelledCount = kpi?.cancelledCount ?? 0;
	const completedCount = kpi?.completedCount ?? 0;
	const totalRevenueCents = kpi?.totalRevenueCents ?? 0;
	const totalTaxCents = kpi?.totalTaxCents ?? 0;
	const totalNetCents = totalRevenueCents + totalTaxCents;

	return {
		totalSalesCents: kpi?.totalSalesCents ?? 0,
		totalRefundedCents: kpi?.totalRefundedCents ?? 0,
		outstandingCents,
		salesCount: kpi?.salesCount ?? 0,
		period,
		confirmedCount,
		cancelledCount,
		completedCount,
		totalRevenueCents,
		totalTaxCents,
		totalNetCents,
	};
}

// ---------------------------------------------------------------------------
// Largest sale today
// ---------------------------------------------------------------------------

export async function getLargestSaleToday(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		branchId?: string;
		accessibleNodeIds?: string[];
	},
): Promise<typeof salesOrders.$inferSelect | null> {
	if (
		params.accessibleNodeIds !== undefined &&
		params.accessibleNodeIds.length === 0
	) {
		return null;
	}

	const now = new Date();
	const todayStart = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

	const conditions = [
		gte(salesOrders.date, todayStart),
		lte(salesOrders.date, todayEnd),
		sql`${salesOrders.status} != 'cancelled'`,
	];

	if (params.branchId) {
		// Validate scope
		if (
			params.accessibleNodeIds &&
			!params.accessibleNodeIds.includes(params.branchId)
		) {
			return null;
		}
		conditions.push(eq(salesOrders.branchId, params.branchId));
	} else if (params.accessibleNodeIds?.length) {
		conditions.push(inArray(salesOrders.branchId, params.accessibleNodeIds));
	}

	const rows = await tenantDb
		.select()
		.from(salesOrders)
		.where(and(...conditions))
		.orderBy(desc(salesOrders.totalAmount))
		.limit(1);

	return rows[0] ?? null;
}

export type StatusHistoryQueryOpts = {
	parsedCursor: { changedAt: Date; id: string } | null;
	limit: number;
};

// ---------------------------------------------------------------------------
// Latest completed order (POS "Last Receipt Preview" seed)
// ---------------------------------------------------------------------------

export type LatestCompletedSalesOrder = {
	order: typeof salesOrders.$inferSelect;
	items: (typeof salesOrderItems.$inferSelect)[];
	/** paymentMethod from payments table — null when no invoice/payment row exists */
	paymentMethod: string | null;
};

/**
 * Returns the most recent completed sales order for the given scope, together
 * with its line items and payment method. Returns null when none exists.
 *
 * Scope rules mirror listSalesOrders:
 *  - If accessibleNodeIds is an empty array, return null (caller has no scope).
 *  - If branchId is provided, it must be within accessibleNodeIds.
 */
export async function getLatestCompletedSalesOrder(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: {
		branchId?: string;
		accessibleNodeIds?: string[];
	} = {},
): Promise<LatestCompletedSalesOrder | null> {
	const { branchId, accessibleNodeIds } = params;

	// RBAC: no accessible nodes → no data
	if (accessibleNodeIds !== undefined && accessibleNodeIds.length === 0) {
		return null;
	}

	// Validate branchId is within scope
	if (branchId && accessibleNodeIds && !accessibleNodeIds.includes(branchId)) {
		return null;
	}

	const conditions = [eq(salesOrders.status, "completed")];

	if (branchId) {
		conditions.push(eq(salesOrders.branchId, branchId));
	} else if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(salesOrders.branchId, accessibleNodeIds));
	}

	const rows = await tenantDb
		.select()
		.from(salesOrders)
		.where(and(...conditions))
		.orderBy(desc(salesOrders.createdAt), desc(salesOrders.id))
		.limit(1);

	const order = rows[0];
	if (!order) return null;

	// Fetch line items
	const items = await tenantDb
		.select()
		.from(salesOrderItems)
		.where(eq(salesOrderItems.salesOrderId, order.id));

	// Resolve paymentMethod via invoices → payments (best-effort, no throw)
	let paymentMethod: string | null = null;
	try {
		const invoiceRows = await tenantDb
			.select({ paymentId: invoices.paymentId })
			.from(invoices)
			.where(eq(invoices.salesOrderId, order.id))
			.limit(1);

		const paymentId = invoiceRows[0]?.paymentId ?? null;
		if (paymentId) {
			const paymentRows = await tenantDb
				.select({ paymentMethod: payments.paymentMethod })
				.from(payments)
				.where(eq(payments.id, paymentId))
				.limit(1);
			paymentMethod = paymentRows[0]?.paymentMethod ?? null;
		}
	} catch {
		// best-effort: leave paymentMethod as null
	}

	return { order, items, paymentMethod };
}

export async function getSalesOrderStatusHistory(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	salesOrderId: string,
	{ parsedCursor, limit }: StatusHistoryQueryOpts,
) {
	return tenantDb
		.select()
		.from(salesOrderStatusHistory)
		.where(
			and(
				eq(salesOrderStatusHistory.salesOrderId, salesOrderId),
				parsedCursor
					? or(
							lt(salesOrderStatusHistory.changedAt, parsedCursor.changedAt),
							and(
								eq(salesOrderStatusHistory.changedAt, parsedCursor.changedAt),
								lt(salesOrderStatusHistory.id, parsedCursor.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(
			desc(salesOrderStatusHistory.changedAt),
			desc(salesOrderStatusHistory.id),
		)
		.limit(limit + 1);
}
