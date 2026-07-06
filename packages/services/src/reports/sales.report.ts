/**
 * WS2 reports — Sales domain.
 *
 * Report A (Sales / Revenue): one row per sales_order_items line on a
 * confirmed/completed order dated inside the window.
 * Report B (Sales Mix): item-identity aggregation of the same base set,
 * grouped by item+currency, with new-vs-returning order counts.
 *
 * Tax semantics: sales_order_items.unit_price/total_price are PRE-TAX;
 * tax_rate_bps is the per-line snapshot. Amounts are adjusted through
 * amountForBasis/taxFromBps (tax is ADDED ON TOP — see pos.service.ts).
 */

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";

import {
	amountForBasis,
	buildBranchCurrencyMap,
	currencyForBranch,
	exportReportCsv,
	REPORT_CSV_MAX_ROWS,
	resolveReportBranchIds,
	taxFromBps,
	type ReportBaseParams,
	type ReportCsvResult,
	type ReportListResult,
	type ReportPageParams,
	type TenantDb,
} from "./_shared";

/** Revenue-bearing order statuses — cancelled/draft never count. */
const SALES_STATUSES = ["confirmed", "completed"];

export type SalesReportParams = ReportBaseParams & ReportPageParams;

function baseWhere(params: ReportBaseParams, branchIds: string[] | null) {
	const conditions = [
		inArray(salesOrders.status, SALES_STATUSES),
		gte(salesOrders.date, params.from),
		lte(salesOrders.date, params.to),
	];
	// sales_orders.branch_id is NOT NULL, so no branchless-row handling needed.
	if (branchIds !== null) {
		conditions.push(inArray(salesOrders.branchId, branchIds));
	}
	return and(...conditions);
}

// ---------------------------------------------------------------------------
// Report A — Sales (Revenue), grain = one sales_order_items row
// ---------------------------------------------------------------------------

export interface SalesReportRow {
	itemId: string;
	salesOrderId: string;
	orderDate: Date;
	salesOrderNumber: string;
	customerName: string;
	customerType: string;
	itemDescription: string;
	quantity: number;
	/** Adjusted by taxBasis. Integer cents. */
	unitPriceCents: number;
	/** Adjusted by taxBasis. Integer cents. */
	lineTotalCents: number;
	/** Tax on the pre-tax line total (bps snapshot). Integer cents. */
	taxCents: number;
	branchId: string;
	branchName: string | null;
	currency: string;
	/** Cross-DB userId of the closer (sales_orders.sold_by); router enriches name. */
	soldByUserId: string | null;
	/** Cross-DB userId of the lead source; router enriches name. */
	leadSourceUserId: string | null;
	isComplimentary: boolean;
	refundStatus: string;
	commissionExcluded: boolean;
}

export async function listSalesReport(
	tenantDb: TenantDb,
	params: SalesReportParams,
): Promise<ReportListResult<SalesReportRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const where = baseWhere(params, branchIds);

	const [countResult, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(salesOrderItems)
			.innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
			.where(where),
		tenantDb
			.select({
				itemId: salesOrderItems.id,
				salesOrderId: salesOrders.id,
				orderDate: salesOrders.date,
				salesOrderNumber: salesOrders.salesOrderNumber,
				customerName: salesOrders.customerName,
				customerType: salesOrders.customerType,
				itemDescription: salesOrderItems.description,
				quantity: salesOrderItems.quantity,
				unitPrice: salesOrderItems.unitPrice,
				totalPrice: salesOrderItems.totalPrice,
				taxRateBps: salesOrderItems.taxRateBps,
				branchId: salesOrders.branchId,
				branchName: hierarchyNodes.name,
				soldByUserId: salesOrders.soldBy,
				leadSourceUserId: salesOrders.leadSourceUserId,
				isComplimentary: salesOrders.isComplimentary,
				refundStatus: salesOrders.refundStatus,
				commissionExcluded: salesOrderItems.commissionExcluded,
			})
			.from(salesOrderItems)
			.innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
			.leftJoin(hierarchyNodes, eq(salesOrders.branchId, hierarchyNodes.id))
			.where(where)
			.orderBy(
				desc(salesOrders.date),
				desc(salesOrders.id),
				desc(salesOrderItems.id),
			)
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countResult[0]?.total ?? 0;

	// WS1 rule: currency always derived from the branch, never stored defaults.
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		pageRows.map((r) => r.branchId),
	);

	const rows: SalesReportRow[] = pageRows.map((r) => ({
		itemId: r.itemId,
		salesOrderId: r.salesOrderId,
		orderDate: r.orderDate,
		salesOrderNumber: r.salesOrderNumber,
		customerName: r.customerName,
		customerType: r.customerType,
		itemDescription: r.itemDescription,
		quantity: r.quantity,
		unitPriceCents: amountForBasis(r.unitPrice, r.taxRateBps, params.taxBasis),
		lineTotalCents: amountForBasis(r.totalPrice, r.taxRateBps, params.taxBasis),
		taxCents: taxFromBps(r.totalPrice, r.taxRateBps),
		branchId: r.branchId,
		branchName: r.branchName ?? null,
		currency: currencyForBranch(currencyMap, r.branchId),
		soldByUserId: r.soldByUserId,
		leadSourceUserId: r.leadSourceUserId,
		isComplimentary: r.isComplimentary,
		refundStatus: r.refundStatus,
		commissionExcluded: r.commissionExcluded,
	}));

	return { rows, total };
}

