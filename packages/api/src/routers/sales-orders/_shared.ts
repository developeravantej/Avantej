import { z } from "zod";
import {
	CANCELLATION_REASON_CATEGORIES,
	SALES_ORDER_REFUND_STATUSES,
} from "@avantej-core/services";

export const salesOrderStatusEnum = z.enum([
	"draft",
	"confirmed",
	"completed",
	"cancelled",
]);
export const refundStatusEnum = z.enum(SALES_ORDER_REFUND_STATUSES);
export const cancellationReasonCategoryEnum = z.enum(
	CANCELLATION_REASON_CATEGORIES,
);
