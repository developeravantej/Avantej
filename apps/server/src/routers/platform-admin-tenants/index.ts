import { queryProcedures } from "./query.procedures";
import { lifecycleProcedures } from "./lifecycle.procedures";
import { billingProcedures } from "./billing.procedures";

export const platformAdminTenantsRouter = {
	...queryProcedures,
	...lifecycleProcedures,
	...billingProcedures,
};
