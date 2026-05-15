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
