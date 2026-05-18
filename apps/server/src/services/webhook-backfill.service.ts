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
 *   2. For each event whose id is NOT in processed_webhook_events,
 *      synthesize a webhook delivery: verify signature was not the gate
 *      (we trust Stripe Connect API), dispatch through our own webhook
 *      handler URL via internal fetch. This routes through the normal
 *      handler path so all side effects + ledger writes fire.
 *
 * v1 simplification: instead of internal fetch, the cron writes the
 * MISSING events directly to platform_payment_ledger via recordLedgerEvent
 * for the 4 ledger-relevant event types. The downstream business logic
 * (appointment.paymentStatus flip, etc.) is NOT replayed in v1 — that
 * requires careful idempotency on every downstream handler. Phase C.1.1
 * will add full replay once we have observability data on what types
 * of events get dropped.
 *
 * Result: v1 closes the AVANTEJ REVENUE AUDIT gap (ledger drift) without
 * risking double-side-effects on tenants.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { recordLedgerEvent } from "./platform-ledger.service";

type CpDb = NeonDatabase<typeof controlPanelSchema>;

const LEDGER_EVENT_TYPES: Stripe.Event["type"][] = [
	"payment_intent.succeeded",
	"charge.refunded",
	"application_fee.created",
	"invoice.paid",
];

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
		if (!LEDGER_EVENT_TYPES.includes(evt.type)) continue;

		const dedupe = await controlPanelDb
			.select({ eventId: processedWebhookEvents.eventId })
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, evt.id))
			.limit(1);
		if (dedupe.length > 0) {
			report.alreadyProcessed++;
			continue;
		}

		try {
			await replayLedger(evt, organizationId, stripeAccount, controlPanelDb);
			report.replayed++;
		} catch (e) {
			report.errors++;
			console.error(`[backfill] replay failed for ${evt.id}:`, e);
		}
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
		if (evt.type !== "invoice.paid") continue;

		const dedupe = await controlPanelDb
			.select({ eventId: processedWebhookEvents.eventId })
			.from(processedWebhookEvents)
			.where(eq(processedWebhookEvents.eventId, evt.id))
			.limit(1);
		if (dedupe.length > 0) {
			report.alreadyProcessed++;
			continue;
		}

		try {
			const inv = evt.data.object as Stripe.Invoice;
			await recordLedgerEvent({
				controlPanelDb,
				organizationId: null,
				eventKind: "saas_invoice_paid",
				stripeEventId: evt.id,
				stripeObjectId: inv.id ?? "",
				stripeAccount: null,
				amount: inv.amount_paid ?? 0,
				applicationFee: 0,
				currency: (inv.currency ?? "usd").toLowerCase(),
				occurredAt: new Date(evt.created * 1000),
			});
			report.replayed++;
		} catch (e) {
			report.errors++;
			console.error(`[backfill] platform replay failed for ${evt.id}:`, e);
		}
	}
}

async function replayLedger(
	evt: Stripe.Event,
	organizationId: string,
	stripeAccount: string,
	controlPanelDb: CpDb,
) {
	const obj = evt.data.object as Stripe.PaymentIntent | Stripe.Charge | Stripe.ApplicationFee;
	const isRefund = evt.type === "charge.refunded";
	const isAppFee = evt.type === "application_fee.created";

	let kind: "pi_succeeded" | "pi_refunded" | "application_fee_collected";
	let amount = 0;
	let appFee = 0;

	if (isAppFee) {
		kind = "application_fee_collected";
		amount = (obj as Stripe.ApplicationFee).amount;
		appFee = (obj as Stripe.ApplicationFee).amount;
	} else if (isRefund) {
		kind = "pi_refunded";
		amount = (obj as Stripe.Charge).amount_refunded ?? 0;
		appFee = (obj as Stripe.Charge).application_fee_amount ?? 0;
	} else {
		kind = "pi_succeeded";
		amount =
			(obj as Stripe.PaymentIntent).amount_received ?? (obj as Stripe.PaymentIntent).amount ?? 0;
		appFee = 0;
	}

	await recordLedgerEvent({
		controlPanelDb,
		organizationId,
		eventKind: kind,
		stripeEventId: evt.id,
		stripeObjectId: obj.id,
		stripeAccount,
		amount,
		applicationFee: appFee,
		currency: ((obj as { currency?: string }).currency ?? "usd").toLowerCase(),
		occurredAt: new Date(evt.created * 1000),
	});
}
