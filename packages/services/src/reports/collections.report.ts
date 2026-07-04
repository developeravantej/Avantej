/**
 * WS2 reports — Collections + AR domain.
 *
 * Report A (Collections): one row per money-received event, merged from TWO
 * sources — succeeded `payments` rows and manually-confirmed installment
 * receipts (`installments` paid by cash/manual_transfer, which never write a
 * payments row — see confirmInstallmentPayment).
 *
 * Report B (AR Aging): a POINT-IN-TIME snapshot of outstanding installment
 * debt, grouped by package. Deliberately ignores from/to (it is "as of now")
 * and taxBasis (outstanding is always the full contractual amount incl tax).
 *
 * Currency is ALWAYS derived from the branch (WS1 rule), never from
 * payments.currency (which carries a wrong 'usd' default).
 */

import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { services } from "@avantej-core/db/schema/tenant/services";

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
// Local helper: batch branch-id → display name (hierarchy leaf name).
// ---------------------------------------------------------------------------

async function fetchBranchNames(
	tenantDb: TenantDb,
	branchIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
	const distinct = [...new Set(branchIds.filter((b): b is string => !!b))];
	const map = new Map<string, string>();
	if (distinct.length === 0) return map;
	const rows = await tenantDb
		.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
		.from(hierarchyNodes)
		.where(inArray(hierarchyNodes.id, distinct));
	for (const r of rows) map.set(r.id, r.name);
	return map;
}

// ===========================================================================
// REPORT A — Collections
// ===========================================================================

export type CollectionsParams = ReportBaseParams & ReportPageParams;

export interface CollectionsRow {
	source: "payment" | "installment";
	/** Stable row key (payment id or installment id). */
	id: string;
	receivedAt: Date;
	reference: string;
	customerName: string | null;
	method: string | null;
	/** Pre-tax portion of the received money. Integer cents. */
	preTaxCents: number;
	/** Tax portion. Integer cents. */
	taxCents: number;
	/** Basis-adjusted figure (pre_tax = preTax; tax_inclusive = preTax+tax). */
	amountCents: number;
	/** Honest money-collected figure (payments.total_amount / installment paid). */
	collectedCents: number;
	currency: string;
	branchId: string | null;
	branchName: string | null;
	status: string;
}

/** Intermediate (pre-currency/name-enrichment) merge row. */
type MergeRow = Omit<CollectionsRow, "currency" | "branchName">;

/**
 * SOURCE 1 — succeeded payments.
 *
 * Branch has no column on payments; it is derived via the money's origin:
 *   invoice → sales_order, appointment, or package_instance → sales_order.
 * The package_instance join CAN fan out (a multi-item POS sale links several
 * package_instances to one payment_id), so we GROUP BY payments.id (the PK,
 * so all payment columns stay selectable) and collapse the derived branch /
 * customer via MIN(COALESCE(...)). The fanned rows share the same sales order,
 * so the MIN is deterministic.
 *
 * Fetches up to `fetchN` newest rows (offset always 0 — the merge slices).
 */
