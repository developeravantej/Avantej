/**
 * WS2 reports suite — shared helpers.
 *
 * Every report query fn in this folder takes the same base params
 * (ReportBaseParams) and MUST scope rows via `resolveReportBranchIds`
 * before touching business tables. Empty non-admin scope fails closed
 * at the call site (return { rows: [], total: 0 }).
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { appendCsvRows, buildCsv } from "../csv-codec";
import { resolveBranchCurrency, DEFAULT_CURRENCY } from "../currency.service";
import { resolveScopeNodeIds } from "../hierarchy-scope";

export type TenantDb = NeonDatabase<typeof tenantSchema>;

// ---------------------------------------------------------------------------
// Shared input contract
// ---------------------------------------------------------------------------

export type TaxBasis = "pre_tax" | "tax_inclusive";

export interface ReportBaseParams {
	/** Optional scope node (branch/state/country) — expanded to its subtree. */
	branchId?: string | null;
	/** RBAC ceiling from context; [] = admin/org-wide. */
	accessibleNodeIds: string[];
	from: Date;
	to: Date;
	taxBasis: TaxBasis;
}

export interface ReportPageParams {
	limit: number;
	offset: number;
}

export interface ReportListResult<Row> {
	rows: Row[];
	total: number;
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the branch-id filter set for a report query.
 * Returns `null` when the caller is org-wide unscoped (admin, no scope
 * picked) — meaning "no branch filter at all".
 * Returns `[]` NEVER — an empty accessible set with a picked scope throws
 * upstream; callers treat `string[]` as an inArray filter.
 */
export async function resolveReportBranchIds(
	tenantDb: TenantDb,
	params: Pick<ReportBaseParams, "branchId" | "accessibleNodeIds">,
): Promise<string[] | null> {
	const scopeIds = await resolveScopeNodeIds(
		tenantDb,
		params.branchId ?? null,
		params.accessibleNodeIds,
	);
	// resolveScopeNodeIds returns [] only for admin/org-wide with no scope
	// picked → no filter.
	return scopeIds.length === 0 ? null : scopeIds;
}

// ---------------------------------------------------------------------------
// Currency (WS1 pattern: derive from branch, never trust stored defaults)
// ---------------------------------------------------------------------------

/**
 * Batch branch→currency map. Unknown/null branch ids map to DEFAULT_CURRENCY.
 */
export async function buildBranchCurrencyMap(
	tenantDb: TenantDb,
	branchIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
	const distinct = [...new Set(branchIds.filter((b): b is string => !!b))];
	const map = new Map<string, string>();
	for (const id of distinct) {
		map.set(id, await resolveBranchCurrency(tenantDb, id));
	}
	return map;
}

export function currencyForBranch(
	map: Map<string, string>,
	branchId: string | null | undefined,
): string {
	return (branchId && map.get(branchId)) || DEFAULT_CURRENCY;
}

// ---------------------------------------------------------------------------
// Tax helpers (tax is ADDED ON TOP — see pos.service.ts)
// ---------------------------------------------------------------------------

/** Tax cents derived from a pre-tax amount and a basis-points snapshot. */
export function taxFromBps(
	preTaxCents: number,
	bps: number | null | undefined,
): number {
	if (!bps || bps <= 0 || preTaxCents <= 0) return 0;
	return Math.floor((preTaxCents * bps) / 10000);
}

/** Applies the requested tax basis to a pre-tax amount + bps snapshot. */
export function amountForBasis(
	preTaxCents: number,
	bps: number | null | undefined,
	basis: TaxBasis,
): number {
	return basis === "tax_inclusive"
		? preTaxCents + taxFromBps(preTaxCents, bps)
		: preTaxCents;
}

// ---------------------------------------------------------------------------
// CSV export paging (pattern from cancelled-sales.service)
// ---------------------------------------------------------------------------

export const REPORT_CSV_CHUNK = 500;
export const REPORT_CSV_MAX_ROWS = 50_000;

export interface ReportCsvResult {
	csv: string;
	truncated: boolean;
	totalMatching: number;
}

/**
 * Chunked CSV export driver: pages a report list fn until exhausted or
 * REPORT_CSV_MAX_ROWS, mapping each row through `toCells`.
 */
export async function exportReportCsv<Row>(
	fetchPage: (page: ReportPageParams) => Promise<ReportListResult<Row>>,
	headers: readonly string[],
	toCells: (
		row: Row,
	) => ReadonlyArray<string | number | boolean | Date | null | undefined>,
): Promise<ReportCsvResult> {
	let offset = 0;
	let total = 0;
	const parts: string[] = [buildCsv(headers, [])];
	let exported = 0;
	for (;;) {
		const page = await fetchPage({ limit: REPORT_CSV_CHUNK, offset });
		total = page.total;
		if (page.rows.length === 0) break;
		parts.push(appendCsvRows(page.rows.map(toCells)));
		exported += page.rows.length;
		offset += page.rows.length;
		if (exported >= REPORT_CSV_MAX_ROWS) break;
		if (offset >= page.total) break;
	}
	return {
		csv: parts.filter((p) => p.length > 0).join("\n"),
		truncated: exported >= REPORT_CSV_MAX_ROWS && total > exported,
		totalMatching: total,
	};
}
