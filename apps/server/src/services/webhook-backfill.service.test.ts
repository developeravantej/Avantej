/**
 * Webhook Backfill — Unit Tests (Plan C Phase C.1)
 *
 * The hourly backfill cron replays Stripe events we missed into the platform
 * ledger. Its correctness-critical, bug-prone logic is the per-event-type
 * AMOUNT/KIND mapping in `replayLedger` (refund → amount_refunded, app-fee →
 * amount, pi → amount_received ?? amount) plus the filter + dedupe gates that
 * decide which events become ledger rows.
 *
 * We exercise `runWebhookBackfill` end-to-end with:
 *   - a fake `stripe.events.list` async-iterator (connect vs platform scope)
 *   - a hand-built control-panel DB mock (acct list + dedupe lookups)
 *   - a mocked `recordLedgerEvent` so we can assert the exact ledger payload
 *
 * No live Stripe / Neon. Real network replay is covered by the webhook
 * integration specs.
 *
 * Run: bun test src/services/webhook-backfill.service.test.ts
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";

// --- Mock the ledger writer so we can assert the mapped payload directly. ---
// (mock.module must be registered before importing the service under test.)
const recordLedgerEventMock = mock(async (_args: unknown) => {});
mock.module("./platform-ledger.service", () => ({
	recordLedgerEvent: recordLedgerEventMock,
}));

const { runWebhookBackfill } = await import("./webhook-backfill.service");

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Build an async-iterable over a fixed event list (mimics Stripe pagination). */
function asyncList<T>(items: T[]) {
	return {
		async *[Symbol.asyncIterator]() {
			for (const it of items) yield it;
		},
	};
}

/**
 * Fake control-panel DB.
 *   - select().from(orgCountryStripeAccounts)              → acct rows (awaited)
 *   - select().from(processedWebhookEvents).where().limit() → dedupe rows
 *
 * Dedupe always resolves to "not previously processed" ([]). The drizzle
 * `eq(...)` condition passed to `.where()` is opaque to a plain mock, so the
 * already-processed skip path is exercised in the webhook integration specs,
 * not here. These unit tests focus on filtering + amount/kind mapping, which
 * is where the bug-prone logic lives.
 */
function makeCpDb(opts: {
	accts: { stripeAccountId: string | null; organizationId: string }[];
}) {
	// biome-ignore lint/suspicious/noExplicitAny: stand-in for NeonDatabase
	const db: any = {
		select: () => ({
			from: (table: unknown) => {
				if (table === orgCountryStripeAccounts) {
					// Awaited directly — resolve to acct rows.
					return Promise.resolve(opts.accts);
				}
				// processed_webhook_events dedupe: .where(...).limit(n) → [] (miss)
				return {
					where: () => ({ limit: () => Promise.resolve([]) }),
				};
			},
		}),
	};
	return { db };
}

function piSucceeded(id: string, amount: number) {
	return {
		id,
		type: "payment_intent.succeeded",
		created: 1_750_000_000,
		data: {
			object: { id: `pi_${id}`, amount_received: amount, currency: "MYR" },
		},
	};
}
function chargeRefunded(id: string, refunded: number, appFee = 0) {
	return {
		id,
		type: "charge.refunded",
		created: 1_750_000_000,
		data: {
			object: {
				id: `ch_${id}`,
				amount_refunded: refunded,
				application_fee_amount: appFee,
				currency: "MYR",
			},
		},
	};
}
function appFeeCreated(id: string, amount: number) {
	return {
		id,
		type: "application_fee.created",
		created: 1_750_000_000,
		data: { object: { id: `fee_${id}`, amount, currency: "MYR" } },
	};
}
function noiseEvent(id: string) {
	return {
		id,
		type: "customer.updated", // NOT a ledger event type
		created: 1_750_000_000,
		data: { object: { id: `cus_${id}` } },
	};
}
function invoicePaid(id: string, amountPaid: number) {
	return {
		id,
		type: "invoice.paid",
		created: 1_750_000_000,
		data: {
			object: { id: `in_${id}`, amount_paid: amountPaid, currency: "USD" },
		},
	};
}

beforeEach(() => {
	recordLedgerEventMock.mockClear();
});

