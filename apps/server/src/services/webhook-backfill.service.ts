/**
 * Webhook Backfill — Plan C Phase C.1.
 *
 * Hourly cron that replays any Stripe events we missed (wrangler outage,
 * Stripe 3-day retry window exhausted, etc).
 *
 * Per ADR-0021 (CF Cron) — scheduled handler dispatches to this service.
 *
 * Strategy:
 *   1. For each connected acct (org_country_stripe_accounts) AND the
 *      platform acct, call stripe.events.list with a 24h lookback.
 *   2. For each event, ask the shared projector (projectStripeEventToLedger)
 *      whether it maps to a ledger row; skip non-ledger types.
 *   3. For ledger-relevant events, route through the SAME dedupe interface the
 *      live webhook uses (claimWebhookEvent / markEventProcessed /
 *      markEventFailed) with source='reconciler' (ADR-0011). claimWebhookEvent
 *      inserts/updates the processed_webhook_events row, so recovered events are
 *      recorded as processed and are NOT re-replayed on the next hourly pass
 *      (fixes bug B5). We replay ONLY on a clean claim (no prior dedupe row =
 *      true gap); rows that already exist — processed OR in-flight ("retry",
 *      e.g. a live webhook mid-Stripe-retry) — are skipped, because this
 *      backfill writes only the ledger row and never the deferred side effects
 *      (ADR-0019), so it must not mark a live handler's event processed.
 *
 * v1 scope (ADR-0019): the cron writes the MISSING events directly to
 * platform_payment_ledger via the projector + recordLedgerEvent. The downstream
 * business logic (appointment.paymentStatus flip, etc.) is NOT replayed — that
 * requires careful idempotency on every downstream handler. Phase C.1.1 will
 * add full side-effect replay once we have observability data.
 *
 * Result: closes the AVANTEJ REVENUE AUDIT gap (ledger drift) without
 * risking double-side-effects on tenants, and without re-replaying recovered
 * events every hour.
 */

import type Stripe from "stripe";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import {
	projectStripeEventToLedger,
	recordLedgerEvent,
} from "./platform-ledger.service";
import {
	claimWebhookEvent,
	markEventFailed,
	markEventProcessed,
} from "./webhook-dedupe.service";

type CpDb = NeonDatabase<typeof controlPanelSchema>;

const LOOKBACK_HOURS = 24;

export interface RunWebhookBackfillArgs {
	controlPanelDb: CpDb;
	stripe: Pick<Stripe, "events">;
}

export interface BackfillReport {
	acctsScanned: number;
	eventsExamined: number;
	replayed: number;
	alreadyProcessed: number;
	errors: number;
}

/**
 * Runs one backfill pass. Invoked from the wrangler scheduled handler
 * (hourly cron) or manually from the platform-admin admin UI
 * "Run backfill now" button (Phase C.4).
 */
export async function runWebhookBackfill(args: RunWebhookBackfillArgs): Promise<BackfillReport> {
	const { controlPanelDb, stripe } = args;
	const report: BackfillReport = {
		acctsScanned: 0,
		eventsExamined: 0,
		replayed: 0,
		alreadyProcessed: 0,
		errors: 0,
	};

	const cutoff = Math.floor((Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000) / 1000);

	// 1. Connected accounts — events scoped to each acct.
	const acctRows = await controlPanelDb
		.select({
			stripeAccountId: orgCountryStripeAccounts.stripeAccountId,
			organizationId: orgCountryStripeAccounts.organizationId,
		})
		.from(orgCountryStripeAccounts);

	for (const row of acctRows) {
		if (!row.stripeAccountId) continue;
		report.acctsScanned++;
		try {
			await scanAndReplayForAcct(
				stripe,
				controlPanelDb,
				row.stripeAccountId,
				row.organizationId,
				cutoff,
				report,
			);
		} catch (e) {
			report.errors++;
			console.error(
				`[backfill] acct=${row.stripeAccountId} threw:`,
				e instanceof Error ? e.message : e,
			);
		}
	}

	// 2. Platform account — invoice.paid (SaaS revenue).
	try {
		await scanAndReplayForPlatform(stripe, controlPanelDb, cutoff, report);
	} catch (e) {
		report.errors++;
		console.error(`[backfill] platform scan threw:`, e instanceof Error ? e.message : e);
	}

	console.log(`[backfill] complete: ${JSON.stringify(report)}`);
	return report;
}

