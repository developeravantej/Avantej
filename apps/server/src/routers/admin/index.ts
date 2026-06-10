import { userProcedures } from "./users.procedures";
import { impersonationProcedures } from "./impersonation.procedures";
import { tenantProcedures } from "./tenants.procedures";

export const adminRouter = {
	...userProcedures,
	...impersonationProcedures,
	...tenantProcedures,
};
