/**
 * WS2 reports — PACKAGES domain (credits liability).
 *
 * Report A — Expiring Credits: active packages with remaining credits whose
 *   expiry falls inside the requested window (from/to filter EXPIRY DATE,
 *   not created_at).
 * Report B — Services Owed: point-in-time delivery-liability snapshot of all
 *   active/frozen packages with undelivered credits (from/to are IGNORED).
 *
 * Branch derivation: package_instances has NO branch column. branchId =
 * COALESCE(sales_orders.branch_id, services.branch_id); services.branch_id is
 * nullable (org-wide service) so a row can be branchless. Scoped callers
 * (branchIds !== null) hide branchless rows — inArray(NULL, ...) is never
 * true, so the filter fails closed by construction. Org-wide callers
 * (branchIds === null) include them.
 *
 * Tax: package_instances stores an absolute tax_amount snapshot (cents), not
 * bps — the tax_inclusive basis adds a proportional tax_amount share instead
 * of using taxFromBps.
 */

import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	lte,
	ne,
	sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { memberProfiles } from "@avantej-core/db/schema/tenant/member-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
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
	type TaxBasis,
	type TenantDb,
} from "./_shared";

// ---------------------------------------------------------------------------
// Shared query pieces
// ---------------------------------------------------------------------------

/** COALESCE(sales_orders.branch_id, services.branch_id) — may be NULL. */
const pkgBranchId = sql<
	string | null
>`COALESCE(${salesOrders.branchId}, ${services.branchId})`;

const MS_PER_DAY = 86_400_000;

/**
 * Value of the undelivered credits (cents). Pre-tax by default; the
 * tax_inclusive basis adds a proportional share of the tax_amount snapshot.
 */
function packageValueCents(
	row: {
		creditsTotal: number;
		creditsRemaining: number;
		totalPrice: number | null;
		taxAmount: number | null;
	},
	basis: TaxBasis,
): number | null {
	if (row.creditsTotal <= 0 || row.totalPrice == null) return null;
	const gross =
		basis === "tax_inclusive"
			? row.totalPrice + (row.taxAmount ?? 0)
			: row.totalPrice;
	return Math.round((row.creditsRemaining * gross) / row.creditsTotal);
}

/** SQL twin of packageValueCents — used only for ORDER BY / SUM aggregates. */
function packageValueExpr(basis: TaxBasis): SQL<string | null> {
	const gross =
		basis === "tax_inclusive"
			? sql`(${packageInstances.totalPrice} + COALESCE(${packageInstances.taxAmount}, 0))`
			: sql`${packageInstances.totalPrice}`;
	return sql<
		string | null
	>`CASE WHEN ${packageInstances.creditsTotal} > 0 AND ${packageInstances.totalPrice} IS NOT NULL THEN ROUND((${packageInstances.creditsRemaining}::numeric * ${gross}) / ${packageInstances.creditsTotal}) ELSE NULL END`;
}

const pageSelection = {
	id: packageInstances.id,
	customerName: packageInstances.customerName,
	serviceName: services.name,
	purchaseNumber: packageInstances.purchaseNumber,
	status: packageInstances.status,
	creditsTotal: packageInstances.creditsTotal,
	creditsUsed: packageInstances.creditsUsed,
	creditsRemaining: packageInstances.creditsRemaining,
	totalPrice: packageInstances.totalPrice,
	taxAmount: packageInstances.taxAmount,
	startsAt: packageInstances.startsAt,
	expiresAt: packageInstances.expiresAt,
	frozenUntil: packageInstances.frozenUntil,
	paymentStatus: packageInstances.paymentStatus,
	branchId: pkgBranchId,
	branchName: hierarchyNodes.name,
	// Trainer display name, tenant-local join (analytics getStaffPerformance
	// pattern): package_instances.assigned_trainer_id = members.id →
	// member_profiles.display_name. Null-safe throughout.
	trainerName: memberProfiles.displayName,
};

// ---------------------------------------------------------------------------
// Report A — Expiring Credits
// ---------------------------------------------------------------------------

export interface ExpiringCreditRow {
	id: string;
	customerName: string | null;
	serviceName: string | null;
	purchaseNumber: string | null;
	creditsTotal: number;
	creditsUsed: number;
	creditsRemaining: number;
	/** Value of remaining credits (cents, basis-adjusted); null when unpriced. */
	remainingValueCents: number | null;
	expiresAt: Date;
	/** Whole days until expiry vs now; negative when already expired. */
	daysLeft: number;
	frozenUntil: Date | null;
	paymentStatus: string;
	trainerName: string | null;
	branchId: string | null;
	branchName: string | null;
	currency: string;
}

