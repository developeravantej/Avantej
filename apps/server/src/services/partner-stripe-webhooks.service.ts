/**
 * Partner-scoped Stripe webhook handlers (S-stripe-payout-webhooks, F-09).
 *
 * Extracted into a service so the logic is unit-testable without a real
 * Stripe webhook signature. The route layer (webhooks.routes.ts) is a thin
 * dispatcher; the routing decision + DB mutation lives here.
 *
 * Events covered:
 *   - account.updated   (when metadata.partnerId is set)
 *   - transfer.created  (stamps stripeTransferId + idempotently marks payout paid
 *                        when the platform crashed mid-flight between
 *                        stripe.transfers.create and the local update)
 *   - transfer.reversed (chains to markPayoutFailed — the transfer was rolled back)
 *
 * NOTE: there are no `transfer.paid` / `transfer.failed` events in Stripe's
 * Connect model — those are only emitted on PAYOUT objects (bank-disbursement
 * lifecycle on the connected account's own schedule). For platform-to-connected-
 * account fund movement we use the Transfer events above.
 *
 * Tenant routing: every event MUST carry `metadata.organizationId` on the
 * relevant Stripe object (account or transfer). The OAuth callback labels
 * partner accounts via `accounts.update({metadata})` after the token exchange;
 * future transfer-creation code MUST label transfers the same way. Events
 * without these labels are returned `unmatched` and ignored.
 */
import { partnerStripeAccounts } from "@avantej-core/db/schema/tenant/partner-stripe-accounts";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { deriveStripeConnectStatus } from "./partner-stripe.service";
import { markPayoutFailed, markPayoutPaid } from "@avantej-core/services/payouts.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;

// Minimal shapes of the Stripe objects we actually read. Avoids tightly coupling
// to `stripe.Stripe.Account` / `stripe.Stripe.Transfer` types — easier to test.
export interface StripeAccountShape {
	id: string;
	metadata?: Record<string, string | undefined> | null;
	payouts_enabled?: boolean;
	details_submitted?: boolean;
	country?: string | null;
	default_currency?: string | null;
	requirements?: {
		currently_due?: string[] | null;
		eventually_due?: string[] | null;
		disabled_reason?: string | null;
	} | null;
}

export interface StripeTransferShape {
	id: string;
	amount?: number;
	destination?: string | null; // connected account id
	metadata?: Record<string, string | undefined> | null;
}

export type HandlerResult =
	| { matched: true; updated: boolean; note?: string }
	| { matched: false; reason: string };

/**
 * Update partner_stripe_accounts capability state from an account.updated event.
 *
 * Returns `matched: false` when the account has no partnerId metadata — the
 * route caller can then fall through to the org-level handler.
 *
 * Side effects: single UPDATE on partner_stripe_accounts. No DB row is created
 * here — onboarding INSERTs happen in the OAuth callback, not webhooks.
 */
export async function handleAccountUpdatedForPartner(
	tenantDb: TenantDb,
	account: StripeAccountShape,
): Promise<HandlerResult> {
	const partnerId = account.metadata?.partnerId;
	if (!partnerId) {
		return { matched: false, reason: "no_partner_metadata" };
	}

	const [existing] = await tenantDb
		.select({
			id: partnerStripeAccounts.id,
			onboardingCompletedAt: partnerStripeAccounts.onboardingCompletedAt,
		})
		.from(partnerStripeAccounts)
		.where(eq(partnerStripeAccounts.stripeConnectAccountId, account.id))
		.limit(1);
	if (!existing) {
		return { matched: false, reason: "no_partner_row_for_account" };
	}

	const payoutsEnabled = !!account.payouts_enabled;
	const detailsSubmitted = !!account.details_submitted;
	const disabledReason = account.requirements?.disabled_reason ?? null;
	const status = deriveStripeConnectStatus({
		payoutsEnabled,
		detailsSubmitted,
		requirementsDisabledReason: disabledReason,
	});
	const now = new Date();

	await tenantDb
		.update(partnerStripeAccounts)
		.set({
			stripeConnectStatus: status,
			payoutsEnabled,
			detailsSubmitted,
			countryCode: account.country ?? null,
			defaultCurrency: account.default_currency ?? null,
			requirementsCurrentlyDue: account.requirements?.currently_due ?? [],
			requirementsEventuallyDue: account.requirements?.eventually_due ?? [],
			requirementsDisabledReason: disabledReason,
			connectAccountUpdatedAt: now,
			onboardingCompletedAt:
				detailsSubmitted ? existing.onboardingCompletedAt ?? now : null,
			updatedAt: now,
		})
		.where(eq(partnerStripeAccounts.id, existing.id));

	return { matched: true, updated: true, note: `status=${status}` };
}

/**
 * Route a transfer.{created,paid,failed} event to the linked payout row.
 *
 * Requires the platform to have set `metadata.payoutId` when calling
 * `stripe.transfers.create`. Events without it are unmatched and ignored.
 *
 * Side effects (when matched):
 *   - transfer.created:  stamp stripeTransferId. If the payout is still in
 *                        `pending` (operator crashed mid-flight), idempotently
 *                        markPayoutPaid({ paymentReference: transfer.id }).
 *   - transfer.reversed: markPayoutFailed({ reason: provided string }) when
 *                        the local row is in a failable state.
 */
export async function handleTransferEvent(
	tenantDb: TenantDb,
	eventType: "transfer.created" | "transfer.reversed",
	transfer: StripeTransferShape,
	systemActorUserId: string,
	failureReason?: string,
): Promise<HandlerResult> {
	const payoutId = transfer.metadata?.payoutId;
	if (!payoutId) {
		return { matched: false, reason: "no_payout_id_metadata" };
	}

	const [existing] = await tenantDb
		.select({ id: payouts.id, status: payouts.status })
		.from(payouts)
		.where(eq(payouts.id, payoutId))
		.limit(1);
	if (!existing) {
		return { matched: false, reason: `payout_${payoutId}_not_found` };
	}

	const actor = { userId: systemActorUserId };

	switch (eventType) {
		case "transfer.created":
			// Always stamp the transfer id (idempotent overwrite is fine — Stripe
			// won't reuse a transfer id).
			await tenantDb
				.update(payouts)
				.set({ stripeTransferId: transfer.id, updatedAt: new Date() })
				.where(eq(payouts.id, payoutId));

			// If the local row is still `pending`, the operator's transfer-creation
			// code likely crashed between stripe.transfers.create and the local
			// status update. Recover by marking paid here. Already-paid is the
			// happy-path no-op; other statuses (canceled/failed) we leave alone.
			if (existing.status === "pending" || existing.status === "processing") {
				await markPayoutPaid(tenantDb, payoutId, {
					paymentReference: transfer.id,
					actor,
				});
				return { matched: true, updated: true, note: "transfer_created_recovered_to_paid" };
			}
			return { matched: true, updated: true, note: "transfer_id_stamped" };

		case "transfer.reversed":
			if (existing.status !== "pending" && existing.status !== "processing") {
				return { matched: true, updated: false, note: `status_${existing.status}_not_failable` };
			}
			await markPayoutFailed(tenantDb, payoutId, {
				reason: failureReason ?? "Stripe transfer reversed",
				actor,
			});
			return { matched: true, updated: true, note: "marked_failed" };
	}
}