export const SALES_REPORT_CSV_HEADERS = [
	"Date",
	"Order #",
	"Customer",
	"Type",
	"Item",
	"Qty",
	"Unit Price",
	"Line Total",
	"Tax",
	"Currency",
	"Branch",
	"Sold By",
	"Lead Source",
	"Complimentary",
	"Refund Status",
] as const;

/**
 * Cross-DB name lookup supplied by the router layer (control-panel users).
 * The services layer never touches the control-panel DB directly.
 */
export type UserNameResolver = (
	userIds: string[],
) => Promise<Map<string, string>>;

export async function exportSalesReportCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
	resolveUserNames?: UserNameResolver,
): Promise<ReportCsvResult> {
	type CsvRow = SalesReportRow & {
		soldByName: string | null;
		leadSourceName: string | null;
	};

	const fetchPage = async (
		page: ReportPageParams,
	): Promise<ReportListResult<CsvRow>> => {
		const { rows, total } = await listSalesReport(tenantDb, {
			...params,
			...page,
		});
		let names = new Map<string, string>();
		if (resolveUserNames) {
			const ids = [
				...new Set(
					rows
						.flatMap((r) => [r.soldByUserId, r.leadSourceUserId])
						.filter((id): id is string => !!id),
				),
			];
			if (ids.length > 0) names = await resolveUserNames(ids);
		}
		return {
			rows: rows.map((r) => ({
				...r,
				soldByName: r.soldByUserId ? (names.get(r.soldByUserId) ?? null) : null,
				leadSourceName: r.leadSourceUserId
					? (names.get(r.leadSourceUserId) ?? null)
					: null,
			})),
			total,
		};
	};

	return exportReportCsv(fetchPage, SALES_REPORT_CSV_HEADERS, (row) => [
		row.orderDate.toISOString(),
		row.salesOrderNumber,
		row.customerName,
		row.customerType,
		row.itemDescription,
		row.quantity,
		(row.unitPriceCents / 100).toFixed(2),
		(row.lineTotalCents / 100).toFixed(2),
		(row.taxCents / 100).toFixed(2),
		row.currency,
		row.branchName ?? row.branchId,
		row.soldByName ?? row.soldByUserId ?? "",
		row.leadSourceName ?? row.leadSourceUserId ?? "",
		row.isComplimentary,
		row.refundStatus,
	]);
}

// ---------------------------------------------------------------------------
// Report B — Sales Mix, grain = item identity × currency
// ---------------------------------------------------------------------------

export type SalesMixKind = "service" | "product" | "custom";

export interface SalesMixRow {
	/** Stable group key: kind + identity + currency. */
	itemKey: string;
	/** Representative description (MIN(description) within the group). */
	itemDescription: string;
	kind: SalesMixKind;
	currency: string;
	unitsSold: number;
	orderCount: number;
	grossPreTaxCents: number;
	taxCents: number;
	/** grossPreTaxCents adjusted by taxBasis. Integer cents. */
	grossCents: number;
	/** Share of grossCents within the same currency bucket (0–100). */
	shareOfRevenuePct: number;
	/** Orders whose customer's first-ever order date falls inside [from, to]. */
	newCustomerOrders: number;
	/** Includes orders with NULL customer_id (walk-ins are never "new"). */
	returningCustomerOrders: number;
}

export interface SalesMixResult extends ReportListResult<SalesMixRow> {
	/** True when the flat per-line fetch hit the 50,000-line cap. */
	truncated: boolean;
}

interface MixGroup {
	itemKey: string;
	itemDescription: string;
	kind: SalesMixKind;
	currency: string;
	unitsSold: number;
	grossPreTaxCents: number;
	taxCents: number;
	orderIds: Set<string>;
	newOrderIds: Set<string>;
	returningOrderIds: Set<string>;
}

