/**
 * Platform Payment Ledger Service
 *
 * Writes payment events from Stripe webhook handlers into the
 * `platform_payment_ledger` control-panel table. Idempotent on
 * `stripeEventId` so that webhook replays / dedupe failures cannot
 * produce duplicate rows.
 *
 * Source of truth remains Stripe (ADR-0011); this mirror exists for
 * in-app admin audit + revenue reporting (Plan C Phase C.7).
 */

import type Stripe from "stripe";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel-schema";

export type LedgerEventKind =
	| "pi_succeeded"
	| "pi_refunded"
	| "saas_invoice_paid"
	| "application_fee_collected";

export interface RecordLedgerEventArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	organizationId: string | null;
	eventKind: LedgerEventKind;
	stripeEventId: string;
	stripeObjectId: string;
	stripeAccount: string | null;
	amount: number;
	applicationFee: number;
	currency: string;
	occurredAt: Date;
}

/**
 * The portion of {@link RecordLedgerEventArgs} that can be derived purely from
 * the Stripe event itself, with no DB access or request-scoped context.
 *
 * `controlPanelDb`, `organizationId`, and `stripeAccount` are deliberately
 * EXCLUDED: they are caller-supplied context. In particular, `organizationId`
 * resolution differs by caller (live Connect handler reads
 * `metadata.organizationId`; the application_fee handler and the backfill do an
 * async `org_country_stripe_accounts` lookup) — keeping it out of the projector
 * preserves purity (ADR-0018) and the existing per-caller org semantics.
 */
export type ProjectedLedgerArgs = Omit<
	RecordLedgerEventArgs,
	"controlPanelDb" | "organizationId" | "stripeAccount"
>;

/**
 * Pure Stripe-event → ledger-args projector (ADR-0018).
 *
 * Owns the WHOLE ledger taxonomy: which `event.type`s map to a ledger row
 * (returns `null` for every non-ledger type — this is the single source of
 * truth for ledger membership, replacing both the old `LEDGER_EVENT_TYPES`
 * array and the inline `if (event.type === ...)` arithmetic), plus per-type
 * amount / applicationFee extraction, currency lowercasing, and
 * `occurredAt = event.created * 1000`.
 *
 * Both writers (live webhook handlers + the backfill cron) call this so the
 * two paths produce byte-identical ledger args and cannot drift.
 */
export function projectStripeEventToLedger(
	event: Stripe.Event,
): ProjectedLedgerArgs | null {
	const occurredAt = new Date(event.created * 1000);

	switch (event.type) {
		case "payment_intent.succeeded": {
			const pi = event.data.object as Stripe.PaymentIntent;
			return {
				eventKind: "pi_succeeded",
				stripeEventId: event.id,
				stripeObjectId: pi.id,
				amount: pi.amount_received ?? pi.amount ?? 0,
				// PI events don't carry app_fee directly; reconciler picks this up.
				applicationFee: 0,
				currency: (pi.currency ?? "usd").toLowerCase(),
				occurredAt,
			};
		}
		case "charge.refunded": {
			const charge = event.data.object as Stripe.Charge;
			return {
				eventKind: "pi_refunded",
				stripeEventId: event.id,
				stripeObjectId: charge.id,
				amount: charge.amount_refunded ?? 0,
				applicationFee: charge.application_fee_amount ?? 0,
				currency: (charge.currency ?? "usd").toLowerCase(),
				occurredAt,
			};
		}
		case "application_fee.created": {
			const fee = event.data.object as Stripe.ApplicationFee;
			return {
				eventKind: "application_fee_collected",
				stripeEventId: event.id,
				stripeObjectId: fee.id,
				amount: fee.amount,
				applicationFee: fee.amount,
				currency: (fee.currency ?? "usd").toLowerCase(),
				occurredAt,
			};
		}
		case "invoice.paid": {
			const inv = event.data.object as Stripe.Invoice;
			return {
				eventKind: "saas_invoice_paid",
				stripeEventId: event.id,
				stripeObjectId: inv.id ?? "",
				amount: inv.amount_paid ?? 0,
				applicationFee: 0,
				currency: (inv.currency ?? "usd").toLowerCase(),
				occurredAt,
			};
		}
		default:
			return null;
	}
}

/**
 * Insert a payment event into platform_payment_ledger.
 *
 * Idempotent: ON CONFLICT (stripe_event_id) DO NOTHING. If the row
 * already exists (replay / dedupe miss) the call silently no-ops and
 * logs a single line so replay activity is observable in worker logs.
 */
export async function recordLedgerEvent(
	args: RecordLedgerEventArgs,
): Promise<void> {
	const {
		controlPanelDb,
		organizationId,
		eventKind,
		stripeEventId,
		stripeObjectId,
		stripeAccount,
		amount,
		applicationFee,
		currency,
		occurredAt,
	} = args;

	const inserted = await controlPanelDb
		.insert(platformPaymentLedger)
		.values({
			organizationId,
			eventKind,
			stripeEventId,
			stripeObjectId,
			stripeAccount,
			amount,
			applicationFee,
			currency,
			occurredAt,
		})
		.onConflictDoNothing({ target: platformPaymentLedger.stripeEventId })
		.returning({ id: platformPaymentLedger.id });

	if (inserted.length === 0) {
		console.log(
			`[platform-ledger] replay skipped — stripeEventId=${stripeEventId} eventKind=${eventKind} stripeObjectId=${stripeObjectId}`,
		);
	}
}
