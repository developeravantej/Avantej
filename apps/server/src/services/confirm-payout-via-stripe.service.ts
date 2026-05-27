/**
 * Confirm a pending payout via Stripe Connect Transfer (Phase C of the
 * S-partner-stripe-onboarding chain).
 *
 * This is the ORIGINATING side that the iteration-6 webhook handlers were
 * built to receive events from. When an operator clicks "confirm via Stripe"
 * on a pending `payouts` row whose `paymentMethod === 'stripe_connect'`:
 *
 *   1. SELECT … FOR UPDATE the payout — concurrency guard (mirrors F-07 +
 *      the state-machine transitions).
 *   2. Validate: status must be `pending`; paymentMethod must be `stripe_connect`.
 *   3. Look up the recipient's `partner_stripe_accounts` row — must exist,
 *      must have `payouts_enabled = true`. Otherwise → BAD_REQUEST with a
 *      message the operator can act on (eg "Partner has not completed
 *      Stripe onboarding" / "Partner Stripe Connect is restricted").
 *   4. Call `stripe.transfers.create({ amount, currency, destination,
 *      metadata: { organizationId, payoutId } })`. The metadata is what the
 *      webhook receiver resolves to route `transfer.{created,reversed}`
 *      events back.
 *   5. On Stripe success: stamp `stripeTransferId`, transition payout
 *      `pending → paid`, flip linked commission_splits to paid, write
 *      audit. (The `transfer.created` webhook that arrives later is a
 *      no-op confirmation since we already updated.)
 *   6. On Stripe failure: row stays at `pending`. Operator can retry.
 *
 * Concurrency: we hold the FOR UPDATE lock through the Stripe API call. Stripe
 * Transfer creates are typically <1s, and the operator action is low-volume,
 * so the lock duration is acceptable. The alternative (drop the lock before
 * the API call, re-acquire after) would race against `cancelPayout` /
 * `markPayoutFailed` initiated by another admin.
 *
 * Idempotency: provide an idempotency key derived from `payoutId` so a
 * retry after a network drop doesn't double-transfer.
 */

import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { partnerStripeAccounts } from "@avantej-core/db/schema/tenant/partner-stripe-accounts";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;

/** Minimal Stripe surface used by this service — keeps tests injection-friendly. */
export interface StripeTransfersClient {
	transfers: {
		create: (
			params: {
				amount: number;
				currency: string;
				destination: string;
				metadata?: Record<string, string>;
				description?: string;
			},
			options?: { idempotencyKey?: string },
		) => Promise<{ id: string }>;
	};
}

export interface ConfirmPayoutViaStripeParams {
	organizationId: string;
	actor: { userId: string; memberId?: string; role?: string };
	/** Inject a fake/stub Stripe client in tests; falls back to the real client when omitted. */
	stripeClient?: StripeTransfersClient;
}

export interface ConfirmPayoutViaStripeResult {
	payoutId: string;
	stripeTransferId: string;
	status: "paid";
}

/**
 * Surface-level error code so callers can map to oRPC error codes cleanly.
 */
export class ConfirmPayoutError extends Error {
	readonly code:
		| "NOT_FOUND"
		| "BAD_REQUEST_STATUS"
		| "BAD_REQUEST_METHOD"
		| "PARTNER_NOT_ONBOARDED"
		| "PARTNER_NOT_PAYOUTS_ENABLED"
		| "STRIPE_TRANSFER_FAILED";
	constructor(code: ConfirmPayoutError["code"], message: string) {
		super(message);
		this.code = code;
		this.name = "ConfirmPayoutError";
	}
}