async function scanAndReplayForAcct(
	stripe: Pick<Stripe, "events">,
	controlPanelDb: CpDb,
	stripeAccount: string,
	organizationId: string,
	cutoff: number,
	report: BackfillReport,
) {
	// Connect-side events: payment_intent.succeeded, charge.refunded,
	// application_fee.created. (invoice.paid lives on platform side.)
	for await (const evt of stripe.events.list(
		{
			type: undefined, // listing all and filtering client-side is more reliable
			created: { gte: cutoff },
			limit: 100,
		},
		{ stripeAccount },
	)) {
		report.eventsExamined++;
		// Ledger membership is owned by the projector (returns null for
		// non-ledger types). Skip BEFORE claiming so the firehose of
		// non-ledger event types never lands in processed_webhook_events.
		if (!projectStripeEventToLedger(evt)) continue;

		const claimed = await claimAndReplay({
			evt,
			controlPanelDb,
			organizationId,
			stripeAccount,
			report,
		});
		if (!claimed) continue;
	}
}

async function scanAndReplayForPlatform(
	stripe: Pick<Stripe, "events">,
	controlPanelDb: CpDb,
	cutoff: number,
	report: BackfillReport,
) {
	for await (const evt of stripe.events.list({
		created: { gte: cutoff },
		limit: 100,
	})) {
		report.eventsExamined++;
		// Membership owned by the projector. On the platform stream this is
		// effectively invoice.paid (saas_invoice_paid); skip everything else
		// before claiming.
		if (!projectStripeEventToLedger(evt)) continue;

		const claimed = await claimAndReplay({
			evt,
			controlPanelDb,
			organizationId: null,
			stripeAccount: null,
			report,
		});
		if (!claimed) continue;
	}
}

/**
 * Claim → replay → mark, routed through the SAME dedupe interface the live
 * webhook uses (ADR-0006), with source='reconciler' (ADR-0011).
 *
 * Returns true if the event was claimed (and a replay was attempted), false if
 * it was already processed (skipped). The processed_webhook_events row is what
 * stops a recovered event from re-replaying on the next hourly pass (bug B5).
 */
async function claimAndReplay(params: {
	evt: Stripe.Event;
	controlPanelDb: CpDb;
	organizationId: string | null;
	stripeAccount: string | null;
	report: BackfillReport;
}): Promise<boolean> {
	const { evt, controlPanelDb, organizationId, stripeAccount, report } = params;

	const claim = await claimWebhookEvent(
		{
			eventId: evt.id,
			eventType: evt.type,
			source: "reconciler",
			stripeAccount,
		},
		controlPanelDb,
	);
	// Only proceed on a CLEAN claim — i.e. the INSERT hit no conflict, meaning
	// no processed_webhook_events row existed and this is a true delivery gap.
	//
	// We deliberately skip "retry" (a row exists with processedAt=null, e.g. a
	// live webhook that claimed the event but then failed in its side-effect
	// block and will be retried by Stripe). The dedupe table is shared with the
	// live handlers; since this backfill replays ONLY the ledger row and NOT the
	// deferred side effects (ADR-0019), marking such an event processed here
	// would suppress Stripe's retry and silently strip the appointment/package/
	// subscription state flip. Residual ledger drift from skipped rows is the
	// C.5 nightly reconciler's job (ADR-0019). This matches the prior
	// hand-rolled behavior (skip on ANY existing dedupe row).
	if (claim.status !== "claimed") {
		report.alreadyProcessed++;
		return false;
	}

	try {
		await replayLedger(evt, organizationId, stripeAccount, controlPanelDb);
		await markEventProcessed(evt.id, controlPanelDb);
		report.replayed++;
	} catch (e) {
		report.errors++;
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(evt.id, msg, controlPanelDb);
		console.error(`[backfill] replay failed for ${evt.id}:`, e);
	}
	return true;
}

/**
 * Project the event to ledger args (shared projector — identical taxonomy +
 * arithmetic to the live webhook) and write the ledger row. The caller has
 * already confirmed the event is ledger-relevant (projector non-null) via the
 * scan loop, so a null here would only occur on a logic error; we no-op safely.
 */
async function replayLedger(
	evt: Stripe.Event,
	organizationId: string | null,
	stripeAccount: string | null,
	controlPanelDb: CpDb,
) {
	const projected = projectStripeEventToLedger(evt);
	if (!projected) return;

	await recordLedgerEvent({
		...projected,
		controlPanelDb,
		organizationId,
		stripeAccount,
	});
}
