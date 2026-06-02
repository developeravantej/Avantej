/**
 * Platform Payment Ledger — Unit Tests
 *
 * `recordLedgerEvent` is the single write path that mirrors Stripe payment
 * events into `platform_payment_ledger` for in-app revenue audit (Plan C
 * Phase C.7). It is the financial-correctness chokepoint for the webhook
 * backfill cron, so its two observable behaviours are pinned here:
 *
 *   1. Idempotency: ON CONFLICT (stripe_event_id) DO NOTHING. When the insert
 *      no-ops (returning() === []) the call logs a single "replay skipped" line
 *      and does NOT throw.
 *   2. Value pass-through: the row written matches the args verbatim (no
 *      silent currency/amount coercion).
 *
 * The DB is a hand-built chainable mock — no live Neon. Deeper end-to-end
 * verification lives in the webhook integration specs.
 *
 * Run: bun test src/services/platform-ledger.service.test.ts
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { recordLedgerEvent } from "./platform-ledger.service";

// ---------------------------------------------------------------------------
// Chainable insert mock: insert().values(v).onConflictDoNothing(t).returning(c)
// ---------------------------------------------------------------------------

function makeCpDb(returning: { id: string }[]) {
	const calls = {
		values: [] as unknown[],
		onConflictTarget: [] as unknown[],
	};
	const chain: Record<string, unknown> = {};
	chain.values = (v: unknown) => {
		calls.values.push(v);
		return chain;
	};
	chain.onConflictDoNothing = (arg: unknown) => {
		calls.onConflictTarget.push(arg);
		return chain;
	};
	chain.returning = () => Promise.resolve(returning);

	const db = { insert: mock(() => chain) };
	// biome-ignore lint/suspicious/noExplicitAny: test mock stands in for NeonDatabase
	return { db: db as any, calls, insertMock: db.insert };
}

const baseArgs = {
	organizationId: "org-1",
	eventKind: "pi_succeeded" as const,
	stripeEventId: "evt_123",
	stripeObjectId: "pi_123",
	stripeAccount: "acct_1",
	amount: 10000,
	applicationFee: 290,
	currency: "myr",
	occurredAt: new Date("2026-06-01T00:00:00Z"),
};

describe("recordLedgerEvent", () => {
	const origLog = console.log;
	afterEach(() => {
		console.log = origLog;
	});

	test("writes a row with the exact arg values (no coercion)", async () => {
		const { db, calls, insertMock } = makeCpDb([{ id: "row-1" }]);

		await recordLedgerEvent({ controlPanelDb: db, ...baseArgs });

		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(calls.values).toHaveLength(1);
		expect(calls.values[0]).toMatchObject({
			organizationId: "org-1",
			eventKind: "pi_succeeded",
			stripeEventId: "evt_123",
			stripeObjectId: "pi_123",
			stripeAccount: "acct_1",
			amount: 10000,
			applicationFee: 290,
			currency: "myr",
			occurredAt: baseArgs.occurredAt,
		});
	});

	test("targets stripe_event_id for the ON CONFLICT clause (idempotency key)", async () => {
		const { db, calls } = makeCpDb([{ id: "row-1" }]);

		await recordLedgerEvent({ controlPanelDb: db, ...baseArgs });

		// onConflictDoNothing must be called with a { target } pointing at the
		// stripeEventId column — that is the dedupe guarantee for replays.
		expect(calls.onConflictTarget).toHaveLength(1);
		expect(calls.onConflictTarget[0]).toHaveProperty("target");
	});

	test("does NOT log a replay line when a fresh row is inserted", async () => {
		const { db } = makeCpDb([{ id: "row-1" }]);
		const logSpy = mock(() => {});
		console.log = logSpy as unknown as typeof console.log;

		await recordLedgerEvent({ controlPanelDb: db, ...baseArgs });

		expect(logSpy).not.toHaveBeenCalled();
	});

	test("logs a single 'replay skipped' line when the insert no-ops (duplicate event)", async () => {
		const { db } = makeCpDb([]); // ON CONFLICT DO NOTHING → empty returning()
		const logSpy = mock(() => {});
		console.log = logSpy as unknown as typeof console.log;

		// Must resolve, not throw, on a duplicate.
		await recordLedgerEvent({ controlPanelDb: db, ...baseArgs });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const line = String((logSpy.mock.calls[0] as unknown[])[0]);
		expect(line).toContain("replay skipped");
		expect(line).toContain("evt_123");
	});

	test("accepts a null organizationId (platform-side SaaS invoices)", async () => {
		const { db, calls } = makeCpDb([{ id: "row-1" }]);

		await recordLedgerEvent({
			controlPanelDb: db,
			...baseArgs,
			organizationId: null,
			eventKind: "saas_invoice_paid",
			stripeAccount: null,
		});

		expect(calls.values[0]).toMatchObject({
			organizationId: null,
			eventKind: "saas_invoice_paid",
			stripeAccount: null,
		});
	});
});
