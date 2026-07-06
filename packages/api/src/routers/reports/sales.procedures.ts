/**
 * WS2 reports — Sales domain procedures (Report A: Sales/Revenue,
 * Report B: Sales Mix). Handlers stay thin: guard → service call, plus
 * cross-DB sold-by / lead-source name enrichment (cancelled-sales pattern).
 */
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import {
	exportSalesMixCsv as exportSalesMixCsvSvc,
	exportSalesReportCsv as exportSalesReportCsvSvc,
	listSalesMix as listSalesMixSvc,
	listSalesReport,
} from "@avantej-core/services/reports/sales.report";
import { inArray } from "drizzle-orm";

import { tenantProcedure } from "../../index";
import {
	tryGetControlPanelDb,
	type ControlPanelDb,
} from "../../lib/context-helpers";
import {
	guardReportAccess,
	reportBaseInput,
	reportDates,
	reportListInput,
} from "./_shared";

/**
 * Batch cross-DB name lookup (control-panel users). Null-safe + best-effort:
 * a missing/unreachable control-panel DB degrades to raw user ids.
 */
async function fetchUserNames(
	controlPanelDb: ControlPanelDb | null,
	userIds: string[],
): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	const distinct = [...new Set(userIds.filter((id) => id.length > 0))];
	if (!controlPanelDb || distinct.length === 0) return names;
	try {
		const users = await controlPanelDb
			.select({ id: cpUsers.id, name: cpUsers.name })
			.from(cpUsers)
			.where(inArray(cpUsers.id, distinct));
		for (const u of users) names.set(u.id, u.name);
	} catch {
		// Best-effort — rows fall back to raw user ids.
	}
	return names;
}

const listSales = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		const { rows, total } = await listSalesReport(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});

		// Dual sales allocation: enrich closer + lead-source names for the page.
		const names = await fetchUserNames(
			tryGetControlPanelDb(context),
			rows.flatMap((r) =>
				[r.soldByUserId, r.leadSourceUserId].filter((id): id is string => !!id),
			),
		);

		return {
			total,
			rows: rows.map((r) => ({
				...r,
				soldByName: r.soldByUserId ? (names.get(r.soldByUserId) ?? null) : null,
				leadSourceName: r.leadSourceUserId
					? (names.get(r.leadSourceUserId) ?? null)
					: null,
			})),
		};
	});

const exportSalesCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		const controlPanelDb = tryGetControlPanelDb(context);

		return exportSalesReportCsvSvc(
			context.tenantDb,
			{
				...reportDates(input),
				taxBasis: input.taxBasis,
				branchId: input.branchId,
				accessibleNodeIds,
			},
			(ids) => fetchUserNames(controlPanelDb, ids),
		);
	});

const listSalesMix = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		return listSalesMixSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportSalesMixCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");

		return exportSalesMixCsvSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

export const reportsSalesProcedures = {
	listSales,
	exportSalesCsv,
	listSalesMix,
	exportSalesMixCsv,
};
