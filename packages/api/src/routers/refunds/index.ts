/** refunds router — split by domain (Plan D-S7). */
import { refundsReadProcedures } from "./read.procedures";
import { refundsLifecycleProcedures } from "./lifecycle.procedures";
import { refundsBulkProcedures } from "./bulk.procedures";

export const refundsRouter = {
	...refundsReadProcedures,
	...refundsLifecycleProcedures,
	...refundsBulkProcedures,
};
