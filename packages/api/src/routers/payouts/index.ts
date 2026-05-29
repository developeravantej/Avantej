/** payouts router — split by domain (Plan D-S7). */
import { payoutsReadProcedures } from "./read.procedures";
import { payoutsBatchProcedures } from "./batch.procedures";
import { payoutsLifecycleProcedures } from "./lifecycle.procedures";

export const payoutsRouter = {
	...payoutsReadProcedures,
	...payoutsBatchProcedures,
	...payoutsLifecycleProcedures,
};
