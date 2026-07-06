/**
 * WS2 reports — Collections + AR domain procedures.
 *
 * Report A (Collections): merged succeeded-payments + manual installment
 * receipts. Report B (Outstanding / AR Aging): point-in-time snapshot of
 * outstanding installment debt with a per-currency bucket rollup.
 *
 * Handlers stay thin — guard → service call. All merge / branch-derivation /
 * bucketing logic lives in collections.report.ts.
 */
import {
	exportArAgingCsv as exportArAgingCsvSvc,
	exportCollectionsCsv as exportCollectionsCsvSvc,
	listArAging as listArAgingSvc,
	listCollections as listCollectionsSvc,
} from "@avantej-core/services/reports/collections.report";

import { tenantProcedure } from "../../index";
import {
	guardReportAccess,
	reportBaseInput,
	reportDates,
	reportListInput,
} from "./_shared";

const listCollections = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		return listCollectionsSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportCollectionsCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");

		return exportCollectionsCsvSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

const listArAging = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		// AR is a point-in-time snapshot: from/to + taxBasis are accepted for the
		// shared contract but ignored by the service (see collections.report.ts).
		return listArAgingSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportArAgingCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");

		return exportArAgingCsvSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

export const reportsCollectionsProcedures = {
	listCollections,
	exportCollectionsCsv,
	listArAging,
	exportArAgingCsv,
};