function expiringCreditsWhere(
	params: ReportBaseParams,
	branchIds: string[] | null,
): SQL | undefined {
	const conditions: (SQL | undefined)[] = [
		eq(packageInstances.status, "active"),
		gt(packageInstances.creditsRemaining, 0),
		// The date range is the EXPIRY window — never created_at.
		gte(packageInstances.expiresAt, params.from),
		lte(packageInstances.expiresAt, params.to),
		ne(packageInstances.paymentStatus, "refunded"),
	];
	if (branchIds !== null) {
		// Fail closed: branchless rows (NULL coalesce) never match inArray.
		conditions.push(inArray(pkgBranchId, branchIds));
	}
	return and(...conditions);
}

async function fetchExpiringCreditsPage(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
	branchIds: string[] | null,
): Promise<ReportListResult<ExpiringCreditRow>> {
	const where = expiringCreditsWhere(params, branchIds);

	const [countRows, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(packageInstances)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.where(where),
		tenantDb
			.select(pageSelection)
			.from(packageInstances)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.leftJoin(hierarchyNodes, eq(hierarchyNodes.id, pkgBranchId))
			.leftJoin(members, eq(packageInstances.assignedTrainerId, members.id))
			.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
			.where(where)
			.orderBy(asc(packageInstances.expiresAt), asc(packageInstances.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countRows[0]?.total ?? 0;
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		pageRows.map((r) => r.branchId),
	);
	const now = Date.now();

	const rows: ExpiringCreditRow[] = pageRows.map((r) => ({
		id: r.id,
		customerName: r.customerName,
		serviceName: r.serviceName,
		purchaseNumber: r.purchaseNumber,
		creditsTotal: r.creditsTotal,
		creditsUsed: r.creditsUsed,
		creditsRemaining: r.creditsRemaining,
		remainingValueCents: packageValueCents(r, params.taxBasis),
		expiresAt: r.expiresAt,
		daysLeft: Math.floor((r.expiresAt.getTime() - now) / MS_PER_DAY),
		frozenUntil: r.frozenUntil,
		paymentStatus: r.paymentStatus,
		trainerName: r.trainerName,
		branchId: r.branchId,
		branchName: r.branchName,
		currency: currencyForBranch(currencyMap, r.branchId),
	}));

	return { rows, total };
}

export async function listExpiringCredits(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
): Promise<ReportListResult<ExpiringCreditRow>> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	return fetchExpiringCreditsPage(tenantDb, params, branchIds);
}

const EXPIRING_CREDITS_HEADERS = [
	"Customer",
	"Service",
	"Purchase #",
	"Credits Total",
	"Used",
	"Remaining",
	"Remaining Value",
	"Currency",
	"Expires",
	"Days Left",
	"Trainer",
	"Branch",
	"Payment Status",
] as const;

export async function exportExpiringCreditsCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	return exportReportCsv(
		(page) =>
			fetchExpiringCreditsPage(tenantDb, { ...params, ...page }, branchIds),
		EXPIRING_CREDITS_HEADERS,
		(row) => [
			row.customerName,
			row.serviceName,
			row.purchaseNumber,
			row.creditsTotal,
			row.creditsUsed,
			row.creditsRemaining,
			row.remainingValueCents == null
				? ""
				: (row.remainingValueCents / 100).toFixed(2),
			row.currency,
			row.expiresAt,
			row.daysLeft,
			row.trainerName,
			row.branchName,
			row.paymentStatus,
		],
	);
}

// ---------------------------------------------------------------------------
// Report B — Services Owed (delivery liability, point-in-time snapshot)
// ---------------------------------------------------------------------------

export interface ServiceOwedRow {
	id: string;
	customerName: string | null;
	serviceName: string | null;
	purchaseNumber: string | null;
	status: string;
	creditsTotal: number;
	creditsUsed: number;
	creditsRemaining: number;
	/** Value of undelivered credits (cents, basis-adjusted); null when unpriced. */
	owedValueCents: number | null;
	startsAt: Date;
	expiresAt: Date;
	frozenUntil: Date | null;
	paymentStatus: string;
	trainerName: string | null;
	branchId: string | null;
	branchName: string | null;
	currency: string;
}

export interface ServicesOwedTotals {
	packages: number;
	creditsRemaining: number;
	owedValueCents: number;
}

export interface ServicesOwedResult extends ReportListResult<ServiceOwedRow> {
	/** Aggregated over the WHOLE filtered set (not just the current page). */
	totalsByCurrency: Record<string, ServicesOwedTotals>;
}

/**
 * Point-in-time snapshot: params.from/to are intentionally IGNORED — the
 * liability exists regardless of when the package was bought or expires.
 */
function servicesOwedWhere(branchIds: string[] | null): SQL | undefined {
	const conditions: (SQL | undefined)[] = [
		inArray(packageInstances.status, ["active", "frozen"]),
		gt(packageInstances.creditsRemaining, 0),
		ne(packageInstances.paymentStatus, "refunded"),
	];
	if (branchIds !== null) {
		// Fail closed: branchless rows hidden for scoped callers.
		conditions.push(inArray(pkgBranchId, branchIds));
	}
	return and(...conditions);
}

