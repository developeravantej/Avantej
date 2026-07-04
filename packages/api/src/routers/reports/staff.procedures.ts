/**
 * WS2 reports — STAFF domain procedures.
 * Coach Productivity + Appointments Detailed. Handlers stay thin: guard,
 * translate input, delegate to @avantej-core/services/reports/staff.report.
 */
import {
	exportAppointmentsDetailedCsv as exportAppointmentsDetailedCsvService,
	exportCoachProductivityCsv as exportCoachProductivityCsvService,
	listAppointmentsDetailed as listAppointmentsDetailedService,
	listCoachProductivity as listCoachProductivityService,
} from "@avantej-core/services/reports/staff.report";

import { tenantProcedure } from "../../index";
import {
	guardReportAccess,
	reportBaseInput,
	reportDates,
	reportListInput,
} from "./_shared";

const listCoachProductivity = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);
		return listCoachProductivityService(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportCoachProductivityCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		return exportCoachProductivityCsvService(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

const listAppointmentsDetailed = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);
		return listAppointmentsDetailedService(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const exportAppointmentsDetailedCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		return exportAppointmentsDetailedCsvService(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
		});
	});

export const reportsStaffProcedures = {
	listCoachProductivity,
	exportCoachProductivityCsv,
	listAppointmentsDetailed,
	exportAppointmentsDetailedCsv,
};
