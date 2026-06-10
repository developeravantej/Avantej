import { getStripeClient } from "@/lib/stripe";
import type { StripeClientLike } from "./_shared";
import { createCatalogProcedures } from "./catalog.procedures";
import { createTenantProcedures } from "./tenant.procedures";

export type { StripeClientLike } from "./_shared";

export function createPlatformAdminCouponsRouter(
	stripeOverride?: StripeClientLike,
) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		...createCatalogProcedures(resolveStripe),
		...createTenantProcedures(resolveStripe),
	};
}

export const platformAdminCouponsRouter = createPlatformAdminCouponsRouter();