async function listSourcePayments(
	tenantDb: TenantDb,
	params: ReportBaseParams,
	branchIds: string[] | null,
	fetchN: number,
): Promise<{ rows: MergeRow[]; total: number }> {
	const inv = alias(invoices, "col_inv");
	const so1 = alias(salesOrders, "col_so1");
	const ap = alias(appointments, "col_ap");
	const pi = alias(packageInstances, "col_pi");
	const so2 = alias(salesOrders, "col_so2");

	const branchAgg = sql<
		string | null
	>`min(coalesce(${so1.branchId}, ${ap.branchId}, ${so2.branchId}))`;
	const customerAgg = sql<
		string | null
	>`min(coalesce(${inv.customerName}, ${ap.customerName}, ${pi.customerName}))`;

	const where = and(
		eq(payments.status, "succeeded"),
		gte(payments.createdAt, params.from),
		lte(payments.createdAt, params.to),
	);

	// Scoped callers filter on the derived (aggregate) branch — so this lives in
	// HAVING, not WHERE. Branchless rows (NULL branch) fail the IN and are hidden.
	const having = branchIds !== null ? inArray(branchAgg, branchIds) : sql`true`;

	const [countRows, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`count(*)::int` })
			.from(
				tenantDb
					.select({ id: payments.id })
					.from(payments)
					.leftJoin(inv, eq(inv.paymentId, payments.id))
					.leftJoin(so1, eq(inv.salesOrderId, so1.id))
					.leftJoin(ap, eq(payments.appointmentId, ap.id))
					.leftJoin(pi, eq(pi.paymentId, payments.id))
					.leftJoin(so2, eq(pi.salesOrderId, so2.id))
					.where(where)
					.groupBy(payments.id)
					.having(having)
					.as("col_pay_cnt"),
			),
		tenantDb
			.select({
				id: payments.id,
				paymentNumber: payments.paymentNumber,
				stripePaymentIntentId: payments.stripePaymentIntentId,
				method: payments.paymentMethod,
				amount: payments.amount,
				taxAmount: payments.taxAmount,
				totalAmount: payments.totalAmount,
				status: payments.status,
				receivedAt: payments.createdAt,
				branchId: branchAgg,
				customerName: customerAgg,
			})
			.from(payments)
			.leftJoin(inv, eq(inv.paymentId, payments.id))
			.leftJoin(so1, eq(inv.salesOrderId, so1.id))
			.leftJoin(ap, eq(payments.appointmentId, ap.id))
			.leftJoin(pi, eq(pi.paymentId, payments.id))
			.leftJoin(so2, eq(pi.salesOrderId, so2.id))
			.where(where)
			.groupBy(payments.id)
			.having(having)
			.orderBy(desc(payments.createdAt), desc(payments.id))
			.limit(fetchN)
			.offset(0),
	]);

	const total = countRows[0]?.total ?? 0;
	const rows: MergeRow[] = pageRows.map((r) => {
		const preTax = r.amount;
		const tax = r.taxAmount;
		return {
			source: "payment" as const,
			id: r.id,
			receivedAt: r.receivedAt,
			reference: r.paymentNumber ?? r.stripePaymentIntentId ?? r.id,
			customerName: r.customerName ?? null,
			method: r.method ?? null,
			preTaxCents: preTax,
			taxCents: tax,
			amountCents: params.taxBasis === "tax_inclusive" ? preTax + tax : preTax,
			// The honest collected figure = what was actually charged now.
			collectedCents: r.totalAmount,
			branchId: r.branchId ?? null,
			status: r.status,
		};
	});
	return { rows, total };
}

/**
 * SOURCE 2 — installment receipts collected AFTER the initial sale.
 *
 * No installment-payment path (manual confirm, Stripe payment-link webhook,
 * autocharge) ever writes a `payments` row — confirmInstallmentPayment only
 * UPDATEs the installment. So every installment #2..N — cash, manual_transfer,
 * card, fpx, AND Stripe alike — lives ONLY here. Capturing all of them is what
 * fixes the earlier undercount of card/fpx/Stripe installment collections.
 *
 * The ONE overlap with SOURCE 1: the POS/online down-payment. POS auto-confirms
 * installment #1 to 'paid' in the same txn (pos.service.ts) AND separately
 * inserts a succeeded `payments` row for that down-payment — which SOURCE 1
 * already counts. So we exclude exactly installment #1 rows whose package has a
 * succeeded down-payment `payments` row, and nothing else. (A cash-confirmed
 * installment #1 from the admin/web-create path writes NO payments row, so it
 * correctly stays here.)
 *
 * No fan-out: an installment has exactly one package_instance and at most one
 * sales_order, so a plain scoped WHERE suffices.
 */
