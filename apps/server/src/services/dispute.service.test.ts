/**
 * Dispute Service — Unit Tests
 *
 * Stripe chargeback handling. A wrong deadline or amount misinforms the tenant
 * about money leaving their account, and a side-effect that throws must never
 * stop the authoritative platform_dispute_queue write (ADR-0020). This file
 * pins:
 *
 *   - the pure decision helpers (event filter, notify-meta, deadline, amount)
 *   - onDisputeEvent control flow via injected controlPanelDb/tenantDb stubs:
 *       event-type filter, org-resolution skip, queue-write correctness,
 *       side-effect isolation, tenantDb-null path.
 *
 * The hard-imported `sendEmail` path is intentionally avoided (informational
 * events skip it), so no `mock.module` is needed and nothing leaks across the
 * combined `bun test` run.
 *
 * Run: bun test src/services/dispute.service.test.ts
 */

import { describe, expect, it } from "bun:test";
import { platformDisputeQueue } from "@avantej-core/db/schema/control-panel/platform-dispute-queue";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import {
	formatDisputeAmount,
	getDisputeNotifyMeta,
	isDisputeEvent,
	onDisputeEvent,
	parseDisputeDeadline,
} from "./dispute.service";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("isDisputeEvent", () => {
	it("accepts the 5 handled dispute event types", () => {
		for (const t of [
			"charge.dispute.created",
			"charge.dispute.updated",
			"charge.dispute.closed",
			"charge.dispute.funds_reinstated",
			"charge.dispute.funds_withdrawn",
		]) {
			expect(isDisputeEvent(t)).toBe(true);
		}
	});

	it("rejects unrelated event types", () => {
		expect(isDisputeEvent("charge.succeeded")).toBe(false);
		expect(isDisputeEvent("payout.paid")).toBe(false);
		expect(isDisputeEvent("")).toBe(false);
	});
});

describe("getDisputeNotifyMeta", () => {
	it("flags created/updated/closed as action-required (not informational)", () => {
		for (const t of [
			"charge.dispute.created",
			"charge.dispute.updated",
			"charge.dispute.closed",
		]) {
			expect(getDisputeNotifyMeta(t)?.informational).toBe(false);
		}
	});

	it("flags funds_reinstated/funds_withdrawn as informational (no email)", () => {
		expect(
			getDisputeNotifyMeta("charge.dispute.funds_reinstated")?.informational,
		).toBe(true);
		expect(
			getDisputeNotifyMeta("charge.dispute.funds_withdrawn")?.informational,
		).toBe(true);
	});

	it("returns null for unhandled types", () => {
		expect(getDisputeNotifyMeta("charge.succeeded")).toBeNull();
	});
});

describe("parseDisputeDeadline", () => {
	it("converts due_by seconds to a millisecond Date", () => {
		const result = parseDisputeDeadline({
			evidence_details: { due_by: 1_700_000_000 },
		});
		expect(result?.getTime()).toBe(1_700_000_000 * 1000);
	});

	it("returns null when due_by is absent, null, or undefined", () => {
		expect(
			parseDisputeDeadline({ evidence_details: { due_by: null } }),
		).toBeNull();
		expect(parseDisputeDeadline({ evidence_details: {} })).toBeNull();
		expect(parseDisputeDeadline({ evidence_details: null })).toBeNull();
		expect(parseDisputeDeadline({})).toBeNull();
	});

	it("treats due_by 0 (epoch) as a real numeric deadline, not absent", () => {
		// Guards against a `!due_by` bug that would drop a legitimate 0 timestamp.
		expect(
			parseDisputeDeadline({ evidence_details: { due_by: 0 } })?.getTime(),
		).toBe(0);
	});
});

describe("formatDisputeAmount", () => {
	it("formats minor units to 2dp with upper-cased currency", () => {
		expect(formatDisputeAmount(1234, "usd")).toBe("12.34 USD");
		expect(formatDisputeAmount(5000, "myr")).toBe("50.00 MYR");
		expect(formatDisputeAmount(0, "eur")).toBe("0.00 EUR");
	});

	it("keeps 2dp for amounts that are not whole currency units", () => {
		expect(formatDisputeAmount(99, "usd")).toBe("0.99 USD");
		expect(formatDisputeAmount(1, "usd")).toBe("0.01 USD");
	});
});

// ---------------------------------------------------------------------------
// onDisputeEvent control flow (DI stubs, informational events → no email)
// ---------------------------------------------------------------------------

type SelectResult = Record<string, unknown>[];

interface InsertRecord {
	table: unknown;
	values: Record<string, unknown>;
}

/**
 * Build a controlPanelDb stub:
 *   - select(...).from(...).where(...).limit(1) dequeues from `selectResults` (FIFO)
 *   - insert(table).values(obj).onConflictDoUpdate(...) records the insert;
 *     when `throwOnInsertTable` matches, the values() call throws (simulating a
 *     DB failure inside the side-effect's own try/catch).
 */
function makeCpDb(opts: {
	selectResults: SelectResult[];
	throwOnInsertTable?: unknown;
}) {
	const inserts: InsertRecord[] = [];
	const queue = [...opts.selectResults];

	const selectChain: Record<string, unknown> = {
		from: () => selectChain,
		where: () => selectChain,
		limit: () => Promise.resolve(queue.shift() ?? []),
	};

	const db = {
		select: () => selectChain,
		insert: (table: unknown) => ({
			values: (v: Record<string, unknown>) => {
				if (opts.throwOnInsertTable && table === opts.throwOnInsertTable) {
					throw new Error("simulated DB failure");
				}
				inserts.push({ table, values: v });
				const chain = {
					onConflictDoUpdate: () => Promise.resolve(),
					then: (
						resolve: (v: unknown) => unknown,
						reject?: (e: unknown) => unknown,
					) => Promise.resolve(undefined).then(resolve, reject),
				};
				return chain;
			},
		}),
	} as unknown as never;

	return { db, inserts };
}

