/**
 * Phase E2 — Save-card flow for installment auto-charge.
 *
 * Creates a Stripe Checkout Session in `mode: "setup"` on the org's connected
 * account. The customer completes the hosted Stripe page, saves their card, and
 * the resulting `checkout.session.completed` webhook (metadata.type =
 * "installment_setup") writes `stripe_customer_id`, `default_payment_method_id`,
 * and `auto_charge_enabled = true` back onto the package_instance row.
 *
 * Stripe best-practices:
 *   - Hosted Checkout (no Payment Element) — consistent with the rest of the app.
 *   - No `payment_method_types` — dynamic payment methods.
 *   - SP-01 gate: charges_enabled required before creating sessions.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import type { StripeClientLike } from "./_shared";
import { getEnvVar } from "./_shared";

/** Minimal Stripe Checkout Session shape needed here. */
type CheckoutSession = { id: string; url: string | null };

/** Extended StripeClientLike surface used by this module. */
type StripeWithCheckout = StripeClientLike & {
	checkout: {
		sessions: {
			create: (
				params: unknown,
				options?: { stripeAccount?: string },
			) => Promise<CheckoutSession>;
		};
	};
};

export function createCardSetupInstallmentProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
		createCardSetupSession: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					packageInstanceId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				// 1. Load the package instance.
				const [pkg] = await context.tenantDb
					.select({
						id: packageInstances.id,
						stripeCustomerId: packageInstances.stripeCustomerId,
						salesOrderId: packageInstances.salesOrderId,
						installmentsTotal: packageInstances.installmentsTotal,
					})
					.from(packageInstances)
					.where(eq(packageInstances.id, input.packageInstanceId))
					.limit(1);

				if (!pkg) {
					throw new ORPCError("NOT_FOUND", {
						message: "Package instance not found",
					});
				}

				// Only installment packages make sense for auto-charge setup.
				if (!pkg.installmentsTotal || pkg.installmentsTotal <= 1) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Package is not an installment plan",
					});
				}

				// 2. Resolve Connect account (SP-01 gate).
				const branchId = pkg.salesOrderId
					? (
							await context.tenantDb
								.select({ branchId: salesOrders.branchId })
								.from(salesOrders)
								.where(eq(salesOrders.id, pkg.salesOrderId))
								.limit(1)
						)[0]?.branchId ?? null
					: null;

				const countryCode = branchId
					? await resolveBranchCountryCode(branchId, context.tenantDb)
					: null;

				const acct = countryCode
					? await getConnectAccountForOrgCountry(
							input.organizationId,
							countryCode,
							controlPanelDb,
						)
					: await getConnectAccountForOrg(
							input.organizationId,
							controlPanelDb,
						);

				if (!acct.chargesEnabled) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message:
							"Stripe Connect account is not yet charges-enabled for this organisation",
					});
				}

				const stripe = resolveStripe() as unknown as StripeWithCheckout;
				const webAppUrl =
					getEnvVar("WEB_APP_URL") ?? "http://localhost:3021";

				// 3. Build the Checkout Session in setup mode.
				// `customer_creation: "always"` creates a Stripe Customer even when no
				// customer_email is provided. The resulting customer id is written back
				// to package_instance by the checkout.session.completed webhook.
				const sessionParams: Record<string, unknown> = {
					mode: "setup",
					// Dynamic payment methods — omit payment_method_types per best-practices.
					customer_creation: "always",
					// Persist the customer across setup sessions when one was already created.
					...(pkg.stripeCustomerId
						? { customer: pkg.stripeCustomerId }
						: {}),
					metadata: {
						type: "installment_setup",
						packageInstanceId: input.packageInstanceId,
						organizationId: input.organizationId,
					},
					success_url: `${webAppUrl}/dashboard/packages/instances?setupComplete=1`,
					cancel_url: `${webAppUrl}/dashboard/packages/instances`,
				};

				const session = await stripe.checkout.sessions.create(
					sessionParams,
					{ stripeAccount: acct.acctId },
				);

				if (!session.url) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Stripe did not return a checkout URL",
					});
				}

				return { url: session.url };
			}),
	};
}