async function listSourceInstallments(
	tenantDb: TenantDb,
	params: ReportBaseParams,
	branchIds: string[] | null,
	fetchN: number,
): Promise<{ rows: MergeRow[]; total: number }> {
	const pi = alias(packageInstances, "col_ins_pi");
	const soDirect = alias(salesOrders, "col_ins_so");
	const soPkg = alias(salesOrders, "col_ins_so2");
	// Down-payment payments row for this package (if any), used only to detect
	// the installment-#1 overlap with SOURCE 1.
	const dpPay = alias(payments, "col_ins_dp");
	const dpJoin = and(eq(dpPay.id, pi.paymentId), eq(dpPay.status, "succeeded"));

	const branchExpr = sql<
		string | null
	>`coalesce(${soDirect.branchId}, ${soPkg.branchId})`;

	const conditions = [
		eq(installments.status, "paid"),
		gte(installments.paidAt, params.from),
		lte(installments.paidAt, params.to),
		// Anti-overlap: drop ONLY the down-payment (installment #1 that already
		// has a succeeded payments row in SOURCE 1). NOT(#1 AND has-down-payment).
		or(ne(installments.installmentNumber, 1), isNull(dpPay.id)),
	];
	// Scoped callers: filter on the derived branch; branchless rows (NULL) fail
	// the IN and are hidden. Both branch columns exist pre-grouping, so WHERE is fine.
	if (branchIds !== null) {
		conditions.push(inArray(branchExpr, branchIds));
	}
	const where = and(...conditions);

	const [countRows, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`count(*)::int` })
			.from(installments)
			.innerJoin(pi, eq(installments.packageInstanceId, pi.id))
			.leftJoin(dpPay, dpJoin)
			.leftJoin(soDirect, eq(installments.salesOrderId, soDirect.id))
			.leftJoin(soPkg, eq(pi.salesOrderId, soPkg.id))
			.where(where),
		tenantDb
			.select({
				id: installments.id,
				installmentNumber: installments.installmentNumber,
				purchaseNumber: pi.purchaseNumber,
				method: installments.paymentMethod,
				amount: installments.amount,
				taxAmount: installments.taxAmount,
				amountPaid: installments.amountPaid,
				status: installments.status,
				receivedAt: installments.paidAt,
				customerName: pi.customerName,
				branchId: branchExpr,
			})
			.from(installments)
			.innerJoin(pi, eq(installments.packageInstanceId, pi.id))
			.leftJoin(dpPay, dpJoin)
			.leftJoin(soDirect, eq(installments.salesOrderId, soDirect.id))
			.leftJoin(soPkg, eq(pi.salesOrderId, soPkg.id))
			.where(where)
			.orderBy(desc(installments.paidAt), desc(installments.id))
			.limit(fetchN)
			.offset(0),
	]);

	const total = countRows[0]?.total ?? 0;
	const rows: MergeRow[] = pageRows.map((r) => {
		const preTax = r.amount;
		const tax = r.taxAmount ?? 0;
		const collected = r.amountPaid > 0 ? r.amountPaid : preTax + tax;
		return {
			source: "installment" as const,
			id: r.id,
			// status='paid' guarantees paid_at is set; epoch fallback keeps TS happy.
			receivedAt: r.receivedAt ?? new Date(0),
			reference: `${r.purchaseNumber ?? "—"}#${r.installmentNumber}`,
			customerName: r.customerName ?? null,
			method: r.method ?? null,
			preTaxCents: preTax,
			taxCents: tax,
			amountCents: params.taxBasis === "tax_inclusive" ? preTax + tax : preTax,
			collectedCents: collected,
			branchId: r.branchId ?? null,
			status: r.status,
		};
	});
	return { rows, total };
}

/**
 * List collections — merges the two sources.
 *
 * Pagination across two independently-sorted sources: fetch (offset+limit)
 * newest rows from EACH source, merge-sort desc, then slice [offset,
 * offset+limit). Any row in the true global top-(offset+limit) must also be in
 * its own source's top-(offset+limit), so the slice is exact. total = A + B.
 *
 * NOTE: this re-fetches (offset+limit) rows from each source per call — an
 * O(offset) cost. Acceptable for the 200-cap interactive pages; the CSV driver
 * pages in 500-row chunks up to the 50,000-row cap.
 */
export async function listCollections(
	tenantDb: TenantDb,
	params: CollectionsParams,
): Promise<ReportListResult<CollectionsRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const fetchN = params.offset + params.limit;

	const [srcPay, srcIns] = await Promise.all([
		listSourcePayments(tenantDb, params, branchIds, fetchN),
		listSourceInstallments(tenantDb, params, branchIds, fetchN),
	]);

	const merged = [...srcPay.rows, ...srcIns.rows].sort((a, b) => {
		const t = b.receivedAt.getTime() - a.receivedAt.getTime();
		if (t !== 0) return t;
		if (a.source !== b.source) return a.source < b.source ? -1 : 1;
		return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
	});

	const page = merged.slice(params.offset, params.offset + params.limit);

	// Enrich the sliced page only (currency + branch name).
	const branchIdList = page.map((r) => r.branchId);
	const [currencyMap, nameMap] = await Promise.all([
		buildBranchCurrencyMap(tenantDb, branchIdList),
		fetchBranchNames(tenantDb, branchIdList),
	]);

	const rows: CollectionsRow[] = page.map((r) => ({
		...r,
		currency: currencyForBranch(currencyMap, r.branchId),
		branchName: r.branchId ? (nameMap.get(r.branchId) ?? null) : null,
	}));

	return { rows, total: srcPay.total + srcIns.total };
}

