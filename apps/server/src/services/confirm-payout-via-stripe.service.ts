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
 *      must have `payouts_enabled = true`.
 *   4. Call `stripe.transfers.create({ ..., metadata: { organizationId, payoutId } })`.
 *   5. On Stripe success: stamp `stripeTransferId`, transition payout
 *      `pending → paid`, flip linked commission_splits to paid, write audit.
 *   6. On Stripe failure: row stays at `pending`. Operator can retry. A
 *      `payout.confirm_via_stripe.failed` audit row is written in a separate
 *      auto-commit transaction (so it survives the lock-tx rollback) before
 *      the ConfirmPayoutError is re-thrown — ops can grep audit_log for
 *      failure patterns instead of scraping app logs.
 *
 * Concurrency: lock held through the Stripe call (typically <1s; the
 * alternative drops the lock and races against cancelPayout / markFailed).
 * Idempotency: `confirm-payout:<payoutId>` key passed to Stripe so a
 * network-drop retry returns the existing transfer instead of double-paying.
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

type StripeFailureContext = {
	failureMessage: string;
	stripeErrorCode: string | null;
	stripeErrorType: string | null;
	destinationAccountId: string;
	amountCents: number;
	currency: string;
};

export async function confirmPayoutViaStripe(
	tenantDb: TenantDb,
	payoutId: string,
	params: ConfirmPayoutViaStripeParams,
	stripeClientFactory: () => StripeTransfersClient,
): Promise<ConfirmPayoutViaStripeResult> {
	// Captured inside the transaction; consumed outside so the audit row for
	// a Stripe rejection survives the transaction rollback.
	let stripeFailureContext: StripeFailureContext | null = null;

	try {
		return await tenantDb.transaction(async (tx) => {
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
					{ idempotencyKey: `confirm-payout:${payout.id}` },
				);
				transferId = transfer.id;
			} catch (err) {
				const failureMessage = err instanceof Error ? err.message : String(err);
				// Capture context for the post-rollback failure audit. Writing
				// audit_log inside `tx` would roll back along with the throw.
				stripeFailureContext = {
					failureMessage,
					stripeErrorCode:
						typeof err === "object" && err !== null && "code" in err
							? String((err as { code?: unknown }).code ?? "")
							: null,
					stripeErrorType:
						typeof err === "object" && err !== null && "type" in err
							? String((err as { type?: unknown }).type ?? "")
							: null,
					destinationAccountId: partner.stripeConnectAccountId,
					amountCents: payout.amount,
					currency: payout.currency,
				};
				throw new ConfirmPayoutError("STRIPE_TRANSFER_FAILED", failureMessage);
			}

			// 4. Stamp + transition + flip linked splits + audit.
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
	} catch (err) {
		// TS narrows a closure-mutated null-initialised let to `null` outside
		// the closure (can't prove the closure ran); cast at the read site.
		const failureCtx = stripeFailureContext as StripeFailureContext | null;
		if (
			err instanceof ConfirmPayoutError &&
			err.code === "STRIPE_TRANSFER_FAILED" &&
			failureCtx !== null
		) {
			// Write the failure audit on `tenantDb` (auto-commit) so it
			// survives the rolled-back lock tx. Inner try/catch so a failed
			// audit doesn't mask the original ConfirmPayoutError.
			try {
				await writeAudit(tenantDb, {
					actorUserId: params.actor.userId,
					actorMemberId: params.actor.memberId,
					actorRole: params.actor.role,
					action: "payout.confirm_via_stripe.failed",
					entityType: "payout",
					entityId: payoutId,
					summary: `Stripe transfer rejected for payout ${payoutId}: ${failureCtx.failureMessage.slice(0, 200)}`,
					changes: {
						stripeErrorMessage: failureCtx.failureMessage,
						stripeErrorCode: failureCtx.stripeErrorCode,
						stripeErrorType: failureCtx.stripeErrorType,
						destinationAccountId: failureCtx.destinationAccountId,
						amountCents: failureCtx.amountCents,
						currency: failureCtx.currency,
						idempotencyKey: `confirm-payout:${payoutId}`,
					},
				});
			} catch (auditErr) {
				console.error(
					`[confirmPayoutViaStripe] failed to write failure audit for payout ${payoutId}:`,
					auditErr,
				);
			}
		}
		throw err;
	}
}

// ─── Bulk variant ───────────────────────────────────────────────────────────

export type BulkConfirmResultRow =
	| { payoutId: string; ok: true; stripeTransferId: string }
	| {
			payoutId: string;
			ok: false;
			errorCode: ConfirmPayoutError["code"] | "UNKNOWN";
			errorMessage: string;
	  };

export interface BulkConfirmResult {
	succeeded: number;
	failed: number;
	rows: BulkConfirmResultRow[];
}

/**
 * Bulk-confirm pending payouts via Stripe Connect. Per-row independence:
 * each `confirmPayoutViaStripe` call runs in its own transaction, so a
 * partial failure doesn't roll back the whole batch.
 *
 * Concurrency: serial (not parallel) so the platform's Stripe rate limit
 * doesn't burst-trip on a large batch. Latency is predictable (~1s/row)
 * and ops kicks the batch and walks away.
 *
 * Each row's failure becomes its own `payout.confirm_via_stripe.failed`
 * audit row (written by the single-row service), so a 100-row batch with
 * 3 failures leaves 100 audit rows total (97 success + 3 failure) for
 * forensics.
 */
export async function confirmAllPayoutsViaStripe(
	tenantDb: TenantDb,
	payoutIds: string[],
	params: ConfirmPayoutViaStripeParams,
	stripeClientFactory: () => StripeTransfersClient,
): Promise<BulkConfirmResult> {
	const rows: BulkConfirmResultRow[] = [];
	for (const payoutId of payoutIds) {
		try {
			const r = await confirmPayoutViaStripe(
				tenantDb,
				payoutId,
				params,
				stripeClientFactory,
			);
			rows.push({ payoutId, ok: true, stripeTransferId: r.stripeTransferId });
		} catch (err) {
			if (err instanceof ConfirmPayoutError) {
				rows.push({
					payoutId,
					ok: false,
					errorCode: err.code,
					errorMessage: err.message,
				});
			} else {
				rows.push({
					payoutId,
					ok: false,
					errorCode: "UNKNOWN",
					errorMessage: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
	const succeeded = rows.filter((r) => r.ok).length;
	return { succeeded, failed: rows.length - succeeded, rows };
}
