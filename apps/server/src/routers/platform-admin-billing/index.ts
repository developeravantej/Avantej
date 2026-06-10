import { type StripeClientLike } from "./_shared";
import { createOverviewProcedures } from "./overview.procedures";
import { createInvoicesProcedures } from "./invoices.procedures";

export type { StripeClientLike };

export function createPlatformAdminBillingRouter(
	stripeOverride?: StripeClientLike,
) {
	return {
		...createOverviewProcedures(stripeOverride),
		...createInvoicesProcedures(stripeOverride),
	};
}

export const platformAdminBillingRouter = createPlatformAdminBillingRouter();