async function fetchServicesOwedPage(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
	branchIds: string[] | null,
): Promise<ReportListResult<ServiceOwedRow>> {
	const where = servicesOwedWhere(branchIds);
	const owedExpr = packageValueExpr(params.taxBasis);

	const [countRows, pageRows] = await Promise.all([
		tenantDb
			.select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
			.from(packageInstances)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.where(where),
		tenantDb
			.select(pageSelection)
			.from(packageInstances)
			.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
			.leftJoin(services, eq(packageInstances.serviceId, services.id))
			.leftJoin(hierarchyNodes, eq(hierarchyNodes.id, pkgBranchId))
			.leftJoin(members, eq(packageInstances.assignedTrainerId, members.id))
			.leftJoin(memberProfiles, eq(memberProfiles.memberId, members.id))
			.where(where)
			.orderBy(sql`${owedExpr} DESC NULLS LAST`, desc(packageInstances.id))
			.limit(params.limit)
			.offset(params.offset),
	]);

	const total = countRows[0]?.total ?? 0;
	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		pageRows.map((r) => r.branchId),
	);

	const rows: ServiceOwedRow[] = pageRows.map((r) => ({
		id: r.id,
		customerName: r.customerName,
		serviceName: r.serviceName,
		purchaseNumber: r.purchaseNumber,
		status: r.status,
		creditsTotal: r.creditsTotal,
		creditsUsed: r.creditsUsed,
		creditsRemaining: r.creditsRemaining,
		owedValueCents: packageValueCents(r, params.taxBasis),
		startsAt: r.startsAt,
		expiresAt: r.expiresAt,
		frozenUntil: r.frozenUntil,
		paymentStatus: r.paymentStatus,
		trainerName: r.trainerName,
		branchId: r.branchId,
		branchName: r.branchName,
		currency: currencyForBranch(currencyMap, r.branchId),
	}));

	return { rows, total };
}

/**
 * Whole-set totals: SQL GROUP BY the derived branch id, then merge branch
 * groups into currency buckets in JS (currency is branch-derived, so distinct
 * branches can share a bucket).
 */
async function fetchServicesOwedTotals(
	tenantDb: TenantDb,
	taxBasis: TaxBasis,
	branchIds: string[] | null,
): Promise<Record<string, ServicesOwedTotals>> {
	const owedExpr = packageValueExpr(taxBasis);
	const groups = await tenantDb
		.select({
			branchId: pkgBranchId,
			packages: sql<number>`COUNT(*)`.mapWith(Number),
			creditsRemaining:
				sql<number>`COALESCE(SUM(${packageInstances.creditsRemaining}), 0)`.mapWith(
					Number,
				),
			owedValueCents: sql<number>`COALESCE(SUM(${owedExpr}), 0)`.mapWith(
				Number,
			),
		})
		.from(packageInstances)
		.leftJoin(salesOrders, eq(packageInstances.salesOrderId, salesOrders.id))
		.leftJoin(services, eq(packageInstances.serviceId, services.id))
		.where(servicesOwedWhere(branchIds))
		.groupBy(pkgBranchId);

	const currencyMap = await buildBranchCurrencyMap(
		tenantDb,
		groups.map((g) => g.branchId),
	);
	const totals: Record<string, ServicesOwedTotals> = {};
	for (const g of groups) {
		const currency = currencyForBranch(currencyMap, g.branchId);
		const bucket = (totals[currency] ??= {
			packages: 0,
			creditsRemaining: 0,
			owedValueCents: 0,
		});
		bucket.packages += g.packages;
		bucket.creditsRemaining += g.creditsRemaining;
		bucket.owedValueCents += g.owedValueCents;
	}
	return totals;
}

export async function listServicesOwed(
	tenantDb: TenantDb,
	params: ReportBaseParams & ReportPageParams,
): Promise<ServicesOwedResult> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	const [page, totalsByCurrency] = await Promise.all([
		fetchServicesOwedPage(tenantDb, params, branchIds),
		fetchServicesOwedTotals(tenantDb, params.taxBasis, branchIds),
	]);
	return { ...page, totalsByCurrency };
}

const SERVICES_OWED_HEADERS = [
	"Customer",
	"Service",
	"Purchase #",
	"Status",
	"Credits Remaining",
	"Owed Value",
	"Currency",
	"Starts",
	"Expires",
	"Trainer",
	"Branch",
] as const;

export async function exportServicesOwedCsv(
	tenantDb: TenantDb,
	params: ReportBaseParams,
): Promise<ReportCsvResult> {
	const branchIds = await resolveReportBranchIds(tenantDb, params);
	return exportReportCsv(
		(page) =>
			fetchServicesOwedPage(tenantDb, { ...params, ...page }, branchIds),
		SERVICES_OWED_HEADERS,
		(row) => [
			row.customerName,
			row.serviceName,
			row.purchaseNumber,
			row.status,
			row.creditsRemaining,
			row.owedValueCents == null ? "" : (row.owedValueCents / 100).toFixed(2),
			row.currency,
			row.startsAt,
			row.expiresAt,
			row.trainerName,
			row.branchName,
		],
	);
}