describe("runWebhookBackfill — event filtering", () => {
	test("ignores non-ledger event types (e.g. customer.updated)", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: "acct_1", organizationId: "org-1" }],
		});
		const stripe = {
			events: {
				list: (_params: unknown, opts?: { stripeAccount?: string }) =>
					opts?.stripeAccount
						? asyncList([noiseEvent("n1"), piSucceeded("p1", 5000)])
						: asyncList([]),
			},
		};

		const report = await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		expect(report.eventsExamined).toBe(2);
		expect(report.replayed).toBe(1); // only the pi.succeeded
		expect(recordLedgerEventMock).toHaveBeenCalledTimes(1);
	});

	test("skips accounts with a null stripeAccountId", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: null, organizationId: "org-x" }],
		});
		const stripe = {
			events: { list: () => asyncList([]) },
		};

		const report = await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		expect(report.acctsScanned).toBe(0);
	});
});

describe("runWebhookBackfill — ledger amount/kind mapping", () => {
	test("payment_intent.succeeded → kind=pi_succeeded, amount from amount_received, currency lowercased", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: "acct_1", organizationId: "org-1" }],
		});
		const stripe = {
			events: {
				list: (_p: unknown, opts?: { stripeAccount?: string }) =>
					opts?.stripeAccount
						? asyncList([piSucceeded("p1", 7777)])
						: asyncList([]),
			},
		};

		await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		expect(recordLedgerEventMock).toHaveBeenCalledTimes(1);
		const arg = recordLedgerEventMock.mock.calls[0]![0] as Record<
			string,
			unknown
		>;
		expect(arg).toMatchObject({
			eventKind: "pi_succeeded",
			amount: 7777,
			applicationFee: 0,
			currency: "myr", // lowercased from "MYR"
			organizationId: "org-1",
			stripeAccount: "acct_1",
			stripeEventId: "p1",
		});
	});

	test("charge.refunded → kind=pi_refunded, amount from amount_refunded, appFee from application_fee_amount", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: "acct_1", organizationId: "org-1" }],
		});
		const stripe = {
			events: {
				list: (_p: unknown, opts?: { stripeAccount?: string }) =>
					opts?.stripeAccount
						? asyncList([chargeRefunded("r1", 4200, 100)])
						: asyncList([]),
			},
		};

		await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		const arg = recordLedgerEventMock.mock.calls[0]![0] as Record<
			string,
			unknown
		>;
		expect(arg).toMatchObject({
			eventKind: "pi_refunded",
			amount: 4200,
			applicationFee: 100,
		});
	});

	test("application_fee.created → kind=application_fee_collected, amount==appFee==fee amount", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: "acct_1", organizationId: "org-1" }],
		});
		const stripe = {
			events: {
				list: (_p: unknown, opts?: { stripeAccount?: string }) =>
					opts?.stripeAccount
						? asyncList([appFeeCreated("f1", 333)])
						: asyncList([]),
			},
		};

		await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		const arg = recordLedgerEventMock.mock.calls[0]![0] as Record<
			string,
			unknown
		>;
		expect(arg).toMatchObject({
			eventKind: "application_fee_collected",
			amount: 333,
			applicationFee: 333,
		});
	});

	test("platform-side invoice.paid → kind=saas_invoice_paid, null org/account, amount from amount_paid", async () => {
		const { db } = makeCpDb({ accts: [] });
		const stripe = {
			events: {
				list: (_p: unknown, opts?: { stripeAccount?: string }) =>
					// platform scope = no opts.stripeAccount
					opts?.stripeAccount
						? asyncList([])
						: asyncList([invoicePaid("i1", 9900)]),
			},
		};

		const report = await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		expect(report.replayed).toBe(1);
		const arg = recordLedgerEventMock.mock.calls[0]![0] as Record<
			string,
			unknown
		>;
		expect(arg).toMatchObject({
			eventKind: "saas_invoice_paid",
			organizationId: null,
			stripeAccount: null,
			amount: 9900,
			currency: "usd",
		});
	});
});

describe("runWebhookBackfill — resilience", () => {
	test("a throwing account scan increments errors but does not abort the platform scan", async () => {
		const { db } = makeCpDb({
			accts: [{ stripeAccountId: "acct_boom", organizationId: "org-1" }],
		});
		const stripe = {
			events: {
				list: (_p: unknown, opts?: { stripeAccount?: string }) => {
					if (opts?.stripeAccount) {
						throw new Error("stripe down for this acct");
					}
					return asyncList([invoicePaid("i1", 100)]);
				},
			},
		};

		const report = await runWebhookBackfill({
			controlPanelDb: db,
			// biome-ignore lint/suspicious/noExplicitAny: partial Stripe stub
			stripe: stripe as any,
		});

		expect(report.errors).toBeGreaterThanOrEqual(1);
		// Platform scan still ran and replayed the SaaS invoice.
		expect(report.replayed).toBe(1);
	});
});
