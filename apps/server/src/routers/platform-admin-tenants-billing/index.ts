/**
 * Platform Admin — Tenant Billing router (Plan F.3-A).
 *
 * Per-tenant Stripe invoice history + refund action for the ops team.
 * Mounted under `platformAdminTenants.billing.*`.
 *
 * Procedures:
 *   - listInvoices({ organizationId, limit, startingAfter? })
 *       Cursor-paged list of Stripe invoices for the tenant's customer.
 *       Empty array if the tenant has no Stripe customer yet (trialing).
 *   - getInvoice({ organizationId, invoiceId })
 *       Detail view (with line items) for a single invoice.
 *   - refundInvoice({ organizationId, invoiceId, amountCents?, reason, notes? })
 *       Super-admin only. Issues a real Stripe refund against the invoice's
 *       payment_intent. Writes one `tenant_invoice_refund` audit row on
 *       success only.
 *   - getCustomerSummary({ organizationId })
 *       Stripe customer summary card (default payment method, balance).
 *
 * Stripe access is via the shared `getStripeClient()` singleton OR an
 * injected stub (factory pattern mirrors `subscriptions.ts` so tests can
 * swap the SDK without touching env).
 */

import { getStripeClient } from "@/lib/stripe";
import { type StripeClientLike } from "./_shared";
import { createInvoicesProcedures } from "./invoices.procedures";
import { createBillingActionsProcedures } from "./billing-actions.procedures";

export type { StripeClientLike } from "./_shared";

// ── Router factory ──────────────────────────────────────────────────────────
export function createPlatformAdminTenantsBillingRouter(
	stripeOverride?: StripeClientLike,
) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		...createInvoicesProcedures(resolveStripe),
		...createBillingActionsProcedures(resolveStripe),
	};
}

export const platformAdminTenantsBillingRouter =
	createPlatformAdminTenantsBillingRouter();
