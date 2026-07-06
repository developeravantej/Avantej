/**
 * WS2 reports — PACKAGES domain procedures (credits liability).
 *
 * Expiring Credits: the from/to range filters the EXPIRY window.
 * Services Owed: point-in-time snapshot — the service ignores from/to.
 * All logic lives in @avantej-core/services/reports/packages.report;
 * handlers only guard + forward.
 */
import {
	exportExpiringCreditsCsv as exportExpiringCreditsCsvSvc,
	exportServicesOwedCsv as exportServicesOwedCsvSvc,
	listExpiringCredits as listExpiringCreditsSvc,
	listServicesOwed as listServicesOwedSvc,
} from "@avantej-core/services/reports/packages.report";

import { tenantProcedure } from "../../index";
import {
	guardReportAccess,
	reportBaseInput,
	reportDates,
	reportListInput,
} from "./_shared";

const listExpiringCredits = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);
		return listExpiringCreditsSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportExpiringCreditsCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		return exportExpiringCreditsCsvSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

const listServicesOwed = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);
		return listServicesOwedSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportServicesOwedCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		return exportServicesOwedCsvSvc(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

export const reportsPackagesProcedures = {
	listExpiringCredits,
	exportExpiringCreditsCsv,
	listServicesOwed,
	exportServicesOwedCsv,
};
