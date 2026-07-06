/**
 * WS2 reports — ACTIVITY domain.
 *
 * Report A: Refunds & Cancellations — one row per affected sales order.
 *   Broader than the cancelled-sales page: covers status='cancelled' OR
 *   refund_status != 'none' (refund-only orders included).
 * Report B: Customer Redemptions — credit_point_ledger rows with delta < 0.
 *
 * Both follow the _shared contract: resolveReportBranchIds first, currency
 * always derived from branch (WS1 rule), money stays integer cents in rows.
 */

import { creditPointLedger } from "@avantej-core/db/schema/tenant/credit-point-ledger";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { and, desc, eq, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";

import {
	buildBranchCurrencyMap,
	currencyForBranch,
	exportReportCsv,
	resolveReportBranchIds,
	type ReportBaseParams,
	type ReportCsvResult,
	type ReportListResult,
	type ReportPageParams,
	type TenantDb,
} from "./_shared";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Router-supplied cross-DB resolver: control-panel user ids → display names.
 * Users live in the control-panel DB, which services must not reach directly;
 * the router builds this closure over its controlPanelDb handle.
 */
export type UserNameResolver = (
	userIds: string[],
) => Promise<Map<string, string>>;

/** Batch branch-id → branch display name (page-scoped, tenant-side). */
async function fetchBranchNames(
	tenantDb: TenantDb,
	branchIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
	const distinct = [...new Set(branchIds.filter((b): b is string => !!b))];
	if (distinct.length === 0) return new Map();
	const rows = await tenantDb
		.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(inArray(hierarchyNodes.id, distinct));
	return new Map(rows.map((r) => [r.id, r.name]));
}

/** CSV money cell: integer cents → "12.34" (Currency is its own column). */
function csvMoney(cents: number): string {
	return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Report A — Refunds & Cancellations
// ---------------------------------------------------------------------------

export type RefundCancellationKind = "cancelled" | "refund" | "both";

export interface RefundCancellationRow {
	salesOrderId: string;
	/** COALESCE(cancellation_date, updated_at). */
	eventDate: Date;
	kind: RefundCancellationKind;
	salesOrderNumber: string;
	cancellationNumber: string | null;
	customerName: string;
	customerType: string;
	/** total_amount is PRE-TAX; tax_inclusive basis adds per-line snapshot tax. */
	originalTotalCents: number;
	cancelledAmountCents: number;
	refundedAmountCents: number;
	refundStatus: string;
	reasonCategory: string | null;
	reason: string | null;
	cancelledByUserId: string | null;
	/** Enriched in the ROUTER (cross-DB users lookup); null from this layer. */
	cancelledByName: string | null;
	branchId: string;
	branchName: string | null;
	currency: string;
}

export async function listRefundsCancellations(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
): Promise<ReportListResult<RefundCancellationRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);

	const eventDate = sql<Date>`COALESCE(${salesOrders.cancellationDate}, ${salesOrders.updatedAt})`;

	const conditions = [
		or(
			eq(salesOrders.status, "cancelled"),
			ne(salesOrders.refundStatus, "none"),
		),
		gte(eventDate, params.from),
		lte(eventDate, params.to),
	];
	// sales_orders.branch_id is NOT NULL — no branchless case for this report.
	if (branchIds !== null) {
		conditions.push(inArray(salesOrders.branchId, branchIds));
	}
	const where = and(...conditions);

	const [countResult, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(salesOrders)
			.where(where),
		tenantDb
			.select({
				id: salesOrders.id,
				salesOrderNumber: salesOrders.salesOrderNumber,
				status: salesOrders.status,
				refundStatus: salesOrders.refundStatus,
				cancellationNumber: salesOrders.cancellationNumber,
				cancellationDate: salesOrders.cancellationDate,
				updatedAt: salesOrders.updatedAt,
				customerName: salesOrders.customerName,
				customerType: salesOrders.customerType,
				totalAmount: salesOrders.totalAmount,
				cancelledAmount: salesOrders.cancelledAmount,
				refundedAmountCents: salesOrders.refundedAmountCents,
				cancellationReason: salesOrders.cancellationReason,
				cancellationReasonCategory: salesOrders.cancellationReasonCategory,
				cancelledBy: salesOrders.cancelledBy,
				branchId: salesOrders.branchId,
			})
			.from(salesOrders)
			.where(where)
			.orderBy(desc(eventDate), desc(salesOrders.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countResult[0]?.total ?? 0;
	if (pageRows.length === 0) return { rows: [], total };

	// tax_inclusive basis: order totals are stored PRE-TAX, so derive tax from
	// the per-line snapshots — SUM(floor(total_price * tax_rate_bps / 10000)) —
	// in one grouped query over the page's order ids (matches taxFromBps).
	const taxByOrder = new Map<string, number>();
	if (params.taxBasis === "tax_inclusive") {
		const orderIds = pageRows.map((r) => r.id);
		const taxRows = await tenantDb
			.select({
				salesOrderId: salesOrderItems.salesOrderId,
				taxCents:
					sql<number>`COALESCE(SUM(FLOOR((${salesOrderItems.totalPrice}::numeric * COALESCE(${salesOrderItems.taxRateBps}, 0)) / 10000)), 0)`.mapWith(
						Number,
					),
			})
			.from(salesOrderItems)
			.where(inArray(salesOrderItems.salesOrderId, orderIds))
			.groupBy(salesOrderItems.salesOrderId);
		for (const r of taxRows) taxByOrder.set(r.salesOrderId, r.taxCents);
	}

	const [branchNames, currencyMap] = await Promise.all([
		fetchBranchNames(
			tenantDb,
			pageRows.map((r) => r.branchId),
		),
		buildBranchCurrencyMap(
			tenantDb,
			pageRows.map((r) => r.branchId),
		),
	]);

	const rows: RefundCancellationRow[] = pageRows.map((row) => {
		const cancelled = row.status === "cancelled";
		const refunded = row.refundStatus !== "none";
		return {
			salesOrderId: row.id,
			eventDate: row.cancellationDate ?? row.updatedAt,
			kind: cancelled && refunded ? "both" : cancelled ? "cancelled" : "refund",
			salesOrderNumber: row.salesOrderNumber,
			cancellationNumber: row.cancellationNumber,
			customerName: row.customerName,
			customerType: row.customerType,
			originalTotalCents: row.totalAmount + (taxByOrder.get(row.id) ?? 0),
			// cancelledAmount is the stored cancellation snapshot (falls back to
			// the order total, mirroring cancelled-sales.service); refund-only
			// rows have nothing cancelled.
			cancelledAmountCents: cancelled
				? (row.cancelledAmount ?? row.totalAmount)
				: 0,
			refundedAmountCents: row.refundedAmountCents,
			refundStatus: row.refundStatus,
			reasonCategory: row.cancellationReasonCategory ?? null,
			reason: row.cancellationReason,
			cancelledByUserId: row.cancelledBy,
			cancelledByName: null,
			branchId: row.branchId,
			branchName: branchNames.get(row.branchId) ?? null,
			currency: currencyForBranch(currencyMap, row.branchId),
		};
	});

	return { rows, total };
}

const REFUNDS_CSV_HEADERS = [
	"Date",
	"Kind",
	"Order #",
	"Cancellation #",
	"Customer",
	"Original Total",
	"Cancelled Amt",
	"Refunded Amt",
	"Refund Status",
	"Reason Category",
	"Reason",
	"Cancelled By",
	"Currency",
	"Branch",
] as const;

export async function exportRefundsCancellationsCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
	resolveUserNames?: UserNameResolver,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		async (page) => {
			const result = await listRefundsCancellations(tenantDb, {
				...params,
				...page,
			});
			if (!resolveUserNames || result.rows.length === 0) return result;
			const ids = [
				...new Set(
					result.rows
						.map((r) => r.cancelledByUserId)
						.filter((id): id is string => !!id),
				),
			];
			const names =
				ids.length > 0
					? await resolveUserNames(ids)
					: new Map<string, string>();
			return {
				total: result.total,
				rows: result.rows.map((r) => ({
					...r,
					cancelledByName: r.cancelledByUserId
						? (names.get(r.cancelledByUserId) ?? null)
						: null,
				})),
			};
		},
		REFUNDS_CSV_HEADERS,
		(row) => [
			row.eventDate,
			row.kind,
			row.salesOrderNumber,
			row.cancellationNumber,
			row.customerName,
			csvMoney(row.originalTotalCents),
			csvMoney(row.cancelledAmountCents),
			csvMoney(row.refundedAmountCents),
			row.refundStatus,
			row.reasonCategory,
			row.reason,
			row.cancelledByName ?? row.cancelledByUserId,
			row.currency,
			row.branchName,
		],
	);
}

// ---------------------------------------------------------------------------
// Report B — Customer Redemptions (loyalty credit points)
// ---------------------------------------------------------------------------

export interface RedemptionRow {
	id: string;
	date: Date;
	customerUserId: string;
	/** Enriched in the ROUTER (cross-DB users lookup); null from this layer. */
	customerName: string | null;
	pointsRedeemed: number;
	/** 1 point == 1 cent — pos.service.ts:484 (`creditDiscountCents = creditPointsRedeemed`). */
	valueCents: number;
	balanceAfter: number;
	reason: string;
	sourceType: string | null;
	salesOrderNumber: string | null;
	branchId: string | null;
	branchName: string | null;
	currency: string;
}

export async function listRedemptions(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
): Promise<ReportListResult<RedemptionRow>> {
	// taxBasis is intentionally N/A here: credit points are a PRE-TAX discount
	// (they reduce the taxable base at sale time — pos.service.ts Step 4b), so
	// there is no tax dimension on a redemption row.
	const branchIds = await resolveReportBranchIds(tenantDb, params);

	// Branch attribution is WEAK: only pos_redemption ledger rows resolve to a
	// sales order (and therefore a branch). Everything else is branchless.
	const joinOn = and(
		eq(creditPointLedger.sourceType, "pos_redemption"),
		eq(creditPointLedger.sourceId, salesOrders.id),
	);

	const conditions = [
		lt(creditPointLedger.delta, 0),
		gte(creditPointLedger.createdAt, params.from),
		lte(creditPointLedger.createdAt, params.to),
	];
	// Scoped callers must never see branchless rows (fail closed): inArray on
	// the LEFT-JOINed column drops NULL branch ids. Unscoped (null) includes all.
	if (branchIds !== null) {
		conditions.push(inArray(salesOrders.branchId, branchIds));
	}
	const where = and(...conditions);

	const [countResult, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(creditPointLedger)
			.leftJoin(salesOrders, joinOn)
			.where(where),
		tenantDb
			.select({
				id: creditPointLedger.id,
				createdAt: creditPointLedger.createdAt,
				customerUserId: creditPointLedger.customerUserId,
				delta: creditPointLedger.delta,
				balanceAfter: creditPointLedger.balanceAfter,
				reason: creditPointLedger.reason,
				sourceType: creditPointLedger.sourceType,
				salesOrderNumber: salesOrders.salesOrderNumber,
				branchId: salesOrders.branchId,
			})
			.from(creditPointLedger)
			.leftJoin(salesOrders, joinOn)
			.where(where)
			.orderBy(desc(creditPointLedger.createdAt), desc(creditPointLedger.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countResult[0]?.total ?? 0;
	if (pageRows.length === 0) return { rows: [], total };

	const [branchNames, currencyMap] = await Promise.all([
		fetchBranchNames(
			tenantDb,
			pageRows.map((r) => r.branchId),
		),
		buildBranchCurrencyMap(
			tenantDb,
			pageRows.map((r) => r.branchId),
		),
	]);

	const rows: RedemptionRow[] = pageRows.map((row) => ({
		id: row.id,
		date: row.createdAt,
		customerUserId: row.customerUserId,
		customerName: null,
		pointsRedeemed: -row.delta,
		// 1 point == 1 cent, verified at pos.service.ts:484
		// (`creditDiscountCents = creditPointsRedeemed; // 1 point == 1 cent`).
		valueCents: -row.delta,
		balanceAfter: row.balanceAfter,
		reason: row.reason,
		sourceType: row.sourceType,
		salesOrderNumber: row.salesOrderNumber ?? null,
		branchId: row.branchId ?? null,
		branchName: row.branchId ? (branchNames.get(row.branchId) ?? null) : null,
		// DEFAULT_CURRENCY when branchless (currencyForBranch handles null).
		currency: currencyForBranch(currencyMap, row.branchId),
	}));

	return { rows, total };
}

const REDEMPTIONS_CSV_HEADERS = [
	"Date",
	"Customer",
	"Points",
	"Value",
	"Balance After",
	"Reason",
	"Source",
	"Order #",
	"Currency",
	"Branch",
] as const;

export async function exportRedemptionsCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
	resolveUserNames?: UserNameResolver,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		async (page) => {
			const result = await listRedemptions(tenantDb, { ...params, ...page });
			if (!resolveUserNames || result.rows.length === 0) return result;
			const ids = [...new Set(result.rows.map((r) => r.customerUserId))];
			const names = await resolveUserNames(ids);
			return {
				total: result.total,
				rows: result.rows.map((r) => ({
					...r,
					customerName: names.get(r.customerUserId) ?? null,
				})),
			};
		},
		REDEMPTIONS_CSV_HEADERS,
		(row) => [
			row.date,
			row.customerName ?? row.customerUserId,
			row.pointsRedeemed,
			csvMoney(row.valueCents),
			row.balanceAfter,
			row.reason,
			row.sourceType,
			row.salesOrderNumber,
			row.currency,
			row.branchName,
		],
	);
}