export async function listSalesMix(
	tenantDb: TenantDb,
	params: SalesReportParams,
): Promise<SalesMixResult> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const where = baseWhere(params, branchIds);

	// Flat per-line fetch — mix cardinality is small, so aggregating in JS
	// keeps the currency + new/returning logic simple. Capped at 50k lines.
	const lines = await tenantDb
		.select({
			serviceId: salesOrderItems.serviceId,
			productId: salesOrderItems.productId,
			description: salesOrderItems.description,
			quantity: salesOrderItems.quantity,
			totalPrice: salesOrderItems.totalPrice,
			taxRateBps: salesOrderItems.taxRateBps,
			orderId: salesOrders.id,
			customerId: salesOrders.customerId,
			branchId: salesOrders.branchId,
		})
		.from(salesOrderItems)
		.innerJoin(salesOrders, eq(salesOrderItems.salesOrderId, salesOrders.id))
		.where(where)
		.limit(REPORT_CSV_MAX_ROWS + 1);

	const truncated = lines.length > REPORT_CSV_MAX_ROWS;
	const bounded = truncated ? lines.slice(0, REPORT_CSV_MAX_ROWS) : lines;

	// Per-line currency derived from the order's branch BEFORE aggregating.
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		bounded.map((l) => l.branchId),
	);

	// New-vs-returning: each customer's first-ever revenue-bearing order date,
	// org-wide (deliberately NOT branch- or date-filtered).
	const customerIds = [
		...new Set(
			bounded.map((l) => l.customerId).filter((id): id is string => !!id),
		),
	];
	const firstOrderDates = new Map<string, Date>();
	if (customerIds.length > 0) {
		const firsts = await tenantDb
			.select({
				customerId: salesOrders.customerId,
				firstDate: sql`MIN(${salesOrders.date})`.mapWith(salesOrders.date),
			})
			.from(salesOrders)
			.where(
				and(
					inArray(salesOrders.status, SALES_STATUSES),
					inArray(salesOrders.customerId, customerIds),
				),
			)
			.groupBy(salesOrders.customerId);
		for (const f of firsts) {
			if (f.customerId && f.firstDate) {
				firstOrderDates.set(f.customerId, f.firstDate);
			}
		}
	}
	const isNewOrder = (customerId: string | null): boolean => {
		// NULL customer (walk-in) counts as returning by convention.
		if (!customerId) return false;
		const first = firstOrderDates.get(customerId);
		return !!first && first >= params.from && first <= params.to;
	};

	const groups = new Map<string, MixGroup>();
	for (const line of bounded) {
		const kind: SalesMixKind = line.serviceId
			? "service"
			: line.productId
				? "product"
				: "custom";
		const identity = line.serviceId ?? line.productId ?? line.description;
		const currency = currencyForBranch(currencyMap, line.branchId);
		const key = `${kind}:${identity}:${currency}`;
		let group = groups.get(key);
		if (!group) {
			group = {
				itemKey: key,
				itemDescription: line.description,
				kind,
				currency,
				unitsSold: 0,
				grossPreTaxCents: 0,
				taxCents: 0,
				orderIds: new Set(),
				newOrderIds: new Set(),
				returningOrderIds: new Set(),
			};
			groups.set(key, group);
		}
		// Deterministic representative description (MIN(description)).
		if (line.description < group.itemDescription) {
			group.itemDescription = line.description;
		}
		group.unitsSold += line.quantity;
		group.grossPreTaxCents += line.totalPrice;
		group.taxCents += taxFromBps(line.totalPrice, line.taxRateBps);
		group.orderIds.add(line.orderId);
		if (isNewOrder(line.customerId)) {
			group.newOrderIds.add(line.orderId);
		} else {
			group.returningOrderIds.add(line.orderId);
		}
	}

	// Per-line floor(tax) summed == sum of amountForBasis per line, so the
	// basis-adjusted gross is exactly grossPreTax + tax.
	const grossOf = (g: MixGroup): number =>
		params.taxBasis === "tax_inclusive"
			? g.grossPreTaxCents + g.taxCents
			: g.grossPreTaxCents;

	// Share denominators per currency — never co-mingle currencies.
	const currencyTotals = new Map<string, number>();
	for (const g of groups.values()) {
		currencyTotals.set(
			g.currency,
			(currencyTotals.get(g.currency) ?? 0) + grossOf(g),
		);
	}

	const allRows: SalesMixRow[] = [...groups.values()]
		.map((g) => {
			const gross = grossOf(g);
			const denom = currencyTotals.get(g.currency) ?? 0;
			return {
				itemKey: g.itemKey,
				itemDescription: g.itemDescription,
				kind: g.kind,
				currency: g.currency,
				unitsSold: g.unitsSold,
				orderCount: g.orderIds.size,
				grossPreTaxCents: g.grossPreTaxCents,
				taxCents: g.taxCents,
				grossCents: gross,
				shareOfRevenuePct:
					denom > 0 ? Math.round((gross / denom) * 10000) / 100 : 0,
				newCustomerOrders: g.newOrderIds.size,
				returningCustomerOrders: g.returningOrderIds.size,
			};
		})
		.sort(
			(a, b) =>
				b.grossCents - a.grossCents ||
				a.itemDescription.localeCompare(b.itemDescription),
		);

	return {
		rows: allRows.slice(params.offset, params.offset + params.limit),
		total: allRows.length,
		truncated,
	};
}

export const SALES_MIX_CSV_HEADERS = [
	"Item",
	"Kind",
	"Units",
	"Orders",
	"Revenue",
	"Currency",
	"Share %",
	"New-Customer Orders",
	"Returning Orders",
] as const;

export async function exportSalesMixCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		(page) => listSalesMix(tenantDb, { ...params, ...page }),
		SALES_MIX_CSV_HEADERS,
		(row) => [
			row.itemDescription,
			row.kind,
			row.unitsSold,
			row.orderCount,
			(row.grossCents / 100).toFixed(2),
			row.currency,
			row.shareOfRevenuePct,
			row.newCustomerOrders,
			row.returningCustomerOrders,
		],
	);
}