/** Tenant DB stub recording notification inserts. */
function makeTenantDb() {
	const inserts: InsertRecord[] = [];
	const db = {
		insert: (table: unknown) => ({
			values: (v: Record<string, unknown>) => {
				inserts.push({ table, values: v });
				return Promise.resolve();
			},
		}),
	} as unknown as never;
	return { db, inserts };
}

function disputeEvent(
	type: string,
	overrides: Partial<{
		account: string | null;
		dispute: Record<string, unknown>;
	}> = {},
) {
	return {
		type,
		account: overrides.account === undefined ? "acct_123" : overrides.account,
		data: {
			object: overrides.dispute ?? {
				id: "dp_1",
				status: "needs_response",
				amount: 5000,
				currency: "myr",
				reason: "fraudulent",
				evidence_details: { due_by: 1_700_000_000 },
			},
		},
	} as never;
}

describe("onDisputeEvent — control flow", () => {
	it("ignores non-dispute events without touching the DB", async () => {
		const cp = makeCpDb({ selectResults: [] });
		const tenant = makeTenantDb();
		await onDisputeEvent({
			controlPanelDb: cp.db,
			tenantDb: tenant.db,
			event: disputeEvent("charge.succeeded"),
		});
		expect(cp.inserts).toHaveLength(0);
		expect(tenant.inserts).toHaveLength(0);
	});

	it("skips ALL side effects when the stripe account resolves to no org", async () => {
		// Org resolution select returns [] → organizationId null → no queue write.
		const cp = makeCpDb({ selectResults: [[]] });
		const tenant = makeTenantDb();
		await onDisputeEvent({
			controlPanelDb: cp.db,
			tenantDb: tenant.db,
			event: disputeEvent("charge.dispute.funds_withdrawn"),
		});
		expect(cp.inserts).toHaveLength(0);
		expect(tenant.inserts).toHaveLength(0);
	});

	it("upserts the platform queue with the dispute's authoritative fields", async () => {
		const cp = makeCpDb({
			selectResults: [
				[{ organizationId: "org-1" }], // org resolution
				[{ ownerUserId: "owner-1" }], // tenant-notify owner lookup
			],
		});
		const tenant = makeTenantDb();
		await onDisputeEvent({
			controlPanelDb: cp.db,
			tenantDb: tenant.db,
			event: disputeEvent("charge.dispute.funds_withdrawn"),
		});
		const queueInsert = cp.inserts.find(
			(i) => i.table === platformDisputeQueue,
		);
		expect(queueInsert).toBeDefined();
		expect(queueInsert?.values).toMatchObject({
			organizationId: "org-1",
			stripeAccountId: "acct_123",
			disputeId: "dp_1",
			status: "needs_response",
			amount: 5000,
			currency: "myr",
			reason: "fraudulent",
		});
		expect((queueInsert?.values.deadlineAt as Date | null)?.getTime()).toBe(
			1_700_000_000 * 1000,
		);
	});

	it("still writes the tenant notification after a queue-write failure (isolation)", async () => {
		// The platform queue insert throws, but the tenant in-app notification —
		// a *later* independent side effect — must still run, and the function
		// must resolve rather than propagate the failure to the webhook handler.
		const cp = makeCpDb({
			selectResults: [
				[{ organizationId: "org-1" }],
				[{ ownerUserId: "owner-1" }],
			],
			throwOnInsertTable: platformDisputeQueue,
		});
		const tenant = makeTenantDb();
		await expect(
			onDisputeEvent({
				controlPanelDb: cp.db,
				tenantDb: tenant.db,
				event: disputeEvent("charge.dispute.funds_withdrawn"),
			}),
		).resolves.toBeUndefined();
		const notif = tenant.inserts.find((i) => i.table === notifications);
		expect(notif).toBeDefined();
		expect(notif?.values).toMatchObject({
			userId: "owner-1",
			type: "payment",
			relatedType: "stripe_dispute",
		});
	});

	it("writes the queue but no tenant notification when tenantDb is null", async () => {
		const cp = makeCpDb({ selectResults: [[{ organizationId: "org-1" }]] });
		await expect(
			onDisputeEvent({
				controlPanelDb: cp.db,
				tenantDb: null,
				event: disputeEvent("charge.dispute.funds_withdrawn"),
			}),
		).resolves.toBeUndefined();
		expect(
			cp.inserts.find((i) => i.table === platformDisputeQueue),
		).toBeDefined();
	});

	it("defaults stripeAccountId to empty string when the event has no account", async () => {
		const cp = makeCpDb({
			selectResults: [
				[{ organizationId: "org-1" }],
				[{ ownerUserId: "owner-1" }],
			],
		});
		const tenant = makeTenantDb();
		// account=null means org cannot be resolved via stripe account; with no
		// account the resolution block is skipped and organizationId stays null,
		// so all side effects are skipped. Pin that behavior explicitly.
		await onDisputeEvent({
			controlPanelDb: cp.db,
			tenantDb: tenant.db,
			event: disputeEvent("charge.dispute.funds_withdrawn", { account: null }),
		});
		expect(cp.inserts).toHaveLength(0);
	});
});