export const COLLECTIONS_CSV_HEADERS = [
	"Date",
	"Source",
	"Reference",
	"Customer",
	"Method",
	"Amount",
	"Tax",
	"Collected",
	"Currency",
	"Branch",
	"Status",
] as const;

export async function exportCollectionsCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	return exportReportCsv(
		(page) => listCollections(tenantDb, { ...params, ...page }),
		COLLECTIONS_CSV_HEADERS,
		(row) => [
			row.receivedAt.toISOString(),
			row.source,
			row.reference,
			row.customerName ?? "",
			row.method ?? "",
			(row.amountCents / 100).toFixed(2),
			(row.taxCents / 100).toFixed(2),
			(row.collectedCents / 100).toFixed(2),
			row.currency,
			row.branchName ?? row.branchId ?? "",
			row.status,
		],
	);
}

// ===========================================================================
// REPORT B — Outstanding / AR Aging (point-in-time snapshot)
// ===========================================================================

export type AgingBucket = "current" | "0-30" | "31-60" | "61-90" | "90+";

const AGING_BUCKETS: AgingBucket[] = [
	"current",
	"0-30",
	"31-60",
	"61-90",
	"90+",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Aging bucket from the oldest unpaid due date relative to `now`. */
function agingBucket(oldestUnpaidDue: Date | null, now: Date): AgingBucket {
	if (!oldestUnpaidDue || oldestUnpaidDue.getTime() > now.getTime()) {
		return "current";
	}
	const daysOverdue = Math.floor(
		(now.getTime() - oldestUnpaidDue.getTime()) / MS_PER_DAY,
	);
	if (daysOverdue <= 30) return "0-30";
	if (daysOverdue <= 60) return "31-60";
	if (daysOverdue <= 90) return "61-90";
	return "90+";
}

export type ArAgingParams = ReportBaseParams & ReportPageParams;

export interface ArAgingRow {
	packageInstanceId: string;
	customerName: string | null;
	serviceName: string | null;
	purchaseNumber: string | null;
	/** pi.total_price (pre-tax contractual price). Integer cents. */
	totalPriceCents: number;
	/** pi.tax_amount. Integer cents. */
	taxAmountCents: number;
	/** SUM(amount_paid) across ALL of the package's installments. Integer cents. */
	paidSoFarCents: number;
	/** SUM(GREATEST(amount + tax - paid, 0)) over pending/overdue installments. */
	outstandingCents: number;
	unpaidCount: number;
	nextDueDate: Date | null;
	oldestUnpaidDue: Date | null;
	bucket: AgingBucket;
	branchId: string | null;
	branchName: string | null;
	currency: string;
	isLocked: boolean;
	paymentPlanType: string | null;
}

export type ArBucketTotals = Record<
	string,
	Record<AgingBucket, { count: number; outstandingCents: number }>
>;

export interface ArAgingResult extends ReportListResult<ArAgingRow> {
	/** Per-currency bucket rollup over the WHOLE filtered set (not the page). */
	bucketTotals: ArBucketTotals;
}

/**
 * Page of outstanding-AR rows, grouped per package.
 *
 * NOTE: from/to are IGNORED (AR is a point-in-time "as of now" snapshot) and
 * taxBasis is IGNORED (outstanding is always the full contractual amount incl
 * tax). Both are documented here and surfaced in the tab UI.
 */
export async function listArAgingPage(
	tenantDb: TenantDb,
	params: ArAgingParams,
): Promise<ReportListResult<ArAgingRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const now = new Date();

	const branchExpr = sql<
		string | null
	>`coalesce(${salesOrders.branchId}, ${services.branchId})`;
	const outstandingExpr = sql<number>`coalesce(sum(greatest(${installments.amount} + coalesce(${installments.taxAmount}, 0) - ${installments.amountPaid}, 0)), 0)::int`;
	const oldestDueExpr = sql`min(${installments.dueDate})`.mapWith(
		installments.dueDate,
	);
	const nextDueExpr =
		sql`min(${installments.dueDate}) filter (where ${installments.dueDate} >= now())`.mapWith(
			installments.dueDate,
		);
	const unpaidCountExpr = sql<number>`count(${installments.id})::int`;

	const conditions = [
		ne(packageInstances.status, "cancelled"),
		ne(packageInstances.paymentStatus, "refunded"),
	];
	if (branchIds !== null) {
		conditions.push(inArray(branchExpr, branchIds));
	}
	const where = and(...conditions);

	const [countRows, pageRows] = await Promise.all([
		tenantDb.select({ total: sql<number>`count(*)::int` }).from(
			tenantDb
				.select({ id: packageInstances.id })
				.from(packageInstances)
				.innerJoin(
					installments,
					and(
						eq(installments.packageInstanceId, packageInstances.id),
						inArray(installments.status, ["pending", "overdue"]),
					),
				)
				.leftJoin(
					salesOrders,
					eq(packageInstances.salesOrderId, salesOrders.id),
				)
				.leftJoin(services, eq(packageInstances.serviceId, services.id))
				.where(where)
				.groupBy(packageInstances.id)
				.as("ar_cnt"),
		),
		tenantDb
			.select({
				packageInstanceId: packageInstances.id,
				customerName: packageInstances.customerName,
				serviceName: services.name,
				purchaseNumber: packageInstances.purchaseNumber,
				totalPrice: packageInstances.totalPrice,
				taxAmount: packageInstances.taxAmount,
				isLocked: packageInstances.isLocked,
				paymentPlanType: packageInstances.paymentPlanType,
				pkgNextDueDate: packageInstances.nextDueDate,
				branchId: branchExpr,
				outstandingCents: outstandingExpr,
				oldestUnpaidDue: oldestDueExpr,
				nextDueFiltered: nextDueExpr,
				unpaidCount: unpaidCountExpr,
			})
			.from(packageInstances)
			.innerJoin(
				installments,
				and(
					eq(installments.packageInstanceId, packageInstances.id),
					inArray(installments.status, ["pending", "overdue"]),
				),
			)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.where(where)
			.groupBy(
				packageInstances.id,
				services.name,
				services.branchId,
				salesOrders.branchId,
			)
			// AR aging convention: oldest debt first (most overdue on top). This is a
			// deliberate departure from the generic newest-first sort.
			.orderBy(asc(oldestDueExpr), asc(packageInstances.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countRows[0]?.total ?? 0;

	// paidSoFar spans ALL installments (not just pending/overdue), so it comes
	// from a separate aggregate keyed by the page's package ids.
	const pkgIds = pageRows.map((r) => r.packageInstanceId);
	const paidMap = new Map<string, number>();
	if (pkgIds.length > 0) {
		const paidRows = await tenantDb
			.select({
				pkgId: installments.packageInstanceId,
				paid: sql<number>`coalesce(sum(${installments.amountPaid}), 0)::int`,
			})
			.from(installments)
			.where(inArray(installments.packageInstanceId, pkgIds))
			.groupBy(installments.packageInstanceId);
		for (const p of paidRows) paidMap.set(p.pkgId, p.paid);
	}

	const branchIdList = pageRows.map((r) => r.branchId);
	const [currencyMap, nameMap] = await Promise.all([
		buildBranchCurrencyMap(tenantDb, branchIdList),
		fetchBranchNames(tenantDb, branchIdList),
	]);

	const rows: ArAgingRow[] = pageRows.map((r) => {
		const oldest = (r.oldestUnpaidDue as Date | null) ?? null;
		const nextFiltered = (r.nextDueFiltered as Date | null) ?? null;
		return {
			packageInstanceId: r.packageInstanceId,
			customerName: r.customerName ?? null,
			serviceName: r.serviceName ?? null,
			purchaseNumber: r.purchaseNumber ?? null,
			totalPriceCents: r.totalPrice ?? 0,
			taxAmountCents: r.taxAmount ?? 0,
			paidSoFarCents: paidMap.get(r.packageInstanceId) ?? 0,
			outstandingCents: r.outstandingCents,
			unpaidCount: r.unpaidCount,
			nextDueDate: nextFiltered ?? r.pkgNextDueDate ?? null,
			oldestUnpaidDue: oldest,
			bucket: agingBucket(oldest, now),
			branchId: r.branchId ?? null,
			branchName: r.branchId ? (nameMap.get(r.branchId) ?? null) : null,
			currency: currencyForBranch(currencyMap, r.branchId),
			isLocked: r.isLocked,
			paymentPlanType: r.paymentPlanType ?? null,
		};
	});

	return { rows, total };
}

/**
 * Per-currency bucket rollup over the WHOLE filtered set (all packages, no
 * paging). Currency can't be derived in SQL (branch_details / country map lives
 * in currency.service), so we aggregate per-package in SQL then bucket + bucket
 * by currency in JS.
 */
async function computeArBucketTotals(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ArBucketTotals> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const now = new Date();

	const branchExpr = sql<
		string | null
	>`coalesce(${salesOrders.branchId}, ${services.branchId})`;
	const outstandingExpr = sql<number>`coalesce(sum(greatest(${installments.amount} + coalesce(${installments.taxAmount}, 0) - ${installments.amountPaid}, 0)), 0)::int`;
	const oldestDueExpr = sql`min(${installments.dueDate})`.mapWith(
		installments.dueDate,
	);

	const conditions = [
		ne(packageInstances.status, "cancelled"),
		ne(packageInstances.paymentStatus, "refunded"),
	];
	if (branchIds !== null) {
		conditions.push(inArray(branchExpr, branchIds));
	}

	const perPkg = await tenantDb
		.select({
			branchId: branchExpr,
			outstandingCents: outstandingExpr,
			oldestUnpaidDue: oldestDueExpr,
		})
		.from(packageInstances)
		.innerJoin(
			installments,
			and(
				eq(installments.packageInstanceId, packageInstances.id),
				inArray(installments.status, ["pending", "overdue"]),
			),
		)
		.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
		.leftJoin(services, eq(packageInstances.serviceId, services.id))
		.where(and(...conditions))
		.groupBy(packageInstances.id, services.branchId, salesOrders.branchId);

	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		perPkg.map((p) => p.branchId),
	);

	const totals: ArBucketTotals = {};
	const emptyBuckets = (): Record<
		AgingBucket,
		{ count: number; outstandingCents: number }
	> => {
		const r = {} as Record<
			AgingBucket,
			{ count: number; outstandingCents: number }
		>;
		for (const b of AGING_BUCKETS) r[b] = { count: 0, outstandingCents: 0 };
		return r;
	};

	for (const p of perPkg) {
		const currency = currencyForBranch(currencyMap, p.branchId);
		const bucket = agingBucket((p.oldestUnpaidDue as Date | null) ?? null, now);
		if (!totals[currency]) totals[currency] = emptyBuckets();
		totals[currency][bucket].count += 1;
		totals[currency][bucket].outstandingCents += p.outstandingCents;
	}

	return totals;
}

export async function listArAging(
	tenantDb: TenantDb,
	params: ArAgingParams,
): Promise<ArAgingResult> {
	const [page, bucketTotals] = await Promise.all([
		listArAgingPage(tenantDb, params),
		computeArBucketTotals(tenantDb, params),
	]);
	return { rows: page.rows, total: page.total, bucketTotals };
}

export const AR_AGING_CSV_HEADERS = [
	"Customer",
	"Package",
	"Purchase #",
	"Total",
	"Paid",
	"Outstanding",
	"Unpaid Installments",
	"Oldest Due",
	"Next Due",
	"Bucket",
	"Currency",
	"Branch",
	"Plan",
	"Locked",
] as const;

export async function exportArAgingCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	// CSV reuses the page fetch only (bucketTotals is a UI summary, not a row).
	return exportReportCsv(
		(page) => listArAgingPage(tenantDb, { ...params, ...page }),
		AR_AGING_CSV_HEADERS,
		(row) => [
			row.customerName ?? "",
			row.serviceName ?? "",
			row.purchaseNumber ?? "",
			((row.totalPriceCents + row.taxAmountCents) / 100).toFixed(2),
			(row.paidSoFarCents / 100).toFixed(2),
			(row.outstandingCents / 100).toFixed(2),
			row.unpaidCount,
			row.oldestUnpaidDue ? row.oldestUnpaidDue.toISOString() : "",
			row.nextDueDate ? row.nextDueDate.toISOString() : "",
			row.bucket,
			row.currency,
			row.branchName ?? row.branchId ?? "",
			row.paymentPlanType ?? "",
			row.isLocked,
		],
	);
}
