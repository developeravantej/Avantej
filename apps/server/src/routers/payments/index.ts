/**
 * Payments oRPC Router (Plan B Phase 2 — Direct Charge).
 *
 * Procedures:
 *   - createPaymentIntent(appointmentId):
 *       Server-side Stripe Direct Charge on the tenant's Connect account.
 *       Computes application_fee_amount from the tenant's SaaS tier.
 *       Returns clientSecret for the web to confirm via Stripe Elements.
 *
 *   - sendPaymentLink(appointmentId):
 *       Creates a Stripe Payment Link (Stripe-hosted checkout page) on the
 *       tenant's Connect account. URL is returned for staff to forward to
 *       the customer (SMS, email, paste). Customer doesn't need an account.
 *
 *   - getPaymentStatus(appointmentId):
 *       Returns the current paymentStatus + stripe_payment_intent_id from
 *       the appointments row (synced from webhooks).
 *
 * All procedures require an authenticated session + organizationId in input.
 *
 * Per ADR-0001 (Direct Charge via Stripe Connect Standard, MY platform),
 * ADR-0002 (per-tier application fee), ADR-0008 (account.updated drives
 * chargesEnabled gate).
 *
 * Phase 2 assumptions (deferred to later phases):
 *   - Single Connect acct per org (Phase 4: per-country branch acct).
 *   - One charge per appointment (Phase 3: partial pay, refunds, retries).
 *   - MYR-only (Phase 4: per-country currency).
 */

import { type StripeClientLike, makeResolveStripe } from "./_shared";
import { createIntentProcedures } from "./intent.procedures";
import { createLinkProcedures } from "./link.procedures";
import { createLinkDeactivateProcedures } from "./link-deactivate.procedures";
import { statusProcedures } from "./status.procedures";
import { createRefundProcedures } from "./refund.procedures";
import { createSavedCardProcedures } from "./saved-card.procedures";
import { createPurchaseProcedures } from "./purchase.procedures";

export function createPaymentsRouter(stripeClientOverride?: StripeClientLike) {
	const resolveStripe = makeResolveStripe(stripeClientOverride);

	return {
		...createIntentProcedures(resolveStripe),
		...createLinkProcedures(resolveStripe),
		...createLinkDeactivateProcedures(resolveStripe),
		...statusProcedures,
		...createRefundProcedures(resolveStripe),
		...createSavedCardProcedures(resolveStripe),
		...createPurchaseProcedures(resolveStripe),
	};
}

export const paymentsRouter = createPaymentsRouter();