export async function confirmPayoutViaStripe(
	tenantDb: TenantDb,
	payoutId: string,
	params: ConfirmPayoutViaStripeParams,
	stripeClientFactory: () => StripeTransfersClient,
): Promise<ConfirmPayoutViaStripeResult> {
	return tenantDb.transaction(async (tx) => {
		// 1. Lock the payout.
		const [payout] = await tx
			.select()
			.from(payouts)
			.where(eq(payouts.id, payoutId))
			.for("update")
			.limit(1);
		if (!payout) {
			throw new ConfirmPayoutError("NOT_FOUND", `Payout ${payoutId} not found`);
		}
		if (payout.status !== "pending") {
			throw new ConfirmPayoutError(
				"BAD_REQUEST_STATUS",
				`Cannot confirm via Stripe: payout is '${payout.status}' (need 'pending')`,
			);
		}
		if (payout.payoutMethod !== "stripe_connect") {
			throw new ConfirmPayoutError(
				"BAD_REQUEST_METHOD",
				`Cannot confirm via Stripe: payout method is '${payout.payoutMethod}' (need 'stripe_connect')`,
			);
		}

		// 2. Resolve the recipient's partner Connect account.
		const [partner] = await tx
			.select({
				stripeConnectAccountId: partnerStripeAccounts.stripeConnectAccountId,
				payoutsEnabled: partnerStripeAccounts.payoutsEnabled,
				stripeConnectStatus: partnerStripeAccounts.stripeConnectStatus,
			})
			.from(partnerStripeAccounts)
			.where(eq(partnerStripeAccounts.partnerId, payout.recipientId))
			.limit(1);
		if (!partner) {
			throw new ConfirmPayoutError(
				"PARTNER_NOT_ONBOARDED",
				`Partner ${payout.recipientId} has no Stripe Connect account on file`,
			);
		}
		if (!partner.payoutsEnabled) {
			throw new ConfirmPayoutError(
				"PARTNER_NOT_PAYOUTS_ENABLED",
				`Partner Stripe Connect is not payouts-enabled (status=${partner.stripeConnectStatus})`,
			);
		}

		// 3. Fire the Stripe Transfer.
		const stripe = params.stripeClient ?? stripeClientFactory();
		let transferId: string;
		try {
			const transfer = await stripe.transfers.create(
				{
					amount: payout.amount,
					currency: payout.currency,
					destination: partner.stripeConnectAccountId,
					metadata: {
						organizationId: params.organizationId,
						payoutId: payout.id,
					},
					description: `Avantej payout ${payout.id}`,
				},
				// Idempotency: a retry after a network drop in the same payout context
				// must not double-transfer. Keyed on payoutId so a Stripe-side dup will
				// return the existing transfer instead of creating a new one.
				{ idempotencyKey: `confirm-payout:${payout.id}` },
			);
			transferId = transfer.id;
		} catch (err) {
			throw new ConfirmPayoutError(
				"STRIPE_TRANSFER_FAILED",
				err instanceof Error ? err.message : String(err),
			);
		}

		// 4. Stamp + transition + flip linked splits + audit. All inside the
		// outer transaction so a post-Stripe DB write failure rolls back the
		// row state — but the Stripe transfer has already happened, so we
		// log loudly and re-throw to surface a reconciliation alarm.
		const now = new Date();
		await tx
			.update(payouts)
			.set({
				status: "paid",
				paidAt: now,
				manualPayoutConfirmedAt: now,
				manualPayoutConfirmedBy: params.actor.userId,
				stripeTransferId: transferId,
				description: payout.description
					? `${payout.description} | stripe_transfer: ${transferId}`
					: `Stripe transfer ${transferId}`,
				updatedAt: now,
			})
			.where(eq(payouts.id, payoutId));

		// Flip linked approved splits to paid. Matches the markPayoutPaid pattern.
		await tx
			.update(commissionSplits)
			.set({
				status: "paid",
				paidBy: params.actor.userId,
				paidAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(commissionSplits.payoutId, payoutId),
					eq(commissionSplits.status, "approved"),
				),
			);

		await writeAudit(tx, {
			actorUserId: params.actor.userId,
			actorMemberId: params.actor.memberId,
			actorRole: params.actor.role,
			action: "payout.confirm_via_stripe",
			entityType: "payout",
			entityId: payoutId,
			summary: `Payout confirmed via Stripe Connect (transfer ${transferId})`,
			changes: {
				previousStatus: "pending",
				newStatus: "paid",
				stripeTransferId: transferId,
				destinationAccountId: partner.stripeConnectAccountId,
				amountCents: payout.amount,
				currency: payout.currency,
			},
		});

		return { payoutId, stripeTransferId: transferId, status: "paid" };
	});
}
