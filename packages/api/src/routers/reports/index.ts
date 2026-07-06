/**
 * WS2 reports suite — ten operational row-level reports (MOVE parity).
 * Merged from five domain procedure files; every procedure shares the
 * reportBaseInput contract and the guardReportAccess RBAC sequence.
 */
import { reportsActivityProcedures } from "./activity.procedures";
import { reportsCollectionsProcedures } from "./collections.procedures";
import { reportsPackagesProcedures } from "./packages.procedures";
import { reportsSalesProcedures } from "./sales.procedures";
import { reportsStaffProcedures } from "./staff.procedures";

export const reportsRouter = {
	...reportsSalesProcedures,
	...reportsCollectionsProcedures,
	...reportsPackagesProcedures,
	...reportsStaffProcedures,
	...reportsActivityProcedures,
};
