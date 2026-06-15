/** package-instances router — split by domain (Plan D-S7). */
import { packageInstancesClientProcedures } from "./client.procedures";
import { packageInstancesCreateProcedures } from "./create.procedures";
import { packageInstancesListsProcedures } from "./lists.procedures";
import { packageInstancesPendingProcedures } from "./pending.procedures";
import { packageInstancesAssignProcedures } from "./assign.procedures";
import { packageInstancesApproveProcedures } from "./approve.procedures";
import { packageInstancesConfirmPaymentProcedures } from "./confirm-payment.procedures";
import { packageInstancesLifecycleProcedures } from "./lifecycle.procedures";
import { packageInstancesHistoryProcedures } from "./history.procedures";

export const packageInstancesRouter = {
	...packageInstancesClientProcedures,
	...packageInstancesCreateProcedures,
	...packageInstancesListsProcedures,
	...packageInstancesPendingProcedures,
	...packageInstancesAssignProcedures,
	...packageInstancesApproveProcedures,
	...packageInstancesConfirmPaymentProcedures,
	...packageInstancesLifecycleProcedures,
	...packageInstancesHistoryProcedures,
};
