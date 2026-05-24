/** commission-splits router — split by domain (Plan D-S7). */
import { commissionSplitsReadProcedures } from "./read.procedures";
import { commissionSplitsLifecycleProcedures } from "./lifecycle.procedures";
import { commissionSplitsAnalyticsProcedures } from "./analytics.procedures";
import { commissionSplitsReviewProcedures } from "./review.procedures";

export const commissionSplitsRouter = {
	...commissionSplitsReadProcedures,
	...commissionSplitsLifecycleProcedures,
	...commissionSplitsAnalyticsProcedures,
	...commissionSplitsReviewProcedures,
};
